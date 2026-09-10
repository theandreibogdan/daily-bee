import type { Category, PermissionStatus, Rule } from '@dailybee/tracker/types';
import type { AccountResult, AccountStatus, AppNotification, AwayChoice, AwayPrompt, BackupPick, BackupResult, BackupStatus, EntryInput, EntryLog, EntryPatch, ProfilesStatus, RecentTask, SecurityAnswer, ShortcutStatus, SoloSetup, ActivitySummary, Checkin, CheckinKind, DaySummary, DeepPartial, EndTaskResult, Entry, Project, RecategoriseTarget, ReportDraft, ReportHistoryItem, Session, SessionTask, Settings, StartupStatus, SyncStatus, TaskRef, ToastMessage, WeekSummary } from './types';
import type { AdminData, TeamData } from './team';

/**
 * The renderer ↔ main contract. Implemented over IPC by the preload bridge and by an
 * in-memory mock (renderer/src/bridge/mock.ts) so the UI also runs in a plain browser.
 */
export interface DailyBeeApi {
  platform: 'darwin' | 'win32' | 'linux';
  demo: boolean;
  session: {
    get(): Promise<Session>;
    start(task: SessionTask): Promise<Session>;
    stop(result: EndTaskResult): Promise<{ session: Session; entry: Entry }>;
    onChange(cb: (s: Session) => void): () => void;
    /** The pending time-away question, if any (main/services/away.ts) */
    away(): Promise<AwayPrompt | null>;
    /** discard = leave the away time out; keep = count it as work; stop = open the wrap-up in the main window (used by the floating card) */
    chooseAway(id: string, choice: AwayChoice): Promise<AwayPrompt | null>;
    /** End the task at the moment you left, with the wrap-up from the End dialog; entry is null when less than a minute was on the clock */
    stopAway(id: string, result: EndTaskResult): Promise<{ session: Session; entry: Entry | null } | null>;
    onAway(cb: (p: AwayPrompt | null) => void): () => void;
    /** Tasks worked on in the last two weeks, newest first (the tray's Resume and Start recent) */
    recent(): Promise<RecentTask[]>;
    /** Start the most recent task again as it was; null when there is none */
    resumeLast(): Promise<Session | null>;
    startRecent(t: RecentTask): Promise<Session>;
    /** Stop with no questions: saved as partly done, to be corrected later if needed */
    stopNow(): Promise<{ session: Session; entry: Entry } | null>;
  };
  /** Entries, and the hand corrections to them (main/services/entries.ts): every correction lands in the change log. */
  entries: {
    list(day?: string): Promise<Entry[]>;
    /** Marks the entry done or not; a correction like any other */
    toggleDone(id: string): Promise<Entry[]>;
    add(input: EntryInput, reason?: string): Promise<Entry>;
    update(id: string, patch: EntryPatch, reason?: string): Promise<Entry>;
    /** Cut an entry after `atSeconds`; the second part gets the new title when one is given */
    split(id: string, atSeconds: number, opts?: { task?: string; project?: string; reason?: string }): Promise<{ first: Entry; second: Entry }>;
    remove(id: string, reason?: string): Promise<Entry>;
    /** The change log for a day (all days when none is given), with the chain check */
    log(day?: string): Promise<EntryLog>;
    onChange(cb: (e: Entry[]) => void): () => void;
  };
  activity: {
    summary(): Promise<ActivitySummary>;
    onChange(cb: (a: ActivitySummary) => void): () => void;
    recategorise(target: RecategoriseTarget, cat: Category): Promise<ActivitySummary>;
    rules(): Promise<Rule[]>;
    removeRule(id: number): Promise<Rule[]>;
  };
  checkins: {
    list(): Promise<Checkin[]>;
    /** Simulate a check-in (kit: "Check-in" button in the Today top bar); cycles drift → pulse → warning when no kind is given */
    trigger(kind?: CheckinKind): Promise<Checkin>;
    answer(id: string, answer: string): Promise<Checkin[]>;
    /** Active popup (null when dismissed) */
    onPrompt(cb: (c: Checkin | null) => void): () => void;
    onChange(cb: (c: Checkin[]) => void): () => void;
  };
  reports: {
    /** Build (or rebuild) the draft for a day from its entries, activity and check-ins; today by default */
    generate(day?: string): Promise<ReportDraft>;
    current(): Promise<ReportDraft | null>;
    save(patch: { notes?: string }): Promise<ReportDraft>;
    /** Today by default; a past day's report can be sent again after its entries were corrected */
    send(day?: string): Promise<{ ok: boolean; message: string; draft: ReportDraft }>;
    /** Every day with data, newest first */
    history(): Promise<ReportHistoryItem[]>;
    get(day: string): Promise<ReportDraft | null>;
    /** The full breakdown of one day: what Today shows, for any saved day */
    day(day: string): Promise<DaySummary>;
    /** Reports › Week: the week containing `start` (epoch ms; this week by default) against the week before */
    week(start?: number): Promise<WeekSummary>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: DeepPartial<Settings>): Promise<Settings>;
    onChange(cb: (s: Settings) => void): () => void;
    permissions(): Promise<PermissionStatus[]>;
    requestPermission(id: string): Promise<PermissionStatus[]>;
    testCapture(): Promise<{ app: string; title: string; url: string | null; urlSource: string }>;
    /** Whether the operating system launches DailyBee at login (Settings › Startup) */
    startup(): Promise<StartupStatus>;
    /** Whether the global shortcut is registered (Settings › Keyboard shortcut) */
    shortcut(): Promise<ShortcutStatus>;
  };
  /** Settings › Backup: the profile is one database file; copy it out, or bring a copy back (main/services/backup.ts). */
  backup: {
    status(): Promise<BackupStatus>;
    /** Native save dialog, then a copy of the database; DAILYBEE_BACKUP_DIR skips the dialog */
    export(): Promise<BackupResult>;
    /** Native open dialog; the file is inspected before anything is touched */
    pick(): Promise<BackupPick>;
    /** replace = into the open profile (its current data is kept beside it); new = as a new profile on this device */
    restore(file: string, mode: 'replace' | 'new'): Promise<BackupResult>;
  };
  data: {
    projects(): Promise<Project[]>;
    /** Create or update a project (id kept); pushed to the workspace when one is connected */
    saveProject(project: Project): Promise<Project[]>;
    /** Refused while tasks or entries still use the project (archive it instead) */
    removeProject(id: string): Promise<{ ok: boolean; message: string; projects: Project[] }>;
    onProjects(cb: (p: Project[]) => void): () => void;
    tasks(): Promise<TaskRef[]>;
    saveTask(task: TaskRef): Promise<TaskRef[]>;
  };
  team: {
    data(range: 'day' | 'week' | 'month'): Promise<TeamData>;
    admin(range: 'week' | 'month' | 'quarter', team: string): Promise<AdminData>;
    /** Workspace policy rules (leads); explains itself when no workspace is connected or the role is too low */
    setPolicy(rules: Array<[string, boolean]>): Promise<{ ok: boolean; message: string; policy: Array<[string, boolean]> }>;
    /** Ping a teammate through the workspace API; explains itself when no workspace is configured */
    nudge(initials: string): Promise<{ ok: boolean; message: string }>;
  };
  sync: {
    status(): Promise<SyncStatus>;
    pushNow(): Promise<SyncStatus>;
    onChange(cb: (s: SyncStatus) => void): () => void;
  };
  ui: {
    onToast(cb: (t: ToastMessage) => void): () => void;
    onNavigate(cb: (screen: string) => void): () => void;
    copyText(text: string): Promise<void>;
    openExternal(url: string): Promise<void>;
    /** Native "save as" for a text file (CSV export); resolves false when cancelled */
    saveText(name: string, text: string): Promise<boolean>;
  };
  /** First-run wizard, local profile lock and Team sign-in (see main/services/account.ts). */
  account: {
    status(): Promise<AccountStatus>;
    onChange(cb: (s: AccountStatus) => void): () => void;
    setupSolo(p: SoloSetup): Promise<AccountStatus>;
    unlock(password: string): Promise<AccountResult>;
    lock(): Promise<AccountStatus>;
    changePassword(current: string, next: string): Promise<AccountResult>;
    teamCreate(p: { apiUrl: string; workspaceName: string; name: string; email: string; password: string }): Promise<AccountResult>;
    teamJoin(p: { apiUrl: string; inviteCode: string; name: string; email: string; password: string }): Promise<AccountResult>;
    teamLogin(p: { apiUrl: string; email: string; password: string }): Promise<AccountResult>;
    /** Forgotten solo password: the security answers must match, then the new password is set */
    resetPassword(next: string, answers: string[]): Promise<AccountResult>;
    /** Check the security answers before asking for the new password (five misses block tries for 30 s) */
    checkRecovery(answers: string[]): Promise<AccountResult>;
    /** Set or change the security questions; needs the current password */
    setRecovery(current: string, recovery: SecurityAnswer[]): Promise<AccountResult>;
    /** Does a DailyBee API answer at this address? (the wizard's server guide; GET /trpc/health from the main process) */
    checkServer(apiUrl: string): Promise<AccountResult>;
    /** The first-run tour was finished or skipped */
    finishTour(): Promise<AccountStatus>;
  };
  /** The profiles on this device, each with its own database (main/services/profiles.ts). */
  profiles: {
    status(): Promise<ProfilesStatus>;
    onChange(cb: (s: ProfilesStatus) => void): () => void;
    /** Open a profile; solo profiles then ask for their password */
    open(id: string): Promise<ProfilesStatus>;
    /** A new, empty profile opened on the wizard */
    create(): Promise<ProfilesStatus>;
    /** Sign out: close the open profile and show the list; a team account drops its token */
    close(): Promise<ProfilesStatus>;
    /** Abandon the profile being set up (it is deleted) and show the list */
    discard(): Promise<ProfilesStatus>;
    /** Delete a closed profile and all its data on this device */
    remove(id: string): Promise<ProfilesStatus>;
  };
  /** The bell: the profile's log of what happened (tasks, check-ins, reports, sync), with unread state. */
  notifications: {
    list(): Promise<AppNotification[]>;
    onChange(cb: (n: AppNotification[]) => void): () => void;
    /** All of them when no ids are given */
    markRead(ids?: string[]): Promise<AppNotification[]>;
    clear(): Promise<AppNotification[]>;
  };
  /** Window controls for the custom title bar and the floating widget (no-ops outside Electron). */
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    /** Hides the main window to the tray; tracking continues */
    close(): Promise<void>;
    state(): Promise<WindowState>;
    onState(cb: (s: WindowState) => void): () => void;
    /** Show and focus the main window (from the widget or tray) */
    showMain(): Promise<void>;
  };
}

