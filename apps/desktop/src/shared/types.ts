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
export type TaskPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Normal', 'High', 'Urgent'];
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
export interface TaskRef { id: string; title: string; project: string; size: TaskSize; estimate: number; logged: number; status: TaskStatus; owner: string; /** Missing on older tasks = Normal */ priority?: TaskPriority }

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
  /** How the entry was made; missing on older rows = the timer */
  origin?: EntryOrigin;
  /** Hand corrections since it was written; above zero shows the “Edited” badge */
  edits?: number;
  /** epoch ms of the last hand correction */
  editedAt?: number;
}

/** How an entry came to be: written by the timer, added by hand, or split off another entry. */
export type EntryOrigin = 'timer' | 'manual' | 'split';
/** An entry that was touched by hand: corrected, added, or split off (the badge condition). */
export const isEdited = (e: Entry): boolean => (e.edits ?? 0) > 0 || e.origin === 'manual' || e.origin === 'split';

/** What a hand correction may change on an entry; everything else stays. */
export interface EntryPatch { task?: string; project?: string; startTs?: number; seconds?: number; outcome?: Outcome; summary?: string; blocker?: boolean }
/** An entry added by hand: something the timer missed. */
export interface EntryInput { task: string; project: string; startTs: number; seconds: number; outcome: Outcome; summary?: string; blocker?: boolean; ref?: string | null }
export type EntryChangeAction = 'add' | 'edit' | 'split' | 'delete' | 'away';
/** One line of the change log (main/repo.ts entry_log): appended, never rewritten. */
export interface EntryChange {
  seq: number;
  ts: number;
  action: EntryChangeAction;
  /** The entry that changed; null for time-away decisions, which concern the running task */
  entryId: string | null;
  day: string;
  /** What changed, in words: “Duration 45m → 30m · Task renamed” */
  summary: string;
  before: Partial<Entry> | null;
  after: Partial<Entry> | null;
  /** Why, in the user's words (optional) */
  reason: string;
  /** SHA-256 over the previous line's hash and this line: altering any line breaks every hash after it */
  hash: string;
}
export interface EntryLog {
  items: EntryChange[];
  /** Every hash recomputes from the line before it, first to last, across all days */
  intact: boolean;
  /** Lines in the whole log, all days */
  total: number;
}

/** The question asked when you come back after time away while a task was running (main/services/away.ts). */
export interface AwayPrompt {
  id: string;
  task: string;
  /** The run the question belongs to (Session.startedAt); a new run makes it moot */
  startedAt: number;
  reason: PauseReason;
  /** epoch ms: when you left and when you came back */
  since: number;
  until: number;
  /** Seconds away */
  seconds: number;
  /** Active seconds on the task at the moment you left (what a stop at that moment saves) */
  activeSeconds: number;
}
/** discard = leave the away time out (the timer already did); keep = count it as work; stop = end the task when you left */
export type AwayChoice = 'discard' | 'keep' | 'stop';

/** A task worked on recently, from its newest entry: what the tray's Resume and Start recent offer (main/services/quick.ts). */
export interface RecentTask { task: string; project: string; size: TaskSize; goal: string; ref: string | null; /** epoch ms of the newest entry */ lastTs: number; /** seconds across its recent entries */ seconds: number }

/** Settings › Keyboard shortcut: whether the operating system accepted the accelerator. */
export interface ShortcutStatus { enabled: boolean; accelerator: string; registered: boolean; /** Why it is not registered: another app owns it, or the text is not an accelerator */ problem: string | null }

/** One day of Reports › Week (shared/week.ts). */
export interface WeekDay { day: string; /** "Mon" */ weekday: string; /** "8" */ date: string; tracked: number; entries: number; done: number; /** Focus % from the day's captures; null without any */ focus: number | null; report: 'Sent' | 'Draft' | 'None'; today: boolean; future: boolean }
export interface WeekProject { id: string; name: string; color: string; seconds: number; prevSeconds: number; /** Hours per week the project should take (0 = no budget) */ budgetHours: number; archived: boolean }
export interface WeekSummary {
  /** epoch ms of the week's Monday 00:00 and of the following Monday */
  start: number;
  end: number;
  /** "8 – 14 Sep" */
  label: string;
  /** The week containing today */
  current: boolean;
  days: WeekDay[];
  projects: WeekProject[];
  totals: { tracked: number; prevTracked: number; entries: number; done: number; focus: number | null; reportsSent: number; daysTracked: number; /** Mon–Fri days that are not in the future */ weekdaysSoFar: number };
  tasks: { overdue: TaskRef[]; /** In progress, but no entry this week */ untouched: TaskRef[] };
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
  /** Tracking switched off (Settings › Tracking, the tray, or Today): nothing is recorded, the timer keeps counting */
  paused: boolean;
  /** Seconds spent in private apps today that were not recorded (Settings › Tracking › Private apps) */
  privateSeconds: number;
}

