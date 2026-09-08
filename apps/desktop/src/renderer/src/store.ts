import type { Category, PermissionStatus } from '@dailybee/tracker/types';
import type { DeepPartial } from '@shared/types';
import type { ActivitySummary, Checkin, EndTaskResult, Entry, Project, RecategoriseTarget, ScreenId, Session, SessionTask, Settings, SyncStatus, TaskRef, ToastMessage } from '@shared/types';
import { create } from 'zustand';
import { api } from './bridge';

export type PromptId = 'start' | 'end' | 'report' | null;

const SCREENS: ScreenId[] = ['today', 'reports', 'team', 'tasks', 'admin', 'settings'];
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

  init(): Promise<void>;
  nav(screen: ScreenId): void;
  openPrompt(p: PromptId, resume?: Entry | null): void;
  showToast(text: string, tone?: ToastMessage['tone']): void;
  dismissToast(): void;
  startTask(t: SessionTask): Promise<void>;
  stopTask(r: EndTaskResult): Promise<void>;
  toggleEntry(id: string): Promise<void>;
  triggerCheckin(kind?: 'drift' | 'pulse'): Promise<void>;
  answerCheckin(id: string, answer: string): Promise<void>;
  recategorise(target: RecategoriseTarget, cat: Category): Promise<void>;
  updateSettings(patch: DeepPartial<Settings>): Promise<void>;
  refreshPermissions(): Promise<void>;
  requestPermission(id: string): Promise<void>;
  saveTask(t: TaskRef): Promise<void>;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;

export const useStore = create<AppState>()((set, get) => ({
  ready: false,
  screen: savedScreen(),
  session: { running: false, startedAt: null, current: null },
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

  async init() {
    if (get().ready) return;
    const [session, entries, activity, checkins, settings, projects, tasks, sync] = await Promise.all([
      api.session.get(), api.entries.list(), api.activity.summary(), api.checkins.list(), api.settings.get(), api.data.projects(), api.data.tasks(), api.sync.status(),
    ]);
    set({ session, entries, activity, checkins, settings, projects, tasks, sync, ready: true, now: Date.now() });
    api.session.onChange((s) => set({ session: s }));
    api.entries.onChange((e) => set({ entries: e }));
    api.activity.onChange((a) => set({ activity: a }));
    api.checkins.onChange((c) => set({ checkins: c }));
    api.checkins.onPrompt((c) => set({ activeCheckin: c }));
    api.settings.onChange((s) => set({ settings: s }));
    api.sync.onChange((s) => set({ sync: s }));
    api.ui.onToast((t) => get().showToast(t.text, t.tone));
    api.ui.onNavigate((target) => {
      if (target.startsWith('prompt:')) get().openPrompt(target.slice(7) as PromptId);
      else if (target === 'checkin') void get().triggerCheckin('drift');
      else if (SCREENS.includes(target as ScreenId)) get().nav(target as ScreenId);
    });
    setInterval(() => set({ now: Date.now() }), 1000);
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
}));

export function elapsedSeconds(session: Session, now: number): number {
  return session.running && session.startedAt ? Math.max(0, Math.floor((now - session.startedAt) / 1000)) : 0;
}

export const selectElapsed = (s: AppState): number => elapsedSeconds(s.session, s.now);

/** Entries + running session, in seconds (Tracked today). */
export const selectTrackedToday = (s: AppState): number => s.entries.reduce((a, e) => a + e.seconds, 0) + elapsedSeconds(s.session, s.now);

export function shortDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m` : sec > 0 ? '<1m' : '0m';
}

export const useProject = (id: string): Project | undefined => useStore((s) => s.projects.find((p) => p.id === id));
