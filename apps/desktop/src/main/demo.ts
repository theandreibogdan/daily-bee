import type { WindowSample } from '@dailybee/tracker';
import { KIT_CURRENT_TASK, KIT_ENTRIES, KIT_TIMELINE, PROJECTS, TASKS } from '../shared/fake';
import type { Checkin, Entry, ReportDraft } from '../shared/types';
import { atTime, dayKey, dayLabel } from '../shared/time';
import type { Repo } from './repo';
import type { SessionService } from './services/session';
import type { TrackerService } from './services/tracker';

/** Fake seed data — mirrors design_system/ui_kits/app/data.js (shared with the renderer mock). */
export { PROJECTS, TASKS };
const ENTRIES = KIT_ENTRIES;
const TIMELINE = KIT_TIMELINE;

type Pool = Array<{ weight: number; sample: Omit<WindowSample, 'ts' | 'idle'> }>;
const chrome = (url: string, pageTitle: string): Omit<WindowSample, 'ts' | 'idle'> => ({ app: 'Google Chrome', process: 'chrome', title: pageTitle + ' - Google Chrome', url, pageTitle, browser: 'chrome', urlSource: 'accessibility' });
const app = (name: string, process: string, title: string): Omit<WindowSample, 'ts' | 'idle'> => ({ app: name, process, title, url: null, pageTitle: null, browser: null, urlSource: 'none' });

const POOLS: Record<string, Pool> = {
  work: [
    { weight: 2580, sample: app('VS Code', 'Code', 'timer-sync.ts — api-gateway - Visual Studio Code') },
    { weight: 720, sample: chrome('https://github.com/dailybee/api/pull/412', 'PR #412 rate limiter · dailybee/api') },
    { weight: 120, sample: chrome('https://github.com/dailybee/api/actions', 'Actions · dailybee/api') },
    { weight: 780, sample: app('Windows Terminal', 'WindowsTerminal', 'pnpm test --watch') },
  ],
  research: [
    { weight: 420, sample: chrome('https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API', 'Web Locks API - Web APIs | MDN') },
    { weight: 240, sample: chrome('https://stackoverflow.com/q/71882', 'Coordinating tabs with Web Locks - Stack Overflow') },
  ],
  communication: [{ weight: 420, sample: app('Slack', 'slack', '#eng-daily, DM Jack - Slack') }],
  distraction: [{ weight: 540, sample: chrome('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Rust for TS devs — talk') }],
  learning: [{ weight: 300, sample: chrome('https://frontendmasters.com/courses/rust-ts', 'Rust for TypeScript Developers - Frontend Masters') }],
};

function* weightedCycle(pool: Pool): Generator<Omit<WindowSample, 'ts' | 'idle'>> {
  const total = pool.reduce((a, p) => a + p.weight, 0);
  const counts = pool.map(() => 0);
  let n = 0;
  while (true) {
    // pick the entry furthest below its target share
    let best = 0, bestGap = -Infinity;
    pool.forEach((p, i) => { const gap = (p.weight / total) * (n + 1) - counts[i]!; if (gap > bestGap) { bestGap = gap; best = i; } });
    counts[best]!++; n++;
    yield pool[best]!.sample;
  }
}

/** After the kit's last segment the day continues with this block pattern (minutes). */
const EXTEND: Array<[string, number]> = [['work', 35], ['research', 10], ['work', 40], ['communication', 8], ['work', 30], ['distraction', 6], ['learning', 5], ['work', 45], ['break', 15]];

/**
 * Seeds one day of fake samples, entries and check-ins. Idempotent per day: on later launches the
 * same day it only tops up samples from the last seeded timestamp to now, so the demo stays live.
 */
