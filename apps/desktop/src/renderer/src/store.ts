import type { Category, PermissionStatus } from '@dailybee/tracker/types';
import type { DeepPartial } from '@shared/types';
import { IDLE_SESSION, elapsedSeconds } from '@shared/session';
import type { AccountStatus, ActivitySummary, Checkin, CheckinKind, EndTaskResult, Entry, ProfilesStatus, Project, RecategoriseTarget, ScreenId, Session, SessionTask, Settings, SyncStatus, TaskRef, ToastMessage } from '@shared/types';
import { create } from 'zustand';
import { api } from './bridge';

/** 'report' regenerates the draft; 'report-preview' shows the saved draft without rebuilding it */
export type PromptId = 'start' | 'end' | 'report' | 'report-preview' | null;

const SCREENS: ScreenId[] = ['today', 'reports', 'team', 'tasks', 'projects', 'admin', 'settings'];
const savedScreen = (): ScreenId => {
  try { const s = localStorage.getItem('db-screen'); return SCREENS.includes(s as ScreenId) ? (s as ScreenId) : 'today'; } catch { return 'today'; }
};

export interface AppState {
  ready: boolean;
  screen: ScreenId;
  session: Session;
  now: number;
  entries: Entry[];
  activity: ActivitySummary | null;
  checkins: Checkin[];
  activeCheckin: Checkin | null;
  prompt: PromptId;
  resumeEntry: Entry | null;
  toast: ToastMessage | null;
  settings: Settings | null;
  permissions: PermissionStatus[];
  projects: Project[];
  tasks: TaskRef[];
  sync: SyncStatus | null;
  /** The profiles on this device and which one is open; null until loaded */
  profiles: ProfilesStatus | null;
  /** Who uses the open profile (wizard result); null while no profile is open */
  account: AccountStatus | null;
  /** Settings › Account → "Solo or Team…": the wizard runs again for the open profile */
  converting: boolean;
  /** The guided first run (components/Tour.tsx) is showing */
  tourOpen: boolean;
  /** Command palette (search icon, Ctrl/⌘K) */
  paletteOpen: boolean;
  /** Cross-screen hand-offs: select a person on Admin › People, open a task's dialog, pick the Reports tab */
  adminFocus: string | null;
  tasksFocus: string | null;
  reportsView: 'today' | 'history' | null;

