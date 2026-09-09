import { describe, expect, it } from 'vitest';
import type { Entry, Session, SessionTask, TaskRef } from '../../shared/types';
import { elapsedSeconds } from '../../shared/session';
import { roundEntrySeconds } from '../../shared/time';
import type { Repo } from '../repo';
import { SessionService, restoreSession } from '../services/session';
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
    const svc = new SessionService(repo, settings, 0);
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
    const svc = new SessionService(repo, settings, 0);
    const t0 = 1_000_000;
    svc.start(TASK, t0);
    svc.pause('idle', t0 - 500 * SEC); // idle "since" before the task started
    expect(svc.get().banked).toBe(0);
    expect(svc.elapsedSeconds(t0 + 100 * SEC)).toBe(0);
  });
});

describe('restoreSession (launch after a quit, kill or crash)', () => {
  const t0 = Date.parse('2026-09-08T10:00:00');
  const persisted: Session = { running: true, startedAt: t0, current: TASK, banked: 100, activeSince: t0 + 100 * SEC, paused: null };

  it('banks the interrupted stretch only up to the last heartbeat or sample, then resumes now', () => {
    const now = t0 + 3600 * SEC;
    const s = restoreSession(persisted, t0 + 400 * SEC, now);
    expect(s.banked).toBe(400);
    expect(s.activeSince).toBe(now);
    expect(elapsedSeconds(s, now + 10 * SEC)).toBe(410);
    // The heartbeat comes from the repo: kv "session-seen" or the newest sample, whichever is later.
    const { repo } = fakeRepo({ session: persisted, 'session-seen': t0 + 300 * SEC }, t0 + 700 * SEC);
    expect(new SessionService(repo, settings, now).elapsedSeconds(now)).toBe(700);
  });

  it('keeps a paused run paused-free at launch and upgrades sessions saved without active-time fields', () => {
    const now = t0 + 3600 * SEC;
    const paused = restoreSession({ ...persisted, activeSince: null, paused: { reason: 'offline', since: t0 + 500 * SEC } }, 0, now);
    expect(paused.banked).toBe(100);
    expect(paused.activeSince).toBe(now);
    const legacy = restoreSession({ running: true, startedAt: t0, current: TASK } as Partial<Session>, t0 + 250 * SEC, now);
    expect(legacy.banked).toBe(250);
    expect(restoreSession({ running: false }, 0, now).running).toBe(false);
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