export function seedDemo(repo: Repo, tracker: TrackerService, session: SessionService, now = Date.now()): void {
  const day = dayKey(now);
  const interval = tracker.intervalSec;
  const gens = new Map<string, Generator<Omit<WindowSample, 'ts' | 'idle'>>>();
  const next = (cat: string) => { let g = gens.get(cat); if (!g) { g = weightedCycle(POOLS[cat] ?? POOLS.work!); gens.set(cat, g); } return g.next().value; };
  const emit = (ts: number, cat: string) => {
    if (cat === 'break') { tracker.ingest({ ...app('Finder', 'finder', ''), ts, idle: true }, true); return; }
    tracker.ingest({ ...next(cat), ts }, true); // the kit's day is all inside the running task
  };
  const extend = (from: number, blockIndex: number) => {
    let ts = from, i = blockIndex;
    while (ts < now) {
      const [cat, minutes] = EXTEND[i % EXTEND.length]!;
      const e = Math.min(now, ts + minutes * 60 * 1000);
      for (; ts < e; ts += interval * 1000) emit(ts, cat);
      if (ts >= now) break; // block cut short by "now": continue it on the next launch
      i++;
    }
    repo.setKv('demo-until', now);
    repo.setKv('demo-block', i);
  };
  if (repo.getKv<string>('demo-seeded', '') === day) {
    const until = repo.getKv<number>('demo-until', 0);
    if (until && now - until > interval * 1000) extend(until, repo.getKv<number>('demo-block', 0));
    // The kit's running task, "80 minutes in", on every launch (the previous run was dropped at startup).
    if (!session.get().running) session.start(KIT_CURRENT_TASK, now - 4863 * 1000);
    tracker.emitSummary();
    return;
  }
  // First run, or a new day: the kit's story starts over. A running task left from yesterday
  // would otherwise keep its timer (25 h and counting), so it is dropped without an entry.
  if (session.get().running) session.discard();
  repo.deleteSamplesForDay(day); // re-seeding must not double today's samples
  let lastEnd = 0;
  for (const [start, cat, minutes] of TIMELINE) {
    const s = atTime(start, day);
    if (s > now) break;
    const e = Math.min(now, s + minutes * 60 * 1000);
    for (let ts = s; ts < e; ts += interval * 1000) emit(ts, cat);
    lastEnd = e;
  }
  // Keep the day alive: after the kit's last segment, repeat a believable block pattern up to now.
  if (lastEnd && now - lastEnd > interval * 1000) extend(lastEnd, 0);
  else repo.setKv('demo-until', now);
  for (const [task, ref, project, start, seconds, done] of ENTRIES) {
    const e: Entry = { id: 'demo-' + ref, day, task, ref, project, startTs: atTime(start, day), start, seconds, done, size: TASKS.find((t) => t.id === ref)?.size };
    repo.upsertEntry(e);
  }
  const c1: Checkin = { id: 'demo-c1', day, ts: atTime('10:33', day), at: '10:33', kind: 'drift', text: 'You have been on youtube.com for 9 minutes. Still on “Timer sync across devices”?', answer: 'break', task: 'Timer sync across devices', domain: 'youtube.com' };
  const c2: Checkin = { id: 'demo-c2', day, ts: atTime('11:00', day), at: '11:00', kind: 'pulse', text: 'Halfway through your estimate. How is it going?', answer: 'On track', task: 'Timer sync across devices', domain: null };
  repo.upsertCheckin(c1);
  repo.upsertCheckin(c2);
  if (repo.taskCount() === 0) for (const t of TASKS) repo.saveTask(t);
  if (repo.projects().length === 0) repo.saveProjects(PROJECTS);
  // Four past reports for the History tab.
  const past: Array<[number, number, number]> = [[3, 28500, 5], [4, 29400, 6], [5, 23100, 4], [6, 28200, 5]];
  for (const [daysAgo, tracked, entries] of past) {
    const d = dayKey(now - daysAgo * 86400000);
    if (repo.report(d)) continue;
    const draft: ReportDraft = { day: d, label: dayLabel(d), summary: { tracked, focus: 70 + daysAgo, done: entries - 1, total: entries, checkins: 2, distraction: 6 }, shipped: [], inProgress: [], mix: [62, 12, 7, 13, 6], narrative: 'Mostly VS Code and GitHub.', blockers: '', notes: '', markdown: '', status: 'sent', sentAt: atTime('18:00', d), recipients: '#eng-daily · 4 teammates', topApps: ['VS Code', 'GitHub'] };
    repo.saveReport(draft);
  }
  // Running session like the kit: "Timer sync across devices", 4863s in.
  session.start(KIT_CURRENT_TASK, now - 4863 * 1000);
  repo.setKv('demo-seeded', day);
  tracker.emitSummary();
}
