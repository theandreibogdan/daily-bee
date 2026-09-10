import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { writeFileSync } from 'node:fs';
import type { Category } from '@dailybee/tracker';
import { CH, EV } from '../shared/api';
import type { AccountResult, CheckinKind, DeepPartial, EndTaskResult, ProfilesStatus, Project, RecategoriseTarget, SecurityAnswer, SessionTask, Settings, SoloSetup, TaskRef, ToastMessage } from '../shared/types';
import { dayKey } from '../shared/time';
import { TASKS } from '../shared/fake';
import type { Repo } from './repo';
import type { AccountService } from './services/account';
import type { CheckinService } from './services/checkins';
import type { PermissionService } from './services/permissions';
import type { ReportService } from './services/reports';
import type { SessionService } from './services/session';
import type { SettingsService } from './services/settings';
import type { SyncService } from './services/sync';
import type { TrackerService } from './services/tracker';
import type { Windows } from './windows';

export interface Services {
  repo: Repo; settings: SettingsService; session: SessionService; tracker: TrackerService; checkins: CheckinService;
  reports: ReportService; sync: SyncService; permissions: PermissionService; windows: Windows; account: AccountService;
  /** Demo mode seeds the kit's tasks; live mode starts empty */
  demo: boolean;
}

let toastSeq = 0;

/** Channels registered for the open profile; removed again when it closes (unregisterIpc). */
const registered = new Set<string>();

