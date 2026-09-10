import type { Category, PermissionStatus, Rule } from '@dailybee/tracker/types';
import type { ActivitySummary, Checkin, CheckinKind, DaySummary, DeepPartial, EndTaskResult, Entry, Project, RecategoriseTarget, ReportDraft, ReportHistoryItem, Session, SessionTask, Settings, SyncStatus, TaskRef, ToastMessage } from './types';
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
  };
  entries: {
    list(day?: string): Promise<Entry[]>;
    toggleDone(id: string): Promise<Entry[]>;
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
    send(): Promise<{ ok: boolean; message: string; draft: ReportDraft }>;
    /** Every day with data, newest first */
    history(): Promise<ReportHistoryItem[]>;
    get(day: string): Promise<ReportDraft | null>;
    /** The full breakdown of one day: what Today shows, for any saved day */
    day(day: string): Promise<DaySummary>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: DeepPartial<Settings>): Promise<Settings>;
    onChange(cb: (s: Settings) => void): () => void;
    permissions(): Promise<PermissionStatus[]>;
    requestPermission(id: string): Promise<PermissionStatus[]>;
    testCapture(): Promise<{ app: string; title: string; url: string | null; urlSource: string }>;
  };
  data: {
    projects(): Promise<Project[]>;
    tasks(): Promise<TaskRef[]>;
    saveTask(task: TaskRef): Promise<TaskRef[]>;
  };
  team: {
    data(range: 'day' | 'week' | 'month'): Promise<TeamData>;
    admin(range: 'week' | 'month' | 'quarter', team: string): Promise<AdminData>;
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
  sessionGet: 'session:get', sessionStart: 'session:start', sessionStop: 'session:stop',
  entriesList: 'entries:list', entriesToggle: 'entries:toggle',
  activitySummary: 'activity:summary', activityRecategorise: 'activity:recategorise', activityRules: 'activity:rules', activityRemoveRule: 'activity:removeRule',
  checkinsList: 'checkins:list', checkinsTrigger: 'checkins:trigger', checkinsAnswer: 'checkins:answer',
  reportsGenerate: 'reports:generate', reportsCurrent: 'reports:current', reportsSave: 'reports:save', reportsSend: 'reports:send', reportsHistory: 'reports:history', reportsGet: 'reports:get', reportsDay: 'reports:day',
  settingsGet: 'settings:get', settingsUpdate: 'settings:update', settingsPermissions: 'settings:permissions', settingsRequestPermission: 'settings:requestPermission', settingsTestCapture: 'settings:testCapture',
  dataProjects: 'data:projects', dataTasks: 'data:tasks', dataSaveTask: 'data:saveTask',
  teamData: 'team:data', teamAdmin: 'team:admin', teamNudge: 'team:nudge',
  syncStatus: 'sync:status', syncPush: 'sync:push',
  uiCopy: 'ui:copy', uiOpenExternal: 'ui:openExternal', uiSaveText: 'ui:saveText',
  windowMinimize: 'window:minimize', windowToggleMaximize: 'window:toggleMaximize', windowClose: 'window:close', windowState: 'window:state', windowShowMain: 'window:showMain',
} as const;

/** IPC event names (main → renderer) */
export const EV = {
  session: 'ev:session', entries: 'ev:entries', activity: 'ev:activity', checkinPrompt: 'ev:checkinPrompt', checkins: 'ev:checkins', settings: 'ev:settings', sync: 'ev:sync', toast: 'ev:toast', navigate: 'ev:navigate', windowState: 'ev:windowState',
} as const;