export interface Settings {
  profile: {
    name: string; email: string; initials: string; role: string; timezone: string;
    /** Profile picture: a square JPEG of about 160 px as a data URL; empty = initials. Stays on the device, never synced */
    avatar: string;
  };
  tracking: {
    enabled: boolean;
    idleDetection: boolean;
    idleMinutes: number;
    roundTo5: boolean;
    captureBrowser: boolean;
    startOnCommit: boolean;
    intervalSec: number;
    /** Ask what to do with the time away when you come back (idle, lock or sleep) while a task runs */
    awayPrompt: boolean;
    /** Apps that are never recorded (matched on app or process name, case-insensitive) */
    excludedApps: string[];
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
  /** Desktop (system) notifications for reports, drafts and sync trouble while DailyBee is in the background */
  notifications: { desktop: boolean };
  /** Launch with the operating system; when launched that way, stay in the tray instead of opening the window */
  startup: { launchAtLogin: boolean; startInTray: boolean };
  /** reduceMotion null = follow the operating system's reduce-motion setting */
  appearance: { reduceMotion: boolean | null };
  /** One global key: stop the running task, or resume the last one (an Electron accelerator) */
  shortcuts: { enabled: boolean; toggle: string };
  dailyGoalHours: number;
}

/** What the operating system says about launching DailyBee at login. */
export interface StartupStatus {
  /** False in development builds: there is no installed app to register with the system */
  supported: boolean;
  openAtLogin: boolean;
  /** This launch came from the login item with the tray flag, so no window was opened */
  launchedHidden: boolean;
}

/** Self-update (main/services/updates.ts): where the app stands with its update feed. */
export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';
export interface UpdateStatus {
  /** False in a development build without DAILYBEE_UPDATE_URL, or in the browser */
  supported: boolean;
  reason: string | null;
  /** The running version (package.json) */
  version: string;
  feed: string | null;
  state: UpdateState;
  /** The version the feed offers, once known */
  latest: string | null;
  /** Its release notes as plain text */
  notes: string | null;
  /** Download progress, 0–100 */
  progress: number | null;
  error: string | null;
  checkedAt: number | null;
  /** Release notes to show once: the app now runs as the version they belong to */
  whatsNew: { version: string; notes: string } | null;
}

/** Settings › Backup: when the profile's database was last copied out. */
export interface BackupStatus { lastBackupAt: number | null; lastFile: string | null; sizeBytes: number; /** Days since the profile was first opened, for the monthly reminder */ ageDays: number }
/** What a backup file contains, read before restoring it. */
export interface BackupInfo { file: string; name: string; email: string; mode: AccountMode | null; entries: number; days: number; lastDay: string | null; sizeBytes: number }
export interface BackupResult { ok: boolean; message: string; file?: string }
/** The result of the file picker: no file = cancelled; a file without info = not a DailyBee backup */
export interface BackupPick { file: string | null; info: BackupInfo | null; message: string }

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
  /** Entries corrected by hand, added by hand or split off (shown in the report and its footnote) */
  edited?: number;
  /** epoch ms when entries changed after the report was sent; cleared by sending it again */
  staleAt?: number | null;
}

/** One row of Reports › History: every day with any data, whether or not a report was generated. */
export interface ReportHistoryItem { day: string; label: string; tracked: number; entries: number; status: 'Sent' | 'Draft' | 'None'; /** Entries corrected, added or split by hand */ edited: number }

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

export type ScreenId = 'today' | 'reports' | 'team' | 'tasks' | 'projects' | 'admin' | 'settings';

// ---- accounts ------------------------------------------------------------------------------
/** Solo: everything on this device, offline, protected by a local password. Team: a workspace account in the cloud. */
export type AccountMode = 'solo' | 'team';
export type AccountRole = 'admin' | 'member';
export interface AccountStatus {
  /** False until the first-run wizard has finished */
  setupDone: boolean;
  mode: AccountMode | null;
  role: AccountRole | null;
  name: string;
  email: string;
  initials: string;
  /** settings.profile.avatar, so the lock screen can show it */
  avatar: string;
  /** Solo profiles with a password start locked; unlocking only gates the UI, tracking keeps running */
  locked: boolean;
  hasPassword: boolean;
  /** Team account signed out on this device: the token was dropped, sign in again to open it */
  needsLogin: boolean;
  /** Solo: the security questions on file; empty for a profile made without them */
  securityQuestions: string[];
  /** The first-run tour was finished or skipped for this profile */
  tourDone: boolean;
  workspace: { name: string; inviteCode: string | null; apiUrl: string } | null;
}
/** What /trpc/health says about a DailyBee API (account.checkServer). */
export interface ServerInfo { version: string; db: 'memory' | 'postgres'; dbOk: boolean }
export interface AccountResult { ok: boolean; message: string; /** Set by checkServer when the server answered as a DailyBee API */ info?: ServerInfo }

/** One line in the bell (main/services/notifications.ts): what happened, when, and where to look. */
export type NotificationKind = 'session' | 'checkin' | 'report' | 'sync' | 'system';
export type NotificationTone = 'neutral' | 'success' | 'warning' | 'danger';
export interface AppNotification { id: string; ts: number; kind: NotificationKind; tone: NotificationTone; title: string; text?: string; screen?: ScreenId; read: boolean; key?: string }

/** A security question with its answer: asked when a solo profile is created, and again to reset a forgotten password. */
export interface SecurityAnswer { question: string; answer: string }
export interface SoloSetup { name: string; email: string; password: string; recovery: SecurityAnswer[] }
/** The questions offered in the wizard and in Settings › Account. */
export const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'In what city were you born?',
  'What was the name of your first school?',
  'What was your childhood nickname?',
  'What is the name of the street you grew up on?',
  'What was the make of your first car?',
  'What was the name of your first employer?',
  'What is the title of your favourite book?',
] as const;

/** One of the profiles on this device (main/services/profiles.ts); each has its own database. */
export interface ProfileSummary { id: string; name: string; initials: string; /** Mirrored from the profile's settings so the picker can show it before the database opens */ avatar: string; email: string; mode: AccountMode | null; role: AccountRole | null; workspace: string | null; setupDone: boolean; lastUsedAt: number }
export interface ProfilesStatus {
  /** The open profile's id ('demo' in demo mode), or null when signed out */
  open: string | null;
  demo: boolean;
  profiles: ProfileSummary[];
}

export interface ToastMessage { id: number; text: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }

export type RecategoriseTarget = { kind: 'domain'; value: string } | { kind: 'app'; value: string };
