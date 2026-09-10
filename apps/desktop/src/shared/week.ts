import { dayKey, startOfDay, startOfWeek } from './time';
import type { Entry, Project, ReportDraft, TaskRef, WeekDay, WeekProject, WeekSummary } from './types';

/** Where a week's numbers come from; the main process feeds it from the repo, the browser mock from its fake data. */
export interface WeekSource {
  entriesForDay(day: string): Entry[];
  report(day: string): ReportDraft | null;
  /** Focus % and captured seconds of a day; null when nothing was captured */
  focusForDay(day: string): { focus: number; total: number } | null;
  projects(): Project[];
  tasks(): TaskRef[];
  /** Seconds of the running task, counted into today */
  runningSeconds(): number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** `days` after a Monday 00:00, through the calendar (DST-safe). */
export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** "8 – 14 Sep", or "29 Sep – 5 Oct" across a month boundary. */
export function weekLabel(start: number): string {
  const a = new Date(start), b = new Date(addDays(start, 6));
  const mo = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${mo(b)}` : `${a.getDate()} ${mo(a)} – ${b.getDate()} ${mo(b)}`;
}

/** The seven days of the week containing `start`, compared with the week before (Reports › Week). */
export function buildWeek(start: number, now: number, src: WeekSource): WeekSummary {
  const monday = startOfWeek(start);
  const end = addDays(monday, 7);
  const today = dayKey(now);
  const todayStart = startOfDay(now);
  const projectSeconds = new Map<string, number>();
  const prevProjectSeconds = new Map<string, number>();
  const touched = { ids: new Set<string>(), titles: new Set<string>() };
  let focusSeconds = 0, focusTotal = 0;
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const ts = addDays(monday, i);
    const key = dayKey(ts);
    const future = ts > todayStart;
    const entries = future ? [] : src.entriesForDay(key);
    const tracked = entries.reduce((a, e) => a + e.seconds, 0) + (key === today ? src.runningSeconds() : 0);
    for (const e of entries) {
      projectSeconds.set(e.project, (projectSeconds.get(e.project) ?? 0) + e.seconds);
      if (e.ref) touched.ids.add(e.ref);
      touched.titles.add(e.task.trim().toLowerCase());
    }
    const f = future ? null : src.focusForDay(key);
    if (f && f.total > 0) { focusSeconds += f.focus * f.total; focusTotal += f.total; }
    const r = future ? null : src.report(key);
    days.push({ day: key, weekday: WEEKDAYS[i]!, date: String(new Date(ts).getDate()), tracked, entries: entries.length, done: entries.filter((e) => e.done).length, focus: f && f.total > 0 ? f.focus : null, report: r ? (r.status === 'sent' ? 'Sent' : 'Draft') : 'None', today: key === today, future });
  }
  let prevTracked = 0;
  for (let i = -7; i < 0; i++) {
    for (const e of src.entriesForDay(dayKey(addDays(monday, i)))) {
      prevTracked += e.seconds;
      prevProjectSeconds.set(e.project, (prevProjectSeconds.get(e.project) ?? 0) + e.seconds);
    }
  }
  const known = src.projects();
  const ids = [...new Set([...projectSeconds.keys(), ...prevProjectSeconds.keys()])];
  const projects: WeekProject[] = ids.map((id) => {
    const p = known.find((x) => x.id === id);
    return { id, name: p?.name ?? (id ? id : 'No project'), color: p?.color ?? 'var(--hive-400)', seconds: projectSeconds.get(id) ?? 0, prevSeconds: prevProjectSeconds.get(id) ?? 0, budgetHours: p?.budgetHours ?? 0, archived: !!p?.archived };
  }).sort((a, b) => b.seconds - a.seconds || b.prevSeconds - a.prevSeconds);
  const tasks = src.tasks();
  const untouched = tasks.filter((t) => t.status === 'In progress' && !touched.ids.has(t.id) && !touched.titles.has(t.title.trim().toLowerCase()));
  const weekdaysSoFar = days.filter((d, i) => i < 5 && !d.future).length;
  return {
    start: monday, end, label: weekLabel(monday), current: monday === startOfWeek(now), days, projects,
    totals: {
      tracked: days.reduce((a, d) => a + d.tracked, 0), prevTracked, entries: days.reduce((a, d) => a + d.entries, 0), done: days.reduce((a, d) => a + d.done, 0),
      focus: focusTotal > 0 ? Math.round(focusSeconds / focusTotal) : null, reportsSent: days.filter((d) => d.report === 'Sent').length, daysTracked: days.filter((d) => d.tracked > 0).length, weekdaysSoFar,
    },
    tasks: { overdue: tasks.filter((t) => t.status === 'Overdue'), untouched },
  };
}