export interface WindowState { maximized: boolean; focused: boolean }

/** IPC channel names (invoke) */
export const CH = {
  sessionGet: 'session:get', sessionStart: 'session:start', sessionStop: 'session:stop', sessionRecent: 'session:recent', sessionResumeLast: 'session:resumeLast', sessionStartRecent: 'session:startRecent', sessionStopNow: 'session:stopNow',
  entriesList: 'entries:list', entriesToggle: 'entries:toggle', entriesAdd: 'entries:add', entriesUpdate: 'entries:update', entriesSplit: 'entries:split', entriesRemove: 'entries:remove', entriesLog: 'entries:log',
  awayGet: 'away:get', awayChoose: 'away:choose', awayStop: 'away:stop',
  backupStatus: 'backup:status', backupExport: 'backup:export', backupPick: 'backup:pick', backupRestore: 'backup:restore',
  activitySummary: 'activity:summary', activityRecategorise: 'activity:recategorise', activityRules: 'activity:rules', activityRemoveRule: 'activity:removeRule',
  checkinsList: 'checkins:list', checkinsTrigger: 'checkins:trigger', checkinsAnswer: 'checkins:answer',
  reportsGenerate: 'reports:generate', reportsCurrent: 'reports:current', reportsSave: 'reports:save', reportsSend: 'reports:send', reportsHistory: 'reports:history', reportsGet: 'reports:get', reportsDay: 'reports:day', reportsWeek: 'reports:week',
  settingsGet: 'settings:get', settingsUpdate: 'settings:update', settingsPermissions: 'settings:permissions', settingsRequestPermission: 'settings:requestPermission', settingsTestCapture: 'settings:testCapture', settingsStartup: 'settings:startup', settingsShortcut: 'settings:shortcut',
  dataProjects: 'data:projects', dataSaveProject: 'data:saveProject', dataRemoveProject: 'data:removeProject', dataTasks: 'data:tasks', dataSaveTask: 'data:saveTask',
  teamData: 'team:data', teamAdmin: 'team:admin', teamNudge: 'team:nudge', teamSetPolicy: 'team:setPolicy',
  syncStatus: 'sync:status', syncPush: 'sync:push',
  notificationsList: 'notifications:list', notificationsMarkRead: 'notifications:markRead', notificationsClear: 'notifications:clear',
  uiCopy: 'ui:copy', uiOpenExternal: 'ui:openExternal', uiSaveText: 'ui:saveText',
  windowMinimize: 'window:minimize', windowToggleMaximize: 'window:toggleMaximize', windowClose: 'window:close', windowState: 'window:state', windowShowMain: 'window:showMain',
  accountStatus: 'account:status', accountSetupSolo: 'account:setupSolo', accountUnlock: 'account:unlock', accountLock: 'account:lock', accountChangePassword: 'account:changePassword',
  accountTeamCreate: 'account:teamCreate', accountTeamJoin: 'account:teamJoin', accountTeamLogin: 'account:teamLogin', accountResetPassword: 'account:resetPassword', accountCheckRecovery: 'account:checkRecovery', accountSetRecovery: 'account:setRecovery', accountCheckServer: 'account:checkServer', accountFinishTour: 'account:finishTour',
  profilesStatus: 'profiles:status', profilesOpen: 'profiles:open', profilesCreate: 'profiles:create', profilesClose: 'profiles:close', profilesDiscard: 'profiles:discard', profilesRemove: 'profiles:remove',
} as const;

/** IPC event names (main → renderer) */
export const EV = {
  session: 'ev:session', entries: 'ev:entries', away: 'ev:away', activity: 'ev:activity', checkinPrompt: 'ev:checkinPrompt', checkins: 'ev:checkins', settings: 'ev:settings', sync: 'ev:sync', toast: 'ev:toast', navigate: 'ev:navigate', windowState: 'ev:windowState', profiles: 'ev:profiles', notifications: 'ev:notifications', projects: 'ev:projects', account: 'ev:account',
} as const;
