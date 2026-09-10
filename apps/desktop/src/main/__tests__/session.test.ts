import { describe, expect, it } from 'vitest';
import type { Entry, Session, SessionTask, TaskRef } from '../../shared/types';
import { elapsedSeconds } from '../../shared/session';
import { dayKey, roundEntrySeconds } from '../../shared/time';
import type { Repo } from '../repo';
import { SessionService, settleSession } from '../services/session';
import { DEFAULT_SETTINGS, type SettingsService } from '../services/settings';

const TASK: SessionTask = { task: 'Timer sync', goal: '', size: 'Large', project: 'api', ref: null, mood: 'Focused' };
const SEC = 1000;

/** In-memory stand-in for the parts of Repo the session touches. */
function fakeRepo(seed: Record<string, unknown> = {}, lastSample: number | null = null) {
  const kv = new Map<string, string>(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  const entries: Entry[] = [];
  const tasks: TaskRef[] = [];
  const repo = {
    getKv: <T>(k: string, fallback: T): T => (kv.has(k) ? (JSON.parse(kv.get(k)!) as T) : fallback),
    setKv: (k: string, v: unknown) => { kv.set(k, JSON.stringify(v)); },
    lastSampleTs: () => lastSample,
    tasks: () => tasks,
    saveTask: (t: TaskRef) => { tasks.push(t); },
    entriesForDay: (day: string) => entries.filter((e) => e.day === day),
    upsertEntry: (e: Entry) => { const i = entries.findIndex((x) => x.id === e.id); if (i >= 0) entries[i] = e; else entries.push(e); },
    entry: (id: string) => entries.find((e) => e.id === id),
  };
  return { repo: repo as unknown as Repo, kv, entries };
}
const settings = { get: () => DEFAULT_SETTINGS } as unknown as SettingsService;

describe('SessionService counts active time only', () => {
  it('takes idle stretches off the clock retroactively and saves exact seconds', () => {
    const { repo, entries } = fakeRepo();
    const svc = new SessionService(repo, settings, { recover: 'stop' }, 0);
    const t0 = Date.parse('2026-09-08T10:00:00');
    svc.start(TASK, t0);
    expect(svc.elapsedSeconds(t0 + 600 * SEC)).toBe(600);
    // Idle detected at +20 min; the last input was at +10 min.
    svc.pause('idle', t0 + 600 * SEC);
    expect(svc.get().paused?.reason).toBe('idle');
    expect(svc.elapsedSeconds(t0 + 1200 * SEC)).toBe(600);
    svc.pause('lock', t0 + 1300 * SEC); // already paused: no-op
    expect(svc.get().paused?.reason).toBe('idle');
    svc.resume(t0 + 1300 * SEC);
    expect(svc.get().paused).toBeNull();
    expect(svc.elapsedSeconds(t0 + 1400 * SEC)).toBe(700);
    const { entry, session } = svc.stop({ summary: 'done', outcome: 'Done', sizeCheck: 'Large', blocker: false }, t0 + 1400 * SEC);
    expect(entry.seconds).toBe(700); // no 5-minute rounding in the stored entry
    expect(entries[0]?.seconds).toBe(700);
    expect(session.running).toBe(false);
    expect(elapsedSeconds(session, t0 + 9999 * SEC)).toBe(0);
  });

  it('never banks time before the active stretch began', () => {
    const { repo } = fakeRepo();
    const svc = new SessionService(repo, settings, { recover: 'stop' }, 0);
    const t0 = 1_000_000;
    svc.start(TASK, t0);
    svc.pause('idle', t0 - 500 * SEC); // idle "since" before the task started
    expect(svc.get().banked).toBe(0);
    expect(svc.elapsedSeconds(t0 + 100 * SEC)).toBe(0);
  });

  it('quitting the app stops the run and saves it as partly done', () => {
    const { repo, entries } = fakeRepo();
    const svc = new SessionService(repo, settings, { recover: 'stop' }, 0);
    const t0 = Date.parse('2026-09-08T10:00:00');
    svc.start(TASK, t0);
    const closed = svc.stopOnQuit(t0 + 90 * SEC);
    expect(closed?.seconds).toBe(90);
    expect(closed?.outcome).toBe('Partly done');
    expect(entries).toHaveLength(1);
    expect(svc.get().running).toBe(false);
    expect(svc.stopOnQuit()).toBeNull();
  });
});

describe('a run found open at launch (crash, kill or shutdown)', () => {
  const t0 = Date.parse('2026-09-08T10:00:00');
  const persisted: Session = { running: true, startedAt: t0, current: TASK, banked: 100, activeSince: t0 + 100 * SEC, paused: null };

  it('settles the interrupted stretch only up to the last heartbeat or sample', () => {
    const now = t0 + 3600 * SEC;
    const s = settleSession(persisted, t0 + 400 * SEC, now);
    expect(s.banked).toBe(400);
    expect(s.activeSince).toBeNull();
    expect(s.paused?.since).toBe(t0 + 400 * SEC);
    const legacy = settleSession({ running: true, startedAt: t0, current: TASK } as Partial<Session>, t0 + 250 * SEC, now);
    expect(legacy.banked).toBe(250);
    expect(settleSession({ running: false }, 0, now).running).toBe(false);
  });

  it('is closed into an entry on the day it started, with the settled time, and reported', () => {
    const now = t0 + 26 * 3600 * SEC; // next day
    // "last seen" is the later of the heartbeat and the newest sample.
    const { repo, entries } = fakeRepo({ session: persisted, 'session-seen': t0 + 300 * SEC }, t0 + 700 * SEC);
    const svc = new SessionService(repo, settings, { recover: 'stop' }, now);
    expect(svc.get().running).toBe(false);
    expect(svc.recovered).toEqual({ task: 'Timer sync', seconds: 700, day: dayKey(t0) });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ task: 'Timer sync', seconds: 700, outcome: 'Partly done', done: false, day: dayKey(t0) });
    expect(repo.getKv<Session>('session', persisted).running).toBe(false);
  });

  it('is simply dropped in demo mode', () => {
    const { repo, entries } = fakeRepo({ session: persisted }, t0 + 700 * SEC);
    const svc = new SessionService(repo, settings, { recover: 'discard' }, t0 + 3600 * SEC);
    expect(svc.get().running).toBe(false);
    expect(svc.recovered).toBeNull();
    expect(entries).toHaveLength(0);
  });
});

describe('roundEntrySeconds (report only)', () => {
  it('rounds to 5 minutes with a 5-minute floor when enabled, exact otherwise', () => {
    expect(roundEntrySeconds(40, true)).toBe(300);
    expect(roundEntrySeconds(449, true)).toBe(300);
    expect(roundEntrySeconds(450, true)).toBe(600);
    expect(roundEntrySeconds(0, true)).toBe(0);
    expect(roundEntrySeconds(40, false)).toBe(40);
  });
});