export function registerIpc(s: Services): void {
  const { repo, settings, session, tracker, checkins, reports, sync, permissions, windows, account, demo } = s;
  const handle = (ch: string, fn: Parameters<typeof ipcMain.handle>[1]) => { ipcMain.handle(ch, fn); registered.add(ch); };
  const bc = (ch: string, payload: unknown) => windows.broadcast(ch, payload);

  // ---- events: main → renderer ----------------------------------------
  session.on('change', (v) => bc(EV.session, v));
  session.on('entries', () => bc(EV.entries, repo.entriesForDay(dayKey())));
  tracker.on('summary', (v) => bc(EV.activity, v));
  checkins.on('prompt', (c) => { if (c === null) bc(EV.checkinPrompt, null); });
  checkins.on('change', (v) => bc(EV.checkins, v));
  settings.on('change', (v) => bc(EV.settings, v));
  sync.on('change', (v) => bc(EV.sync, v));
  sync.on('projects', (v) => bc(EV.projects, v));
  account.on('change', (v) => bc(EV.account, v));
  const toast = makeToaster(windows);

  // ---- account (wizard, lock, team sign-in) ------------------------------
  const fail = (e: unknown): AccountResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });
  handle(CH.accountStatus, () => account.status());
  handle(CH.accountSetupSolo, (_e, p: SoloSetup) => account.setupSolo(p));
  handle(CH.accountUnlock, (_e, password: string) => account.unlock(password));
  handle(CH.accountLock, () => account.lock());
  handle(CH.accountChangePassword, (_e, current: string, next: string) => { try { return account.changePassword(current, next); } catch (e) { return fail(e); } });
  handle(CH.accountTeamCreate, (_e, p: { apiUrl: string; workspaceName: string; name: string; email: string; password: string }) => account.teamCreate(p));
  handle(CH.accountTeamJoin, (_e, p: { apiUrl: string; inviteCode: string; name: string; email: string; password: string }) => account.teamJoin(p));
  handle(CH.accountTeamLogin, (_e, p: { apiUrl: string; email: string; password: string }) => account.teamLogin(p));
  handle(CH.accountResetPassword, (_e, next: string, answers: string[]) => account.resetPassword(next, answers ?? []));
  handle(CH.accountCheckRecovery, (_e, answers: string[]) => account.checkRecovery(answers ?? []));
  handle(CH.accountSetRecovery, (_e, current: string, recovery: SecurityAnswer[]) => account.setRecovery(current, recovery ?? []));
  handle(CH.accountCheckServer, (_e, apiUrl: string) => account.checkServer(apiUrl ?? ''));

  // ---- session ----------------------------------------------------------
  handle(CH.sessionGet, () => session.get());
  handle(CH.sessionStart, (_e, task: SessionTask) => {
    const st = session.start(task);
    bc(EV.entries, repo.entriesForDay(dayKey()));
    return st;
  });
  handle(CH.sessionStop, (_e, result: EndTaskResult) => {
    const r = session.stop(result);
    bc(EV.entries, repo.entriesForDay(dayKey()));
    void sync.pushDay().catch(() => {});
    return r;
  });

  // ---- entries ----------------------------------------------------------
  handle(CH.entriesList, (_e, day?: string) => repo.entriesForDay(day ?? dayKey()));
  handle(CH.entriesToggle, (_e, id: string) => {
    const e = repo.entry(id);
    if (e) {
      e.done = !e.done;
      if (e.done && !e.outcome) e.outcome = 'Done';
      repo.upsertEntry(e);
      // Keep the linked task's status in step, as stopping a task does.
      const linked = e.ref ? repo.tasks().find((t) => t.id === e.ref) : undefined;
      if (linked) repo.saveTask({ ...linked, status: e.done ? 'Done' : linked.status === 'Done' ? 'In progress' : linked.status });
    }
    const list = repo.entriesForDay(dayKey());
    bc(EV.entries, list);
    return list;
  });

  // ---- activity ---------------------------------------------------------
  handle(CH.activitySummary, () => tracker.summary());
  handle(CH.activityRecategorise, (_e, target: RecategoriseTarget, cat: Category) => tracker.recategorise(target, cat));
  handle(CH.activityRules, () => tracker.userRules());
  handle(CH.activityRemoveRule, (_e, id: number) => tracker.removeRule(id));

  // ---- check-ins --------------------------------------------------------
  handle(CH.checkinsList, () => checkins.list());
  handle(CH.checkinsTrigger, (_e, kind?: CheckinKind) => checkins.trigger(kind));
  handle(CH.checkinsAnswer, (_e, id: string, answer: string) => checkins.answer(id, answer));

  // ---- reports ----------------------------------------------------------
  handle(CH.reportsGenerate, (_e, day?: string) => reports.generate(day || undefined));
  handle(CH.reportsDay, (_e, day: string) => reports.day(day || undefined));
  handle(CH.reportsCurrent, () => reports.current());
  handle(CH.reportsSave, (_e, patch: { notes?: string }) => reports.save(patch));
  handle(CH.reportsSend, async () => { const r = await reports.send(); void sync.pushDay().catch(() => {}); return r; });
  handle(CH.reportsHistory, () => reports.history());
  handle(CH.reportsGet, (_e, day: string) => reports.get(day));

  // ---- settings ---------------------------------------------------------
  handle(CH.settingsGet, () => settings.get());
  handle(CH.settingsUpdate, (_e, patch: DeepPartial<Settings>) => settings.update(patch));
  handle(CH.settingsPermissions, () => permissions.list());
  handle(CH.settingsRequestPermission, (_e, id: string) => permissions.request(id));
  handle(CH.settingsTestCapture, async () => {
    const x = await tracker.testCapture();
    return { app: x.app, title: x.title, url: x.url, urlSource: x.urlSource };
  });

  // ---- reference data ---------------------------------------------------
  // Projects start from the kit's three and live in the database from then on; a connected workspace mirrors them.
  handle(CH.dataProjects, () => repo.projects());
  handle(CH.dataSaveProject, async (_e, p: Project) => {
    const clean: Project = { id: p.id, name: p.name.trim(), color: p.color, budgetHours: Math.max(0, Number(p.budgetHours) || 0), ...(p.archived ? { archived: true } : {}) };
    const list = repo.projects();
    const i = list.findIndex((x) => x.id === clean.id);
    if (i >= 0) list[i] = clean; else list.push(clean);
    repo.saveProjects(list);
    bc(EV.projects, list);
    const warning = await sync.pushProject(clean);
    if (warning) toast(warning, 'warning');
    return list;
  });
  handle(CH.dataRemoveProject, async (_e, id: string) => {
    const list = repo.projects();
    const p = list.find((x) => x.id === id);
    if (!p) return { ok: false, message: 'That project no longer exists', projects: list };
    const use = repo.projectUsage(id);
    if (use.tasks || use.entries) {
      const parts = [use.tasks ? `${use.tasks} task${use.tasks === 1 ? '' : 's'}` : '', use.entries ? `${use.entries} entr${use.entries === 1 ? 'y' : 'ies'}` : ''].filter(Boolean).join(' and ');
      return { ok: false, message: `${p.name} is still used by ${parts}. Archive it instead.`, projects: list };
    }
    const next = list.filter((x) => x.id !== id);
    repo.saveProjects(next);
    bc(EV.projects, next);
    const warning = await sync.pushProject(p, true);
    if (warning) toast(warning, 'warning');
    return { ok: true, message: `${p.name} deleted`, projects: next };
  });
  // The kit's sample backlog is demo-only; a live install starts with the tasks you create.
  handle(CH.dataTasks, () => { if (demo && repo.taskCount() === 0) for (const t of TASKS) repo.saveTask(t); return repo.tasks(); });
  handle(CH.dataSaveTask, (_e, t: TaskRef) => { repo.saveTask(t); return repo.tasks(); });

  // ---- team / admin / sync ---------------------------------------------
  handle(CH.teamData, (_e, range: 'day' | 'week' | 'month') => sync.team(range));
  handle(CH.teamAdmin, (_e, range: 'week' | 'month' | 'quarter', team: string) => sync.admin(range, team));
  handle(CH.teamNudge, (_e, initials: string) => sync.nudge(initials));
  handle(CH.teamSetPolicy, (_e, rules: Array<[string, boolean]>) => sync.setPolicy(rules));
  handle(CH.syncStatus, () => sync.getStatus());
  handle(CH.syncPush, () => sync.pushDay());

  // ---- ui ---------------------------------------------------------------
  handle(CH.uiCopy, (_e, text: string) => { clipboard.writeText(text); });
  handle(CH.uiOpenExternal, (_e, url: string) => { if (/^https?:\/\//.test(url)) return shell.openExternal(url); return undefined; });
  handle(CH.uiSaveText, async (e, name: string, text: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const ext = (name.split('.').pop() ?? 'txt').toLowerCase();
    const opts = { defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return false;
    writeFileSync(r.filePath, text, 'utf8');
    return true;
  });

}

/** Drop the open profile's handlers so the next profile can register its own. */
export function unregisterIpc(): void {
  for (const ch of registered) ipcMain.removeHandler(ch);
  registered.clear();
}

export interface ProfileOps {
  status(): ProfilesStatus;
  open(id: string): Promise<ProfilesStatus>;
  create(): Promise<ProfilesStatus>;
  close(): Promise<ProfilesStatus>;
  discard(): Promise<ProfilesStatus>;
  remove(id: string): Promise<ProfilesStatus>;
}

/** Handlers that outlive any profile: the profile list itself and the window controls. */
export function registerAppIpc(a: { windows: Windows; profiles: ProfileOps }): void {
  const { windows, profiles } = a;
  ipcMain.handle(CH.profilesStatus, () => profiles.status());
  ipcMain.handle(CH.profilesOpen, (_e, id: string) => profiles.open(id));
  ipcMain.handle(CH.profilesCreate, () => profiles.create());
  ipcMain.handle(CH.profilesClose, () => profiles.close());
  ipcMain.handle(CH.profilesDiscard, () => profiles.discard());
  ipcMain.handle(CH.profilesRemove, (_e, id: string) => profiles.remove(id));

  // ---- window controls (custom title bar) --------------------------------
  const senderWindow = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);
  ipcMain.handle(CH.windowMinimize, (e) => { senderWindow(e)?.minimize(); });
  ipcMain.handle(CH.windowToggleMaximize, (e) => { const w = senderWindow(e); if (!w) return; if (w.isMaximized()) w.unmaximize(); else w.maximize(); });
  ipcMain.handle(CH.windowClose, (e) => { senderWindow(e)?.close(); });
  ipcMain.handle(CH.windowState, (e) => { const w = senderWindow(e); return { maximized: !!w?.isMaximized(), focused: !!w?.isFocused() }; });
  ipcMain.handle(CH.windowShowMain, () => { windows.createMain(); });
}

export function makeToaster(windows: Windows) {
  return (text: string, tone: ToastMessage['tone'] = 'success') => windows.broadcast(EV.toast, { id: ++toastSeq, text, tone } satisfies ToastMessage);
}
