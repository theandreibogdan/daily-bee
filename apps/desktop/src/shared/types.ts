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

export interface Project {
  id: string;
  name: string;
  /** A design-token colour, e.g. "var(--blue-500)" */
  color: string;
  /** Hours per week the project should take (Admin › Projects budgets) */
  budgetHours: number;
  /** Hidden from pickers; history keeps it */
  archived?: boolean;
}
/** Colours a project can take (design tokens). */
export const PROJECT_COLORS: Array<{ token: string; label: string }> = [
  { token: 'var(--blue-500)', label: 'Blue' }, { token: 'var(--green-500)', label: 'Green' }, { token: 'var(--orange-500)', label: 'Orange' },
  { token: 'var(--honey-500)', label: 'Honey' }, { token: 'var(--red-500)', label: 'Red' }, { token: 'var(--hive-500)', label: 'Gray' },
];
export interface TaskRef { id: string; title: string; project: string; size: TaskSize; estimate: number; logged: number; status: TaskStatus; owner: string }

export interface SessionTask {
  task: string;
  goal: string;
  size: TaskSize;
  project: string;
  ref: string | null;
  mood: Mood;
}

/** Why the timer is paused: no input, screen locked, or machine asleep. Closing the app stops the timer instead. */
export type PauseReason = 'idle' | 'lock' | 'sleep';

export interface Session {
  running: boolean;
  /** epoch ms when the current run started (wall clock, shown as "Started 15:45") */
  startedAt: number | null;
  current: SessionTask | null;
  /** Active seconds banked from earlier stretches of this run; the timer counts active time only */
  banked: number;
  /** epoch ms when the current active stretch began; null while paused */
  activeSince: number | null;
  /** Set while the timer is paused (idle / lock / sleep / app closed) */
  paused: { reason: PauseReason; since: number } | null;
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

/** drift = small popup after a while on a distraction site; pulse = halfway check-in; warning = full-screen overlay on a distraction site while working */
export type CheckinKind = 'drift' | 'pulse' | 'warning';

export interface Checkin {
  id: string;
  day: string;
  ts: number;
  /** "10:33" */
  at: string;
  kind: CheckinKind;
  text: string;
  answer: string | null;
  task: string | null;
  domain: string | null;
}

export interface CurrentApp { app: string; detail: string; icon: string; cat: Category; /** false while no task is running */ tracked: boolean }

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
    /** Small drift popup after this many minutes on a distraction site (used when the full-screen warning is off) */
    driftMinutes: number;
    halfwayCheckin: boolean;
    /** Full-screen overlay when a distraction site is in front while a task is running */
    fullscreenWarning: boolean;
    /** Seconds on the distraction site before the overlay appears */
    warningSeconds: number;
    /** Minutes of quiet after answering "Taking a break" */
    snoozeMinutes: number;
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
  /** Small always-on-top window with the timer, task and current tab */
  widget: { enabled: boolean };
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

/** One row of Reports › History: every day with any data, whether or not a report was generated. */
export interface ReportHistoryItem { day: string; label: string; tracked: number; entries: number; status: 'Sent' | 'Draft' | 'None' }

/** Stored summary of a day's activity, written when the day ends so raw samples can be dropped. */
export interface DayDigest {
  rows: ActivityRow[];
  mix: CategoryMix;
  timeline: TimelineSegment[];
  /** epoch ms of the first and last non-idle sample */
  firstTs: number | null;
  lastTs: number | null;
  sampleCount: number;
  intervalSec: number;
}

/** Everything the Today screen shows, for one calendar day (today live, past days from stored samples or the digest). */
export interface DaySummary extends DayDigest {
  day: string;
  /** "Mon 7 Sep" */
  label: string;
  /** seconds from entries, plus the running timer when today */
  tracked: number;
  entries: Entry[];
  checkins: Checkin[];
  report: ReportDraft | null;
  /** live = today's tracker; samples = recomputed from stored samples; digest = the saved summary; none = nothing captured */
  source: 'live' | 'samples' | 'digest' | 'none';
}

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
