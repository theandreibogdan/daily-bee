import type { Category, CheckinPush, DayPush, EntryPush } from './schemas';

/** Stored records (both repositories). */
export interface UserRec { id: string; workspaceId: string; email: string; name: string; initials: string; team: string; role: 'member' | 'lead' | 'admin' }
export interface DayRec {
  userId: string; day: string; tracking: boolean; trackedSeconds: number; focus: number; mix: Record<Category, number>; topApps: string[];
  reportStatus: 'draft' | 'sent' | null; reportSentAt: number | null; shareFocus: boolean; updatedAt: number;
}
export interface EntryRec extends EntryPush { userId: string; day: string }
export interface CheckinRec extends CheckinPush { userId: string; day: string }
export interface NudgeRec { id: number; workspaceId: string; fromUserId: string; toInitials: string; createdAt: number }
export interface ProjectRec { workspaceId: string; id: string; name: string; color: string; budgetHours: number }
export type PolicyRules = Array<[string, boolean]>;

export interface WorkspaceSnapshot { users: UserRec[]; days: DayRec[]; entries: EntryRec[]; checkins: CheckinRec[]; projects: ProjectRec[]; policy: PolicyRules }

/** Storage contract implemented by the Postgres and in-memory repositories. */
export interface Repo {
  /** Bearer token → user, or null when unknown. */
  authenticate(token: string): Promise<UserRec | null>;
  /** Update the user's own profile fields from a push. */
  updateProfile(user: UserRec, profile: DayPush['user']): Promise<UserRec>;
  saveDay(user: UserRec, push: DayPush): Promise<void>;
  /** Everything needed to aggregate a workspace over [fromDay, toDay]. */
  snapshot(workspaceId: string, fromDay: string, toDay: string): Promise<WorkspaceSnapshot>;
  addNudge(from: UserRec, toInitials: string): Promise<void>;
  setPolicy(workspaceId: string, rules: PolicyRules): Promise<PolicyRules>;
  close(): Promise<void>;
}

/** View models returned to the desktop (mirrors apps/desktop/src/shared/team.ts). */
export interface TeamMember { initials: string; name: string; today: number; week: number; report: 'Sent' | 'Draft' | 'Missing'; tracking: boolean }
export interface TeamData { members: TeamMember[]; hoursByDay: number[]; weekDeltaPct: number; goalHours: number; fetchedAt: number | null }
export interface AdminPerson { initials: string; name: string; team: string; week: number; focus: number; distraction: number; reports: number; mix: number[]; top: string }
export interface AdminProject { name: string; color: string; hours: number; budget: number; tasks: number; overdue: number }
export interface AdminData {
  orgs: string[];
  kpis: { focus: number; tracked: number; reports: number; distraction: number };
  deltas: { focus: string; tracked: string; reports: string; distraction: string };
  categoryMix: Record<Category, number>;
  people: AdminPerson[];
  projects: AdminProject[];
  alerts: Array<['danger' | 'warning' | 'info', string]>;
  policy: PolicyRules;
  fetchedAt: number | null;
}