  init(): Promise<void>;
  /** (Re)load everything for the open profile; clears the data when none is open */
  load(): Promise<void>;
  nav(screen: ScreenId): void;
  setPalette(open: boolean): void;
  setConverting(on: boolean): void;
  setTour(open: boolean): void;
  focusAdmin(initials: string): void;
  focusTask(id: string): void;
  openReports(view: 'today' | 'history'): void;
  openPrompt(p: PromptId, resume?: Entry | null): void;
  showToast(text: string, tone?: ToastMessage['tone']): void;
  dismissToast(): void;
  startTask(t: SessionTask): Promise<void>;
  stopTask(r: EndTaskResult): Promise<void>;
  toggleEntry(id: string): Promise<void>;
  triggerCheckin(kind?: CheckinKind): Promise<void>;
  answerCheckin(id: string, answer: string): Promise<void>;
  recategorise(target: RecategoriseTarget, cat: Category): Promise<void>;
  updateSettings(patch: DeepPartial<Settings>): Promise<void>;
  refreshPermissions(): Promise<void>;
  requestPermission(id: string): Promise<void>;
  saveTask(t: TaskRef): Promise<void>;
  saveProject(p: Project): Promise<void>;
  /** Resolves false (with a toast) when the project is still in use */
  removeProject(id: string): Promise<boolean>;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;
let subscribed = false;

/** What the store holds while no profile is open. */
const CLOSED = { account: null, session: IDLE_SESSION, entries: [], activity: null, checkins: [], activeCheckin: null, prompt: null as PromptId, resumeEntry: null, settings: null, projects: [], tasks: [], sync: null, converting: false, paletteOpen: false, tourOpen: false };

export const useStore = create<AppState>()((set, get) => ({
  ready: false,
  screen: savedScreen(),
  session: IDLE_SESSION,
  now: Date.now(),
  entries: [],
  activity: null,
  checkins: [],
  activeCheckin: null,
  prompt: null,
  resumeEntry: null,
  toast: null,
  settings: null,
  permissions: [],
  projects: [],
  tasks: [],
  sync: null,
  profiles: null,
  account: null,
  converting: false,
  tourOpen: false,
  paletteOpen: false,
  adminFocus: null,
  tasksFocus: null,
  reportsView: null,

  setPalette(open) { set({ paletteOpen: open }); },
  setConverting(on) { set({ converting: on, paletteOpen: false }); },
  setTour(open) { set({ tourOpen: open, paletteOpen: false, prompt: open ? null : get().prompt }); },
  focusAdmin(initials) { get().nav('admin'); set({ adminFocus: initials, paletteOpen: false }); },
  focusTask(id) { get().nav('tasks'); set({ tasksFocus: id, paletteOpen: false }); },
  openReports(view) { get().nav('reports'); set({ reportsView: view, paletteOpen: false }); },

  async init() {
    if (!subscribed) {
      subscribed = true;
      // Opening or closing a profile swaps every service behind the bridge: reload it all.
      api.profiles.onChange(() => void get().load());
      api.account.onChange((a) => set({ account: a, converting: false }));
      api.session.onChange((s) => set({ session: s }));
      api.entries.onChange((e) => set({ entries: e }));
      api.activity.onChange((a) => set({ activity: a }));
      api.checkins.onChange((c) => set({ checkins: c }));
      api.checkins.onPrompt((c) => set({ activeCheckin: c }));
      api.settings.onChange((s) => set({ settings: s }));
      api.sync.onChange((s) => set({ sync: s }));
      api.data.onProjects((p) => set({ projects: p }));
      api.ui.onToast((t) => get().showToast(t.text, t.tone));
      api.ui.onNavigate((target) => {
        if (target.startsWith('prompt:')) get().openPrompt(target.slice(7) as PromptId);
        else if (target === 'checkin') void get().triggerCheckin('drift');
        else if (target === 'warning') void get().triggerCheckin('warning');
        else if (SCREENS.includes(target as ScreenId)) get().nav(target as ScreenId);
      });
      setInterval(() => set({ now: Date.now() }), 1000);
      // Catch up immediately when the window becomes visible or focused again.
      const refresh = () => set({ now: Date.now() });
      document.addEventListener('visibilitychange', refresh);
      window.addEventListener('focus', refresh);
    }
    await get().load();
  },

  async load() {
    const profiles = await api.profiles.status();
    if (!profiles.open) { set({ ...CLOSED, profiles, ready: true, now: Date.now() }); return; }
    const [session, entries, activity, checkins, settings, projects, tasks, sync, account] = await Promise.all([
      api.session.get(), api.entries.list(), api.activity.summary(), api.checkins.list(), api.settings.get(), api.data.projects(), api.data.tasks(), api.sync.status(), api.account.status(),
    ]);
    set({ profiles, session, entries, activity, checkins, settings, projects, tasks, sync, account, converting: false, ready: true, now: Date.now() });
    void get().refreshPermissions();
  },

  nav(screen) {
    set({ screen });
    try { localStorage.setItem('db-screen', screen); } catch { /* private mode */ }
  },

  openPrompt(prompt, resume = null) { set({ prompt, resumeEntry: resume }); },

  showToast(text, tone = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: { id: ++toastSeq, text, tone } });
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },
  dismissToast() { if (toastTimer) clearTimeout(toastTimer); set({ toast: null }); },

  async startTask(t) {
    const session = await api.session.start(t);
    const [entries, tasks] = await Promise.all([api.entries.list(), api.data.tasks()]);
    set({ session, prompt: null, resumeEntry: null, entries, tasks });
    get().showToast('Tracking “' + t.task + '”');
  },

  async stopTask(r) {
    const seconds = elapsedSeconds(get().session, Date.now());
    const { session } = await api.session.stop(r);
    const [entries, tasks] = await Promise.all([api.entries.list(), api.data.tasks()]);
    set({ session, prompt: null, entries, tasks });
    get().showToast('Entry saved · ' + shortDuration(seconds));
  },

  async toggleEntry(id) { set({ entries: await api.entries.toggleDone(id) }); },

  async triggerCheckin(kind) {
    const c = await api.checkins.trigger(kind);
    // Warnings render in their own full-screen window (or the mock's overlay); popups render in-app.
    set({ activeCheckin: c });
  },

  async answerCheckin(id, answer) {
    const checkins = await api.checkins.answer(id, answer);
    set({ checkins, activeCheckin: null });
    get().showToast(answer === 'dismiss' ? 'Check-in dismissed' : 'Noted: ' + (answer === 'back' ? 'back to it' : answer === 'break' ? 'taking a break' : answer === 'relevant' ? 'recategorised as work' : answer.toLowerCase()));
  },

  async recategorise(target, cat) {
    set({ activity: await api.activity.recategorise(target, cat) });
    get().showToast(`${target.value} → ${cat}`);
  },

  async updateSettings(patch) { set({ settings: await api.settings.update(patch) }); },
  async refreshPermissions() { try { set({ permissions: await api.settings.permissions() }); } catch { /* not available in this build */ } },
  async requestPermission(id) { set({ permissions: await api.settings.requestPermission(id) }); },
  async saveTask(t) { set({ tasks: await api.data.saveTask(t) }); },
  async saveProject(p) { set({ projects: await api.data.saveProject(p) }); },
  async removeProject(id) {
    const r = await api.data.removeProject(id);
    set({ projects: r.projects });
    get().showToast(r.message, r.ok ? 'success' : 'warning');
    return r.ok;
  },
}));

export { elapsedSeconds };

export const selectElapsed = (s: AppState): number => elapsedSeconds(s.session, s.now);

/** Entries + running session, in seconds (Tracked today). */
export const selectTrackedToday = (s: AppState): number => s.entries.reduce((a, e) => a + e.seconds, 0) + elapsedSeconds(s.session, s.now);

export function shortDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m` : sec > 0 ? '<1m' : '0m';
}

export const useProject = (id: string): Project | undefined => useStore((s) => s.projects.find((p) => p.id === id));
