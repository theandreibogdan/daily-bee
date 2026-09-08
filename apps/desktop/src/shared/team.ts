/** Team / Admin view models — aggregated data only (app names and categories, never URLs). */

export interface TeamMember {
  initials: string;
  name: string;
  /** seconds tracked today */
  today: number;
  /** seconds tracked this week */
  week: number;
  report: 'Sent' | 'Draft' | 'Missing';
  tracking: boolean;
}

export interface TeamData {
  members: TeamMember[];
  /** hours per weekday Mon..Sun for the whole team */
  hoursByDay: number[];
  weekDeltaPct: number;
  goalHours: number;
  /** last-fetched marker; null = local fake data */
  fetchedAt: number | null;
}

export interface AdminPerson {
  initials: string;
  name: string;
  team: string;
  week: number;
  focus: number;
  distraction: number;
  reports: number;
  /** percentages in CATEGORIES order */
  mix: number[];
  /** "VS Code · GitHub" — app names only */
  top: string;
}

export interface AdminProject { name: string; color: string; hours: number; budget: number; tasks: number; overdue: number }

export interface AdminData {
  orgs: string[];
  kpis: { focus: number; tracked: number; reports: number; distraction: number };
  deltas: { focus: string; tracked: string; reports: string; distraction: string };
  categoryMix: Record<'work' | 'research' | 'learning' | 'communication' | 'distraction', number>;
  people: AdminPerson[];
  projects: AdminProject[];
  alerts: Array<['danger' | 'warning' | 'info', string]>;
  policy: Array<[string, boolean]>;
  fetchedAt: number | null;
}
