import { describe, expect, it } from 'vitest';
import type { Entry, Project, TaskRef } from '../../shared/types';
import { addDaysKey, buildLocalAdmin, daysBetweenKeys, delta, rangeBounds, weekStartKey, type LocalDay } from '../services/admin';

const TODAY = '2026-09-10'; // a Thursday
const mixOf = (work: number, distraction: number, research = 0): LocalDay['mixSeconds'] => ({ work, research, learning: 0, communication: 0, distraction });
const day = (d: string, trackedSeconds: number, mix: LocalDay['mixSeconds'], reportStatus: LocalDay['reportStatus'] = 'sent', topApps = ['VS Code', 'Brave']): LocalDay => ({ day: d, trackedSeconds, mixSeconds: mix, topApps, reportStatus });
const entry = (project: string, seconds: number, extra: Partial<Entry> = {}): Entry => ({ id: 'e' + Math.random(), day: TODAY, task: 't', ref: null, project, startTs: 0, start: '09:00', seconds, done: false, ...extra });
const PROJECTS: Project[] = [{ id: 'api', name: 'api-gateway', color: 'var(--blue-500)', budgetHours: 10 }, { id: 'old', name: 'old', color: 'var(--hive-500)', budgetHours: 5, archived: true }];
const TASKS: TaskRef[] = [{ id: 'DB-1', title: 'a', project: 'api', size: 'Small', estimate: 2, logged: 0, status: 'Overdue', owner: 'ME' }, { id: 'DB-2', title: 'b', project: 'api', size: 'Small', estimate: 2, logged: 1, status: 'Done', owner: 'ME' }];

describe('day-key helpers', () => {
  it('walks the calendar without timezone drift', () => {
    expect(weekStartKey(TODAY)).toBe('2026-09-07');
    expect(addDaysKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(daysBetweenKeys('2026-09-07', TODAY)).toHaveLength(4);
    expect(rangeBounds(TODAY, 'week')).toMatchObject({ from: '2026-09-07', prevFrom: '2026-08-31', span: 7 });
    expect(rangeBounds(TODAY, 'month').from).toBe('2026-08-12');
    expect(delta(71, 68, 'pts')).toBe('+3 pts');
    expect(delta(10, 12, '%')).toBe('−17%');
    expect(delta(5, 4, 'pts')).toBe('+1 pt');
  });
});

describe('buildLocalAdmin', () => {
  it('computes this period against the previous one from own days, entries, tasks and projects', () => {
    const days: LocalDay[] = [
      // previous week: 2 days, all work, both reports sent
      day('2026-09-01', 7200, mixOf(7200, 0)), day('2026-09-02', 3600, mixOf(3600, 0)),
      // this week: Mon/Tue tracked but unsent, Wed sent, today live
      day('2026-09-07', 7200, mixOf(6000, 1200), 'draft'), day('2026-09-08', 3600, mixOf(2400, 1200), null), day('2026-09-09', 3600, mixOf(3600, 0), 'sent'), day(TODAY, 1800, mixOf(1800, 0), null),
    ];
    const entries = [entry('api', 30000), entry('api', 12000, { size: 'Small', sizeCheck: 'Large' }), entry('old', 600)];
    const a = buildLocalAdmin({ today: TODAY, range: 'week', days, entries, tasks: TASKS, projects: PROJECTS, me: { name: 'Me', initials: 'ME', team: '' }, policy: [] });
    expect(a.kpis.tracked).toBe(4.5); // 7200+3600+3600+1800 s
    expect(a.kpis.distraction).toBe(15); // 2400 of 16200 s
    expect(a.kpis.focus).toBe(85);
    expect(a.kpis.reports).toBe(25); // 1 sent of 4 weekdays so far
    expect(a.deltas.tracked).toBe('+50%'); // 4.5 h vs 3 h
    expect(a.people).toHaveLength(1);
    expect(a.people[0]).toMatchObject({ initials: 'ME', team: 'Solo', reports: 1, top: 'VS Code · Brave' });
    // archived projects are left out; hours from entries, budget for the week, overdue from tasks
    expect(a.projects).toEqual([{ name: 'api-gateway', color: 'var(--blue-500)', hours: 11.7, budget: 10, tasks: 2, overdue: 1 }]);
    expect(a.alerts.map((x) => x[1])).toEqual(['2 tracked days without a sent report', 'api-gateway is 1.7h over its weekly budget', 'Distraction share 15% this week', '1 task overdue', '1 task re-assessed this week']);
    expect(a.fetchedAt).toBeNull();
  });

  it('scales budgets to the period and stays quiet with no data', () => {
    const a = buildLocalAdmin({ today: TODAY, range: 'month', days: [], entries: [], tasks: [], projects: PROJECTS, me: { name: 'Me', initials: 'ME', team: 'Platform' }, policy: [['x', true]] });
    expect(a.projects[0]?.budget).toBe(42.9); // 10 h/week × 30/7
    expect(a.kpis).toEqual({ focus: 0, tracked: 0, reports: 0, distraction: 0 });
    expect(a.alerts).toEqual([]);
    expect(a.policy).toEqual([['x', true]]);
    expect(a.people[0]?.team).toBe('Platform');
  });
});
