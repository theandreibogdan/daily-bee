import type { AdminData, TeamData } from '../shared/team';

/** Fake team/admin data — mirrors design_system/ui_kits/app/data.js (used until a workspace API is configured). */
export const FAKE_TEAM: TeamData = {
  members: [
    { initials: 'ML', name: 'Mia Lewis', today: 19860, week: 121500, report: 'Draft', tracking: true },
    { initials: 'JK', name: 'Jack King', today: 25200, week: 134400, report: 'Sent', tracking: true },
    { initials: 'SO', name: 'Sam Oliver', today: 14400, week: 108000, report: 'Sent', tracking: false },
    { initials: 'RA', name: 'Rose Adams', today: 0, week: 96300, report: 'Missing', tracking: false },
    { initials: 'TN', name: 'Tom Nash', today: 21600, week: 127800, report: 'Sent', tracking: true },
    { initials: 'PB', name: 'Paul Brown', today: 9000, week: 88200, report: 'Draft', tracking: false },
  ],
  hoursByDay: [38, 41, 36, 44, 31, 4, 0],
  weekDeltaPct: 6,
  goalHours: 40,
  fetchedAt: null,
};

export const FAKE_ADMIN: AdminData = {
  orgs: ['Engineering', 'Platform', 'Product'],
  kpis: { focus: 71, tracked: 178.5, reports: 92, distraction: 6 },
  deltas: { focus: '+3 pts', tracked: '+6%', reports: '−4 pts', distraction: '−1 pt' },
  categoryMix: { work: 62, research: 12, learning: 7, communication: 13, distraction: 6 },
  people: [
    { initials: 'ML', name: 'Mia Lewis', team: 'Platform', week: 33.75, focus: 78, distraction: 4, reports: 5, mix: [68, 12, 5, 11, 4], top: 'VS Code · GitHub' },
    { initials: 'JK', name: 'Jack King', team: 'Engineering', week: 37.3, focus: 74, distraction: 5, reports: 5, mix: [61, 14, 8, 12, 5], top: 'VS Code · Linear' },
    { initials: 'SO', name: 'Sam Oliver', team: 'Product', week: 30.0, focus: 58, distraction: 9, reports: 4, mix: [45, 18, 6, 22, 9], top: 'Figma · Slack' },
    { initials: 'RA', name: 'Rose Adams', team: 'Platform', week: 26.75, focus: 66, distraction: 3, reports: 2, mix: [70, 10, 4, 13, 3], top: 'Terminal · Grafana' },
    { initials: 'TN', name: 'Tom Nash', team: 'Engineering', week: 35.5, focus: 80, distraction: 7, reports: 5, mix: [66, 9, 9, 9, 7], top: 'IntelliJ · GitHub' },
    { initials: 'PB', name: 'Paul Brown', team: 'Product', week: 24.5, focus: 52, distraction: 12, reports: 3, mix: [40, 20, 10, 18, 12], top: 'Notion · Zoom' },
  ],
  projects: [
    { name: 'api-gateway', color: 'var(--blue-500)', hours: 64.5, budget: 80, tasks: 14, overdue: 1 },
    { name: 'web-app', color: 'var(--green-500)', hours: 71.0, budget: 70, tasks: 22, overdue: 3 },
    { name: 'infra', color: 'var(--orange-500)', hours: 43.0, budget: 60, tasks: 9, overdue: 1 },
  ],
  alerts: [
    ['danger', 'Rose Adams has not sent a report for 3 days'],
    ['warning', 'web-app is 1h over its weekly budget'],
    ['warning', 'Paul Brown: distraction share 12% (team avg 6%)'],
    ['info', '3 tasks re-assessed from Medium to Large this week'],
  ],
  policy: [
    ['Managers see categories and app names, not URLs', true],
    ['Distraction check-ins after 8 min on a distraction site', true],
    ['Halfway check-in on every task with a size', true],
    ['Auto-generate daily report at 18:00', true],
    ['Share individual focus % with the whole team', false],
  ],
  fetchedAt: null,
};
