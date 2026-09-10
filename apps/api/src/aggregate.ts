import { CATEGORIES, type Category } from './schemas';
import { addDays, daysBetween, isWeekday, weekStart, weekday } from './time';
import type { AdminData, AdminPerson, DayRec, TeamData, WorkspaceSnapshot } from './types';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => Math.round(n);

function emptyMix(): Record<Category, number> { return { work: 0, research: 0, learning: 0, communication: 0, distraction: 0 }; }

/** Seconds-weighted average of daily category percentages. */
function weightedMix(days: DayRec[]): Record<Category, number> {
  const total = sum(days.map((d) => d.trackedSeconds));
  const out = emptyMix();
  if (!total) return out;
  for (const c of CATEGORIES) out[c] = pct(sum(days.map((d) => (d.mix[c] * d.trackedSeconds) / total)));
  const drift = 100 - sum(CATEGORIES.map((c) => out[c]));
  if (drift && total) out.work = Math.max(0, out.work + drift);
  return out;
}

export function teamOverview(snap: WorkspaceSnapshot, today: string, goalHours = 40): TeamData {
  const ws = weekStart(today);
  const lastWs = addDays(ws, -7);
  const thisWeek = snap.days.filter((d) => d.day >= ws && d.day <= today);
  const lastWeek = snap.days.filter((d) => d.day >= lastWs && d.day < ws);
  const members = snap.users.map((u) => {
    const mine = thisWeek.filter((d) => d.userId === u.id);
    const td = mine.find((d) => d.day === today);
    return {
      initials: u.initials, name: u.name,
      today: td?.trackedSeconds ?? 0,
      week: sum(mine.map((d) => d.trackedSeconds)),
      report: (td?.reportStatus === 'sent' ? 'Sent' : td?.reportStatus === 'draft' ? 'Draft' : 'Missing') as 'Sent' | 'Draft' | 'Missing',
      tracking: !!td?.tracking && Date.now() - td.updatedAt < 20 * 60_000,
    };
  }).sort((a, b) => b.week - a.week);
  const hoursByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const d of thisWeek) hoursByDay[weekday(d.day)]! += d.trackedSeconds / 3600;
  const tw = sum(thisWeek.map((d) => d.trackedSeconds)), lw = sum(lastWeek.map((d) => d.trackedSeconds));
  return { members, hoursByDay: hoursByDay.map((h) => Math.round(h)), weekDeltaPct: lw ? Math.round(((tw - lw) / lw) * 100) : 0, goalHours, fetchedAt: Date.now() };
}

export function adminOverview(snap: WorkspaceSnapshot, today: string, range: 'week' | 'month' | 'quarter', team: string): AdminData {
  const span = range === 'week' ? 7 : range === 'month' ? 30 : 90;
  const ws = range === 'week' ? weekStart(today) : addDays(today, -(span - 1));
  const prevStart = addDays(ws, -span);
  const users = snap.users.filter((u) => team === 'All teams' || !team || u.team === team);
  const ids = new Set(users.map((u) => u.id));
  const cur = snap.days.filter((d) => ids.has(d.userId) && d.day >= ws && d.day <= today);
  const prev = snap.days.filter((d) => ids.has(d.userId) && d.day >= prevStart && d.day < ws);
  const workdays = daysBetween(ws, today).filter(isWeekday);
  const kpi = (days: DayRec[]) => {
    const tracked = sum(days.map((d) => d.trackedSeconds)) / 3600;
    const mix = weightedMix(days);
    const sent = days.filter((d) => d.reportStatus === 'sent').length;
    const expected = users.length * Math.max(1, daysBetween(days[0]?.day ?? today, today).filter(isWeekday).length);
    return { focus: mix.work + mix.research + mix.learning, tracked: round1(tracked), reports: expected ? Math.min(100, Math.round((sent / expected) * 100)) : 0, distraction: mix.distraction, mix };
  };
  const k = kpi(cur), p = kpi(prev);
  const delta = (a: number, b: number, unit: 'pts' | '%') => {
    const d = unit === '%' ? (b ? Math.round(((a - b) / b) * 100) : 0) : a - b;
    const sign = d > 0 ? '+' : d < 0 ? '−' : '';
    return `${sign}${Math.abs(d)}${unit === '%' ? '%' : d === 1 || d === -1 ? ' pt' : ' pts'}`;
  };
  const people: AdminPerson[] = users.map((u) => {
    const mine = cur.filter((d) => d.userId === u.id);
    const mix = weightedMix(mine);
    const apps = new Map<string, number>();
    for (const d of mine) d.topApps.forEach((a, i) => apps.set(a, (apps.get(a) ?? 0) + (3 - i)));
    const top = [...apps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]).join(' · ');
    return { initials: u.initials, name: u.name, team: u.team, week: round1(sum(mine.map((d) => d.trackedSeconds)) / 3600), focus: mix.work + mix.research + mix.learning, distraction: mix.distraction, reports: mine.filter((d) => d.reportStatus === 'sent').length, mix: CATEGORIES.map((c) => mix[c]), top: top || '—' };
  }).sort((a, b) => b.focus - a.focus);
  const entries = snap.entries.filter((e) => ids.has(e.userId) && e.day >= ws && e.day <= today);
  const projects = snap.projects.map((pr) => {
    const mine = entries.filter((e) => e.project === pr.id || e.project === pr.name);
    const tasks = new Set(mine.map((e) => e.ref ?? e.task)).size;
    const hours = round1(sum(mine.map((e) => e.seconds)) / 3600);
    return { name: pr.name, color: pr.color, hours, budget: pr.budgetHours, tasks, overdue: mine.filter((e) => e.blocker && !e.done).length };
  });
  const alerts: AdminData['alerts'] = [];
  for (const u of users) {
    const recent = workdays.slice(-3);
    const sentRecently = cur.some((d) => d.userId === u.id && recent.includes(d.day) && d.reportStatus === 'sent');
    // Someone who joined this week has not had three report days yet.
    const fresh = !!u.createdAt && Date.now() - u.createdAt < 3 * 86400000;
    if (recent.length >= 3 && !sentRecently && !fresh) alerts.push(['danger', `${u.name} has not sent a report for ${recent.length} days`]);
  }
  for (const pr of projects) if (pr.hours > pr.budget) alerts.push(['warning', `${pr.name} is ${round1(pr.hours - pr.budget)}h over its weekly budget`]);
  for (const person of people) if (person.distraction > k.distraction + 5 && person.distraction >= 10) alerts.push(['warning', `${person.name}: distraction share ${person.distraction}% (team avg ${k.distraction}%)`]);
  const resized = entries.filter((e) => e.size && e.sizeCheck && e.size !== e.sizeCheck).length;
  if (resized) alerts.push(['info', `${resized} task${resized === 1 ? '' : 's'} re-assessed this ${range}`]);
  return {
    orgs: [...new Set(snap.users.map((u) => u.team).filter(Boolean))].sort(),
    kpis: { focus: k.focus, tracked: k.tracked, reports: k.reports, distraction: k.distraction },
    deltas: { focus: delta(k.focus, p.focus, 'pts'), tracked: delta(k.tracked, p.tracked, '%'), reports: delta(k.reports, p.reports, 'pts'), distraction: delta(k.distraction, p.distraction, 'pts') },
    categoryMix: k.mix,
    people,
    projects,
    alerts: alerts.slice(0, 8),
    policy: snap.policy,
    fetchedAt: Date.now(),
  };
}
