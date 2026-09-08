import type { Project, TaskRef } from './types';

/** Fake seed data shared by the demo seeder (main) and the browser mock (renderer) — mirrors design_system/ui_kits/app/data.js. */
export const PROJECTS: Project[] = [
  { id: 'api', name: 'api-gateway', color: 'var(--blue-500)' },
  { id: 'web', name: 'web-app', color: 'var(--green-500)' },
  { id: 'infra', name: 'infra', color: 'var(--orange-500)' },
];

export const TASKS: TaskRef[] = [
  { id: 'DB-1042', title: 'Timer sync across devices', project: 'api', size: 'Large', estimate: 16, logged: 9.5, status: 'In progress', owner: 'ML' },
  { id: 'DB-1038', title: 'Review: rate limiter PR', project: 'api', size: 'Small', estimate: 2, logged: 0.75, status: 'Done', owner: 'ML' },
  { id: 'DB-1051', title: 'Daily report template polish', project: 'web', size: 'Medium', estimate: 6, logged: 4, status: 'In progress', owner: 'JK' },
  { id: 'DB-1049', title: 'Staging deploy + smoke tests', project: 'infra', size: 'Small', estimate: 1.5, logged: 0.5, status: 'In progress', owner: 'ML' },
  { id: 'DB-1055', title: 'Onboarding: invite teammates flow', project: 'web', size: 'Epic', estimate: 40, logged: 12, status: 'Backlog', owner: 'SO' },
  { id: 'DB-1057', title: 'Export reports to CSV', project: 'web', size: 'Medium', estimate: 5, logged: 0, status: 'Backlog', owner: 'JK' },
  { id: 'DB-1031', title: 'Postgres connection pooling', project: 'infra', size: 'Large', estimate: 12, logged: 14, status: 'Overdue', owner: 'RA' },
];

/** [task, ref, project, start, seconds, done] */
export const KIT_ENTRIES: Array<[string, string, string, string, number, boolean]> = [
  ['Timer sync across devices', 'DB-1042', 'api', '09:05', 5460, false],
  ['Review: rate limiter PR', 'DB-1038', 'api', '10:40', 2700, true],
  ['Daily report template polish', 'DB-1051', 'web', '11:30', 3900, true],
  ['Staging deploy + smoke tests', 'DB-1049', 'infra', '13:15', 1800, false],
];

/** [start, category, minutes] */
export const KIT_TIMELINE: Array<[string, string, number]> = [['09:05', 'work', 40], ['09:45', 'research', 12], ['09:57', 'work', 28], ['10:25', 'communication', 8], ['10:33', 'distraction', 9], ['10:42', 'work', 35], ['11:17', 'learning', 5], ['11:22', 'work', 40], ['12:02', 'break', 39], ['12:41', 'work', 81]];

export const KIT_CURRENT_TASK = { task: 'Timer sync across devices', goal: 'Cross-device timer state via Web Locks + server reconcile', size: 'Large' as const, project: 'api', ref: 'DB-1042', mood: 'Focused' as const };
export const KIT_END_SUMMARY = 'Web Locks prototype working locally; server reconcile stubbed. PR opened as draft.';
