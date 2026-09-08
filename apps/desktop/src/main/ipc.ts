import { clipboard, ipcMain, shell } from 'electron';
import type { Category } from '@dailybee/tracker';
import { CH, EV } from '../shared/api';
import type { DeepPartial, EndTaskResult, RecategoriseTarget, SessionTask, Settings, TaskRef, ToastMessage } from '../shared/types';
import { dayKey } from '../shared/time';
import { PROJECTS, TASKS } from '../shared/fake';
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
}

let toastSeq = 0;

export function registerIpc(s: Services): void {
  const { repo, settings, session, tracker, checkins, reports, sync, permissions, windows } = s;
  const bc = (ch: string, payload: unknown) => windows.broadcast(ch, payload);

  // ---- events: main → renderer ----------------------------------------
  session.on('change', (v) => bc(EV.session, v));
  session.on('entries', () => bc(EV.entries, repo.entriesForDay(dayKey())));
  tracker.on('summary', (v) => bc(EV.activity, v));
  checkins.on('prompt', (c) => { if (c === null) bc(EV.checkinPrompt, null); });
  checkins.on('change', (v) => bc(EV.checkins, v));
  settings.on('change', (v) => bc(EV.settings, v));
  sync.on('change', (v) => bc(EV.sync, v));

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
    if (e) { e.done = !e.done; if (e.done && !e.outcome) e.outcome = 'Done'; repo.upsertEntry(e); }
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
  ipcMain.handle(CH.checkinsActive, () => checkins.active);
  ipcMain.handle(CH.checkinsTrigger, (_e, kind?: 'drift' | 'pulse') => checkins.trigger(kind));
  ipcMain.handle(CH.checkinsAnswer, (_e, id: string, answer: string) => checkins.answer(id, answer));

  // ---- reports ----------------------------------------------------------
  ipcMain.handle(CH.reportsGenerate, () => reports.generate());
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
  ipcMain.handle(CH.dataProjects, () => repo.getKv('projects', PROJECTS));
  ipcMain.handle(CH.dataTasks, () => { if (repo.taskCount() === 0) for (const t of TASKS) repo.saveTask(t); return repo.tasks(); });
  ipcMain.handle(CH.dataSaveTask, (_e, t: TaskRef) => { repo.saveTask(t); return repo.tasks(); });

  // ---- team / admin / sync ---------------------------------------------
  ipcMain.handle(CH.teamData, (_e, range: 'day' | 'week' | 'month') => sync.team(range));
  ipcMain.handle(CH.teamAdmin, (_e, range: 'week' | 'month' | 'quarter', team: string) => sync.admin(range, team));
  ipcMain.handle(CH.teamNudge, (_e, initials: string) => sync.nudge(initials));
  ipcMain.handle(CH.syncStatus, () => sync.getStatus());
  ipcMain.handle(CH.syncPush, () => sync.pushDay());

  // ---- ui ---------------------------------------------------------------
  ipcMain.handle(CH.uiCopy, (_e, text: string) => { clipboard.writeText(text); });
  ipcMain.handle(CH.uiOpenExternal, (_e, url: string) => { if (/^https?:\/\//.test(url)) return shell.openExternal(url); return undefined; });
}

export function makeToaster(windows: Windows) {
  return (text: string, tone: ToastMessage['tone'] = 'success') => windows.broadcast(EV.toast, { id: ++toastSeq, text, tone } satisfies ToastMessage);
}
