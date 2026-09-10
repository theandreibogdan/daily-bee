import { describe, expect, it } from 'vitest';
import { dayKey, startOfWeek } from '../../shared/time';
import type { Entry, Project, ReportDraft, TaskRef } from '../../shared/types';
import { addDays, buildWeek, weekLabel, type WeekSource } from '../../shared/week';

// Wednesday 9 September 2026, 15:00 local: the week is Mon 7 – Sun 13.
const NOW = Date.parse('2026-09-09T15:00:00');
const MON = startOfWeek(NOW);
const at = (dayOffset: number, hour: number) => addDays(MON, dayOffset) + hour * 3600_000;
const entry = (id: string, task: string, project: string, startTs: number, seconds: number, done = false, ref: string | null = null): Entry => ({ id, day: dayKey(startTs), task, ref, project, startTs, start: '', seconds, done });

function source(): WeekSource {
  const entries: Entry[] = [
    entry('a', 'Timer sync', 'api', at(0, 9), 7200, true, 'DB-1'),   // Mon 2h
    entry('b', 'Review PR', 'api', at(1, 10), 1800, true),          // Tue 30m
    entry('c', 'Landing page', 'web', at(2, 9), 5400),              // Wed 1h30 (today)
    entry('d', 'Old task', 'api', at(-7, 9), 3600),                  // last Monday 1h
    entry('e', 'Old task', 'infra', at(-3, 9), 1800),                // last Friday 30m
  ];
  const reports = new Map<string, ReportDraft>([[dayKey(at(0, 0)), { status: 'sent' } as ReportDraft], [dayKey(at(1, 0)), { status: 'draft' } as ReportDraft]]);
  const focus = new Map<string, { focus: number; total: number }>([[dayKey(at(0, 0)), { focus: 80, total: 7200 }], [dayKey(at(2, 0)), { focus: 60, total: 3600 }]]);
  const projects: Project[] = [{ id: 'api', name: 'api-gateway', color: 'blue', budgetHours: 10 }, { id: 'web', name: 'web-app', color: 'green', budgetHours: 1 }, { id: 'infra', name: 'infra', color: 'orange', budgetHours: 5 }];
  const tasks: TaskRef[] = [
    { id: 'DB-1', title: 'Timer sync', project: 'api', size: 'Large', estimate: 16, logged: 9, status: 'In progress', owner: 'FN' },
    { id: 'DB-2', title: 'Landing page', project: 'web', size: 'Medium', estimate: 6, logged: 1, status: 'In progress', owner: 'FN' },  // touched by title, not by ref
    { id: 'DB-3', title: 'Forgotten thing', project: 'api', size: 'Small', estimate: 2, logged: 0, status: 'In progress', owner: 'FN' },
    { id: 'DB-4', title: 'Late thing', project: 'infra', size: 'Small', estimate: 2, logged: 3, status: 'Overdue', owner: 'FN' },
    { id: 'DB-5', title: 'Done thing', project: 'api', size: 'Small', estimate: 2, logged: 2, status: 'Done', owner: 'FN' },
  ];
  return {
    entriesForDay: (day) => entries.filter((e) => e.day === day),
    report: (day) => reports.get(day) ?? null,
    focusForDay: (day) => focus.get(day) ?? null,
    projects: () => projects,
    tasks: () => tasks,
    runningSeconds: () => 600,
  };
}

describe('buildWeek', () => {
  it('lays out the seven days with tracked time, the running task on today, reports and focus', () => {
    const w = buildWeek(NOW, NOW, source());
    expect(w.current).toBe(true);
    expect(w.label).toBe(weekLabel(MON));
    expect(w.days.map((d) => d.weekday)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(w.days.map((d) => d.tracked)).toEqual([7200, 1800, 6000, 0, 0, 0, 0]);
    expect(w.days.map((d) => d.report)).toEqual(['Sent', 'Draft', 'None', 'None', 'None', 'None', 'None']);
    expect(w.days.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
    expect(w.days[2]).toMatchObject({ today: true, entries: 1, focus: 60 });
    expect(w.days[0]!.focus).toBe(80);
    expect(w.days[1]!.focus).toBeNull();
  });

  it('adds up totals against the week before', () => {
    const w = buildWeek(NOW, NOW, source());
    expect(w.totals).toEqual({ tracked: 15000, prevTracked: 5400, entries: 3, done: 2, focus: 73, reportsSent: 1, daysTracked: 3, weekdaysSoFar: 3 });
  });

  it('breaks the time down by project with last week and the budget', () => {
    const w = buildWeek(NOW, NOW, source());
    expect(w.projects.map((p) => [p.id, p.seconds, p.prevSeconds, p.budgetHours])).toEqual([['api', 9000, 3600, 10], ['web', 5400, 0, 1], ['infra', 0, 1800, 5]]);
  });

  it('lists overdue tasks and the ones in progress that got no time this week', () => {
    const w = buildWeek(NOW, NOW, source());
    expect(w.tasks.overdue.map((t) => t.id)).toEqual(['DB-4']);
    expect(w.tasks.untouched.map((t) => t.id)).toEqual(['DB-3']);
  });

  it('an earlier week is not current, and its days are never future', () => {
    const w = buildWeek(addDays(MON, -7), NOW, source());
    expect(w.current).toBe(false);
    expect(w.days.every((d) => !d.future)).toBe(true);
    expect(w.totals.tracked).toBe(5400);
    expect(w.totals.weekdaysSoFar).toBe(5);
    expect(w.days[0]!.today).toBe(false);
  });

  it('labels weeks across a month boundary', () => {
    expect(weekLabel(Date.parse('2026-09-28T00:00:00'))).toMatch(/^28 Sept? – 4 Oct$/); // en-GB short months read 'Sept' on newer ICU
    expect(weekLabel(Date.parse('2026-09-07T00:00:00'))).toMatch(/^7 – 13 Sept?$/);
  });
});
