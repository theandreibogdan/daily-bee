import { describe, expect, it } from 'vitest';
import type { AwayPrompt, Entry, SessionTask, TaskRef } from '../../shared/types';
import { dayKey } from '../../shared/time';
import type { Repo } from '../repo';
import { AwayService, MIN_AWAY_SECONDS, type AwayDecision } from '../services/away';
import { SessionService } from '../services/session';
import { DEFAULT_SETTINGS, deepMerge, type SettingsService } from '../services/settings';

const TASK: SessionTask = { task: 'Timer sync', goal: '', size: 'Large', project: 'api', ref: null, mood: 'Focused' };
const SEC = 1000;
const T0 = Date.parse('2026-09-08T10:00:00');

function fakeRepo() {
  const kv = new Map<string, string>();
  const entries: Entry[] = [];
  const tasks: TaskRef[] = [];
  const repo = {
    getKv: <T>(k: string, fallback: T): T => (kv.has(k) ? (JSON.parse(kv.get(k)!) as T) : fallback),
    setKv: (k: string, v: unknown) => { kv.set(k, JSON.stringify(v)); },
    lastSampleTs: () => null,
    tasks: () => tasks,
    saveTask: (t: TaskRef) => { tasks.push(t); },
    entriesForDay: (day: string) => entries.filter((e) => e.day === day),
    upsertEntry: (e: Entry) => { const i = entries.findIndex((x) => x.id === e.id); if (i >= 0) entries[i] = e; else entries.push(e); },
    entry: (id: string) => entries.find((e) => e.id === id),
  };
  return { repo: repo as unknown as Repo, entries };
}

function harness(awayPrompt = true) {
  const { repo, entries } = fakeRepo();
  const settings = { get: () => deepMerge(DEFAULT_SETTINGS, { tracking: { awayPrompt } }) } as unknown as SettingsService;
  let now = T0;
  const session = new SessionService(repo, settings, { recover: 'stop' }, 0);
  const away = new AwayService(session, settings, () => now);
  const prompts: Array<AwayPrompt | null> = [];
  const decisions: AwayDecision[] = [];
  away.on('prompt', (p: AwayPrompt | null) => prompts.push(p));
  away.on('decided', (d: AwayDecision) => decisions.push(d));
  session.start(TASK, T0);
  /** The presence sequence: idle since `since`, noticed later, back at `back`. */
  const leaveAndReturn = (since: number, back: number, reason: 'idle' | 'lock' | 'sleep' = 'idle') => {
    session.pause(reason, since);
    away.onAway({ reason, since });
    session.resume(back);
    now = back;
    return away.onBack(back);
  };
  return { session, away, entries, prompts, decisions, leaveAndReturn, setNow: (t: number) => { now = t; } };
}

describe('AwayService', () => {
  it('asks after a stretch away, with the timer reading from the moment you left', () => {
    const h = harness();
    const p = h.leaveAndReturn(T0 + 600 * SEC, T0 + 1500 * SEC);
    expect(p).toMatchObject({ task: 'Timer sync', reason: 'idle', since: T0 + 600 * SEC, until: T0 + 1500 * SEC, seconds: 900, activeSeconds: 600, startedAt: T0 });
    expect(h.away.get()).toBe(p);
    expect(h.prompts).toEqual([p]);
    // The timer already left the away stretch out and is running again.
    expect(h.session.elapsedSeconds(T0 + 1560 * SEC)).toBe(660);
  });

  it('"leave it out" changes nothing; "count it as work" puts the stretch back', () => {
    const h = harness();
    const p = h.leaveAndReturn(T0 + 600 * SEC, T0 + 1500 * SEC)!;
    expect(h.away.choose(p.id, 'discard')).toBe(p);
    expect(h.session.elapsedSeconds(T0 + 1500 * SEC)).toBe(600);
    expect(h.away.get()).toBeNull();
    expect(h.away.choose(p.id, 'keep')).toBeNull(); // already answered
    const q = h.leaveAndReturn(T0 + 2000 * SEC, T0 + 2300 * SEC)!;
    expect(h.away.choose(q.id, 'keep')).toBe(q);
    expect(h.session.elapsedSeconds(T0 + 2300 * SEC)).toBe(600 + 500 + 300); // first stretch, the stretch before leaving, the away counted
    expect(h.session.elapsedSeconds(T0 + 2600 * SEC)).toBe(1700); // and it keeps running
    expect(h.decisions.map((d) => d.choice)).toEqual(['discard', 'keep']);
    expect(h.prompts.at(-1)).toBeNull();
  });

  it('"stop when I left" saves the entry with the reading from that moment, on that day', () => {
    const h = harness();
    const p = h.leaveAndReturn(T0 + 600 * SEC, T0 + 1500 * SEC)!;
    h.setNow(T0 + 1700 * SEC); // two minutes of work since coming back, not counted
    const r = h.away.stop(p.id, { summary: 'left for lunch', outcome: 'Partly done', sizeCheck: 'Large', blocker: false });
    expect(r?.entry).toMatchObject({ task: 'Timer sync', seconds: 600, day: dayKey(T0 + 600 * SEC), summary: 'left for lunch' });
    expect(r?.session.running).toBe(false);
    expect(h.entries).toHaveLength(1);
    expect(h.decisions.at(-1)?.choice).toBe('stop');
  });

  it('stays quiet for short stretches, when the setting is off, and when nothing was running', () => {
    expect(harness().leaveAndReturn(T0 + 600 * SEC, T0 + 600 * SEC + (MIN_AWAY_SECONDS - 1) * SEC)).toBeNull();
    expect(harness(false).leaveAndReturn(T0 + 600 * SEC, T0 + 3000 * SEC)).toBeNull();
    const h = harness();
    h.session.stop({ summary: '', outcome: 'Done', sizeCheck: 'Large', blocker: false }, T0 + 100 * SEC);
    h.away.onAway({ reason: 'lock', since: T0 + 200 * SEC });
    expect(h.away.onBack(T0 + 900 * SEC)).toBeNull();
    expect(h.away.onBack(T0 + 900 * SEC)).toBeNull(); // no "away" before it
  });

  it('a stop or a new task makes the question moot', () => {
    const h = harness();
    const p = h.leaveAndReturn(T0 + 600 * SEC, T0 + 1500 * SEC)!;
    h.session.start({ ...TASK, task: 'Other' }, T0 + 1600 * SEC);
    expect(h.away.get()).toBeNull();
    expect(h.prompts).toEqual([p, null]);
    expect(h.away.choose(p.id, 'keep')).toBeNull();
    const q = h.leaveAndReturn(T0 + 2000 * SEC, T0 + 2400 * SEC)!;
    h.session.stop({ summary: '', outcome: 'Done', sizeCheck: 'Large', blocker: false }, T0 + 2500 * SEC);
    expect(h.away.get()).toBeNull();
    expect(h.away.stop(q.id, { summary: '', outcome: 'Done', sizeCheck: 'Large', blocker: false })).toBeNull();
  });
});
