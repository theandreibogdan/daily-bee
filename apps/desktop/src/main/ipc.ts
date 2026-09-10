import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { writeFileSync } from 'node:fs';
import type { Category } from '@dailybee/tracker';
import { CH, EV } from '../shared/api';
import type { CheckinKind, DeepPartial, EndTaskResult, Project, RecategoriseTarget, SessionTask, Settings, TaskRef, ToastMessage } from '../shared/types';
import { dayKey } from '../shared/time';
import { TASKS } from '../shared/fake';
import type { Repo } from './repo';
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
  reports: ReportService; sync: SyncService; permissions: PermissionService; windows: Windows;
  /** Demo mode seeds the kit's tasks; live mode starts empty */
  demo: boolean;
}

let toastSeq = 0;

export function registerIpc(s: Services): void {
  const { repo, settings, session, tracker, checkins, reports, sync, permissions, windows, demo } = s;
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
  const toast = makeToaster(windows);

  // ---- session ----------------------------------------------------------
  ipcMain.handle(CH.sessionGet, () => session.get());
  ipcMain.handle(CH.sessionStart, (_e, task: SessionTask) => {
    const st = session.start(task);
    bc(EV.entries, repo.entriesForDay(dayKey()));
    return st;
  });
  ipcMain.handle(CH.sessionStop, (_e, result: EndTaskResult) => {
    const r = session.stop(result);
    bc(EV.entries, repo.entriesForDay(dayKey()));
    void sync.pushDay().catch(() => {});
    return r;
  });

  // ---- entries ----------------------------------------------------------
  ipcMain.handle(CH.entriesList, (_e, day?: string) => repo.entriesForDay(day ?? dayKey()));
  ipcMain.handle(CH.entriesToggle, (_e, id: string) => {
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
  ipcMain.handle(CH.activitySummary, () => tracker.summary());
  ipcMain.handle(CH.activityRecategorise, (_e, target: RecategoriseTarget, cat: Category) => tracker.recategorise(target, cat));
  ipcMain.handle(CH.activityRules, () => tracker.userRules());
  ipcMain.handle(CH.activityRemoveRule, (_e, id: number) => tracker.removeRule(id));

  // ---- check-ins --------------------------------------------------------
  ipcMain.handle(CH.checkinsList, () => checkins.list());
  ipcMain.handle(CH.checkinsTrigger, (_e, kind?: CheckinKind) => checkins.trigger(kind));
  ipcMain.handle(CH.checkinsAnswer, (_e, id: string, answer: string) => checkins.answer(id, answer));

  // ---- reports ----------------------------------------------------------
  ipcMain.handle(CH.reportsGenerate, (_e, day?: string) => reports.generate(day || undefined));
  ipcMain.handle(CH.reportsDay, (_e, day: string) => reports.day(day || undefined));
  ipcMain.handle(CH.reportsCurrent, () => reports.current());
  ipcMain.handle(CH.reportsSave, (_e, patch: { notes?: string }) => reports.save(patch));
  ipcMain.handle(CH.reportsSend, async () => { const r = await reports.send(); void sync.pushDay().catch(() => {}); return r; });
  ipcMain.handle(CH.reportsHistory, () => reports.history());
  ipcMain.handle(CH.reportsGet, (_e, day: string) => reports.get(day));

  // ---- settings ---------------------------------------------------------
  ipcMain.handle(CH.settingsGet, () => settings.get());
  ipcMain.handle(CH.settingsUpdate, (_e, patch: DeepPartial<Settings>) => settings.update(patch));
  ipcMain.handle(CH.settingsPermissions, () => permissions.list());
  ipcMain.handle(CH.settingsRequestPermission, (_e, id: string) => permissions.request(id));
  ipcMain.handle(CH.settingsTestCapture, async () => {
    const x = await tracker.testCapture();
    return { app: x.app, title: x.title, url: x.url, urlSource: x.urlSource };
  });

  // ---- reference data ---------------------------------------------------
  // Projects start from the kit's three and live in the database from then on; a connected workspace mirrors them.
  ipcMain.handle(CH.dataProjects, () => repo.projects());
  ipcMain.handle(CH.dataSaveProject, async (_e, p: Project) => {
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
  ipcMain.handle(CH.dataRemoveProject, async (_e, id: string) => {
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
  ipcMain.handle(CH.dataTasks, () => { if (demo && repo.taskCount() === 0) for (const t of TASKS) repo.saveTask(t); return repo.tasks(); });
  ipcMain.handle(CH.dataSaveTask, (_e, t: TaskRef) => { repo.saveTask(t); return repo.tasks(); });

  // ---- team / admin / sync ---------------------------------------------
  ipcMain.handle(CH.teamData, (_e, range: 'day' | 'week' | 'month') => sync.team(range));
  ipcMain.handle(CH.teamAdmin, (_e, range: 'week' | 'month' | 'quarter', team: string) => sync.admin(range, team));
  ipcMain.handle(CH.teamNudge, (_e, initials: string) => sync.nudge(initials));
  ipcMain.handle(CH.teamSetPolicy, (_e, rules: Array<[string, boolean]>) => sync.setPolicy(rules));
  ipcMain.handle(CH.syncStatus, () => sync.getStatus());
  ipcMain.handle(CH.syncPush, () => sync.pushDay());

  // ---- ui ---------------------------------------------------------------
  ipcMain.handle(CH.uiCopy, (_e, text: string) => { clipboard.writeText(text); });
  ipcMain.handle(CH.uiOpenExternal, (_e, url: string) => { if (/^https?:\/\//.test(url)) return shell.openExternal(url); return undefined; });
  ipcMain.handle(CH.uiSaveText, async (e, name: string, text: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const ext = (name.split('.').pop() ?? 'txt').toLowerCase();
    const opts = { defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return false;
    writeFileSync(r.filePath, text, 'utf8');
    return true;
  });

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
