import type { ActivityRow, Category, CategoryMix, PermissionStatus, Rule, TimelineSegment } from '@dailybee/tracker/types';

export type { ActivityRow, Category, CategoryMix, PermissionStatus, Rule, TimelineSegment };

export type TaskSize = 'Trivial' | 'Small' | 'Medium' | 'Large' | 'Epic';
export const TASK_SIZES: TaskSize[] = ['Trivial', 'Small', 'Medium', 'Large', 'Epic'];
/** Assessment scale in hours (Tasks screen: "≈ 6h · team median for medium is 7.2h") */
export const SIZE_HOURS: Record<TaskSize, number> = { Trivial: 0.5, Small: 2, Medium: 6, Large: 16, Epic: 40 };
export type Mood = 'Focused' | 'Okay' | 'Scattered' | 'Blocked';
export const MOODS: Mood[] = ['Focused', 'Okay', 'Scattered', 'Blocked'];
export type Outcome = 'Done' | 'Partly done' | 'Not done' | 'Handed off';
export const OUTCOMES: Outcome[] = ['Done', 'Partly done', 'Not done', 'Handed off'];
export type TaskStatus = 'Backlog' | 'In progress' | 'Done' | 'Overdue';
export const TASK_STATUSES: TaskStatus[] = ['Backlog', 'In progress', 'Done', 'Overdue'];

export interface Project { id: string; name: string; color: string }
export interface TaskRef { id: string; title: string; project: string; size: TaskSize; estimate: number; logged: number; status: TaskStatus; owner: string }

export interface SessionTask {
  task: string;
  goal: string;
  size: TaskSize;
  project: string;
  ref: string | null;
  mood: Mood;
}

export interface Session {
  running: boolean;
  /** epoch ms when the current run started */
  startedAt: number | null;
  current: SessionTask | null;
}

export interface Entry {
  id: string;
  /** YYYY-MM-DD (local) */
  day: string;
  task: string;
  ref: string | null;
  project: string;
  /** epoch ms */
  startTs: number;
  /** "09:05" */
  start: string;
  seconds: number;
  done: boolean;
  outcome?: Outcome;
  summary?: string;
  blocker?: boolean;
  sizeCheck?: TaskSize;
  size?: TaskSize;
  goal?: string;
}

export interface EndTaskResult { summary: string; outcome: Outcome; sizeCheck: TaskSize; blocker: boolean }

export interface Checkin {
  id: string;
  day: string;
  ts: number;
  /** "10:33" */
  at: string;
  kind: 'drift' | 'pulse';
  text: string;
  answer: string | null;
  task: string | null;
  domain: string | null;
}

export interface CurrentApp { app: string; detail: string; icon: string; cat: Category }

export interface ActivitySummary {
  rows: ActivityRow[];
  mix: CategoryMix;
  timeline: TimelineSegment[];
  current: CurrentApp | null;
  sampleCount: number;
  intervalSec: number;
  /** epoch ms of the first non-idle sample today */
  firstTs: number | null;
  /** Whether the OS tracker is running (false in demo mode / when disabled) */
  live: boolean;
}

export interface Settings {
  profile: { name: string; email: string; initials: string; role: string; timezone: string };
  tracking: {
    enabled: boolean;
    idleDetection: boolean;
    idleMinutes: number;
    roundTo5: boolean;
    captureBrowser: boolean;
    startOnCommit: boolean;
    intervalSec: number;
  };
  policy: {
    driftMinutes: number;
    halfwayCheckin: boolean;
    /** "18:00" */
    reportTime: string;
    autoSend: boolean;
    includeBlockers: boolean;
    attachCsv: boolean;
    /** Always false: per-page URLs never leave the device */
    managersSeeUrls: false;
    shareFocusWithTeam: boolean;
  };
  delivery: {
    slackWebhookUrl: string;
    slackChannel: string;
    emailTo: string;
    /** smtp://user:pass@host:port */
    smtpUrl: string;
    emailFrom: string;
    llmPolish: boolean;
    anthropicApiKey: string;
  };
  workspace: { apiUrl: string; token: string; teamName: string };
  dailyGoalHours: number;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface ReportSummary { tracked: number; focus: number; done: number; total: number; checkins: number; distraction: number }

export interface ReportDraft {
  day: string;
  /** "Mon 7 Sep" */
  label: string;
  summary: ReportSummary;
  shipped: Entry[];
  inProgress: Entry[];
  /** percentages in CATEGORIES order */
  mix: number[];
  /** "Mostly VS Code and GitHub. 9 min on youtube.com at 10:33 — you said “taking a break”." */
  narrative: string;
  blockers: string;
  /** user-editable notes & blockers */
  notes: string;
  markdown: string;
  status: 'draft' | 'sent';
  sentAt: number | null;
  recipients: string;
  /** app names only — never URLs */
  topApps: string[];
}

export interface ReportHistoryItem { day: string; label: string; tracked: number; entries: number; status: 'Sent' | 'Draft' }

export interface SyncStatus {
  configured: boolean;
  connected: boolean;
  lastPushAt: number | null;
  lastError: string | null;
  /** Human-readable summary of what is shared */
  shares: string;
}

export type ScreenId = 'today' | 'reports' | 'team' | 'tasks' | 'admin' | 'settings';

export interface ToastMessage { id: number; text: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }

export type RecategoriseTarget = { kind: 'domain'; value: string } | { kind: 'app'; value: string };
