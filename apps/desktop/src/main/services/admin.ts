import { CATEGORIES, type Category } from '@dailybee/tracker';
import type { AdminData, AdminPerson, AdminProject } from '../../shared/team';
import type { Entry, Project, TaskRef } from '../../shared/types';

/**
 * Admin for one person: the same figures the workspace API computes for a team, built from this
 * device's own days, entries, tasks and projects. Pure so it can be tested without a database.
 */

export type AdminRange = 'week' | 'month' | 'quarter';

export interface LocalDay {
  day: string;
  trackedSeconds: number;
  /** seconds per category (digest mix) */
  mixSeconds: Record<Category, number>;
  topApps: string[];
  reportStatus: 'draft' | 'sent' | null;
}

export interface LocalAdminInput {
  today: string;
  range: AdminRange;
  /** Every day from the previous period's start to today (missing days are simply absent) */
  days: LocalDay[];
  /** Entries inside the current period */
  entries: Entry[];
  tasks: TaskRef[];
  projects: Project[];
  me: { name: string; initials: string; team: string };
  policy: Array<[string, boolean]>;
}

// ---- day-key arithmetic (local calendar, no Date timezone surprises) ----------------------
const parse = (d: string): Date => { const [y, m, dd] = d.split('-').map(Number); return new Date(y!, m! - 1, dd!); };
const key = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDaysKey = (d: string, n: number): string => { const x = parse(d); x.setDate(x.getDate() + n); return key(x); };
export const isWeekdayKey = (d: string): boolean => { const w = parse(d).getDay(); return w !== 0 && w !== 6; };
export const weekStartKey = (d: string): string => { const x = parse(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return key(x); };
export function daysBetweenKeys(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysKey(d, 1)) out.push(d);
  return out;
}

/** Period bounds: week = Monday to today; month/quarter = the last 30/90 days. `prevFrom` starts the comparison period. */
export function rangeBounds(today: string, range: AdminRange): { from: string; prevFrom: string; span: number; weeks: number } {
  const span = range === 'week' ? 7 : range === 'month' ? 30 : 90;
  const from = range === 'week' ? weekStartKey(today) : addDaysKey(today, -(span - 1));
  return { from, prevFrom: addDaysKey(from, -span), span, weeks: span / 7 };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

function mixPercent(days: LocalDay[]): Record<Category, number> {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, sum(days.map((d) => d.mixSeconds[c] ?? 0))])) as Record<Category, number>;
  const all = sum(CATEGORIES.map((c) => totals[c]));
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, all ? Math.round((totals[c] / all) * 100) : 0])) as Record<Category, number>;
  const drift = all ? 100 - sum(CATEGORIES.map((c) => out[c])) : 0;
  if (drift) out.work = Math.max(0, out.work + drift);
  return out;
}

function kpi(days: LocalDay[], from: string, today: string) {
  const mix = mixPercent(days);
  const sent = days.filter((d) => d.reportStatus === 'sent').length;
  const expected = Math.max(1, daysBetweenKeys(from, today).filter(isWeekdayKey).length);
  return { tracked: round1(sum(days.map((d) => d.trackedSeconds)) / 3600), focus: mix.work + mix.research + mix.learning, reports: Math.min(100, Math.round((sent / expected) * 100)), distraction: mix.distraction, mix };
}

/** "+3 pts" / "−6%" like the API. */
export function delta(a: number, b: number, unit: 'pts' | '%'): string {
  const d = unit === '%' ? (b ? Math.round(((a - b) / b) * 100) : 0) : a - b;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  return `${sign}${Math.abs(d)}${unit === '%' ? '%' : Math.abs(d) === 1 ? ' pt' : ' pts'}`;
}

export function buildLocalAdmin(input: LocalAdminInput): AdminData {
  const { today, range } = input;
  const { from, prevFrom, weeks } = rangeBounds(today, range);
  const cur = input.days.filter((d) => d.day >= from && d.day <= today);
  const prev = input.days.filter((d) => d.day >= prevFrom && d.day < from);
  const k = kpi(cur, from, today);
  const p = kpi(prev, prevFrom, addDaysKey(from, -1));

  const apps = new Map<string, number>();
  for (const d of cur) d.topApps.forEach((a, i) => apps.set(a, (apps.get(a) ?? 0) + (3 - i)));
  const top = [...apps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]).join(' · ');
  const me: AdminPerson = {
    initials: input.me.initials, name: input.me.name, team: input.me.team || 'Solo',
    week: k.tracked, focus: k.focus, distraction: k.distraction, reports: cur.filter((d) => d.reportStatus === 'sent').length,
    mix: CATEGORIES.map((c) => k.mix[c]), top: top || '—',
  };

  const projects: AdminProject[] = input.projects.filter((pr) => !pr.archived).map((pr) => {
    const mine = input.entries.filter((e) => e.project === pr.id);
    const tasks = input.tasks.filter((t) => t.project === pr.id);
    return { name: pr.name, color: pr.color, hours: round1(sum(mine.map((e) => e.seconds)) / 3600), budget: round1(pr.budgetHours * weeks), tasks: tasks.length, overdue: tasks.filter((t) => t.status === 'Overdue').length };
  });

  const alerts: AdminData['alerts'] = [];
  // Days you tracked time on (before today) but never sent a report for.
  const unsent = cur.filter((d) => d.day < today && isWeekdayKey(d.day) && d.trackedSeconds > 0 && d.reportStatus !== 'sent');
  if (unsent.length >= 2) alerts.push(['danger', `${unsent.length} tracked days without a sent report`]);
  for (const pr of projects) if (pr.budget > 0 && pr.hours > pr.budget) alerts.push(['warning', `${pr.name} is ${round1(pr.hours - pr.budget)}h over its ${range === 'week' ? 'weekly' : range + 'ly'} budget`]);
  if (k.distraction >= 10) alerts.push(['warning', `Distraction share ${k.distraction}% this ${range}`]);
  const overdue = input.tasks.filter((t) => t.status === 'Overdue').length;
  if (overdue) alerts.push(['warning', `${overdue} task${overdue === 1 ? '' : 's'} overdue`]);
  const resized = input.entries.filter((e) => e.size && e.sizeCheck && e.size !== e.sizeCheck).length;
  if (resized) alerts.push(['info', `${resized} task${resized === 1 ? '' : 's'} re-assessed this ${range}`]);

  return {
    orgs: [],
    kpis: { focus: k.focus, tracked: k.tracked, reports: k.reports, distraction: k.distraction },
    deltas: { focus: delta(k.focus, p.focus, 'pts'), tracked: delta(k.tracked, p.tracked, '%'), reports: delta(k.reports, p.reports, 'pts'), distraction: delta(k.distraction, p.distraction, 'pts') },
    categoryMix: k.mix,
    people: [me],
    projects,
    alerts: alerts.slice(0, 8),
    policy: input.policy,
    fetchedAt: null,
  };
}
