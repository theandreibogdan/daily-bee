import { describe, expect, it } from 'vitest';
import type { Entry, RecentTask, TaskRef } from '../../shared/types';
import type { Repo } from '../repo';
import { QuickActions } from '../services/quick';
import { SessionService } from '../services/session';
import { DEFAULT_SETTINGS, type SettingsService } from '../services/settings';

const SEC = 1000;
const T0 = Date.parse('2026-09-08T10:00:00');

/** The parts of Repo the session and the quick actions use, in memory; recentTasks mirrors the SQL (distinct by task, newest first). */
function fakeRepo() {
  const kv = new Map<string, string>();
  const entries: Entry[] = [];
  const tasks: TaskRef[] = [];
  const repo = {
    getKv: <T>(k: string, fallback: T): T => (kv.has(k) ? (JSON.parse(kv.get(k)!) as T) : fallback),
    setKv: (k: string, v: unknown) => { kv.set(k, JSON.stringify(v)); },
    lastSampleTs: () => null,
    tasks: () => tasks,
    saveTask: (t: TaskRef) => { const i = tasks.findIndex((x) => x.id === t.id); if (i >= 0) tasks[i] = t; else tasks.push(t); },
    entriesForDay: (day: string) => entries.filter((e) => e.day === day),
    upsertEntry: (e: Entry) => { const i = entries.findIndex((x) => x.id === e.id); if (i >= 0) entries[i] = e; else entries.push(e); },
    entry: (id: string) => entries.find((e) => e.id === id),
    recentTasks: (sinceTs: number, limit: number): RecentTask[] => {
      const byTask = new Map<string, RecentTask>();
      for (const e of [...entries].filter((x) => x.startTs >= sinceTs).sort((a, b) => b.startTs - a.startTs)) {
        const cur = byTask.get(e.task);
        if (cur) cur.seconds += e.seconds;
        else byTask.set(e.task, { task: e.task, project: e.project, size: e.size ?? 'Medium', goal: e.goal ?? '', ref: e.ref, lastTs: e.startTs, seconds: e.seconds });
      }
      return [...byTask.values()].slice(0, limit);
    },
  };
  return { repo: repo as unknown as Repo, entries };
}
const settings = { get: () => DEFAULT_SETTINGS } as unknown as SettingsService;

describe('QuickActions (tray and global shortcut)', () => {
  it('resumes the last task as it was, and stops with no questions', () => {
    const { repo, entries } = fakeRepo();
    let now = T0;
    const session = new SessionService(repo, settings, { recover: 'stop' }, 0);
    const quick = new QuickActions(repo, session, () => now);
    const events: string[] = [];
    quick.on('started', (t: RecentTask) => events.push('started ' + t.task));
    quick.on('stopped', ({ entry, seconds }: { entry: Entry; seconds: number }) => events.push('stopped ' + entry.task + ' ' + seconds));
    expect(quick.last()).toBeNull();
    expect(quick.resumeLast()).toBeNull();
    expect(quick.stopNow()).toBeNull();
    expect(quick.toggle()).toBe('dialog');

    session.start({ task: 'Timer sync', goal: 'ship it', size: 'Large', project: 'api', ref: 'DB-1', mood: 'Focused' }, now);
    now += 600 * SEC;
    expect(quick.toggle()).toBe('stopped');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ task: 'Timer sync', seconds: 600, outcome: 'Partly done', summary: '' });
    expect(session.get().running).toBe(false);

    now += 3600 * SEC;
    expect(quick.last()).toMatchObject({ task: 'Timer sync', project: 'api', size: 'Large', goal: 'ship it', ref: 'DB-1', seconds: 600 });
    expect(quick.toggle()).toBe('started');
    expect(session.get().current).toMatchObject({ task: 'Timer sync', project: 'api', size: 'Large', goal: 'ship it', ref: 'DB-1' });
    expect(events).toEqual(['stopped Timer sync 600', 'started Timer sync']);
  });

  it('lists recent tasks once each, newest first, within two weeks', () => {
    const { repo } = fakeRepo();
    let now = T0;
    const session = new SessionService(repo, settings, { recover: 'stop' }, 0);
    const quick = new QuickActions(repo, session, () => now);
    for (const [task, days] of [['Old', 20], ['A', 3], ['B', 2], ['A', 1]] as Array<[string, number]>) {
      now = T0 - days * 86_400_000;
      session.start({ task, goal: '', size: 'Small', project: 'web', ref: null, mood: 'Focused' }, now);
      quick.stopNow();
    }
    now = T0;
    expect(quick.recent().map((t) => t.task)).toEqual(['A', 'B']);
    expect(quick.recent(1).map((t) => t.task)).toEqual(['A']);
  });
});
