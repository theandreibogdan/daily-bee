import { app, BrowserWindow, powerMonitor } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EV } from '../shared/api';
import { Db } from './db';
import { seedDemo } from './demo';
import { makeToaster, registerIpc } from './ipc';
import { Repo } from './repo';
import { CheckinService } from './services/checkins';
import { PermissionService } from './services/permissions';
import { ReportService } from './services/reports';
import { SessionService } from './services/session';
import { SettingsService } from './services/settings';
import { SyncService } from './services/sync';
import { TrackerService } from './services/tracker';
import { Windows } from './windows';

const demo = process.argv.includes('--demo') || process.env.DAILYBEE_DEMO === '1';
const log = (m: string) => console.log(m);

// Name first: userData (and the single-instance lock inside it) derive from it.
app.setName('DailyBee');
app.setAppUserModelId('dev.dailybee.desktop');
// Isolated profile for tests and smoke runs (own database and own single-instance lock).
if (process.env.DAILYBEE_USER_DATA) app.setPath('userData', process.env.DAILYBEE_USER_DATA);

const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) app.quit();

let db: Db | null = null;
let tracker: TrackerService | null = null;

if (isPrimary) app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  log(`[dailybee] ${demo ? 'demo' : 'live'} mode · data in ${userData} · ${process.env.ELECTRON_RENDERER_URL ? 'dev server ' + process.env.ELECTRON_RENDERER_URL : 'built renderer'}`);
  db = new Db(join(userData, demo ? 'dailybee-demo.sqlite' : 'dailybee.sqlite'), log);
  await db.open();

  const repo = new Repo(db);
  const settings = new SettingsService(repo);
  const session = new SessionService(repo, settings);
  tracker = new TrackerService(repo, settings, session, { demo, getIdleSeconds: () => powerMonitor.getSystemIdleTime(), log });
  const windows = new Windows(demo);
  const toast = makeToaster(windows);
  const checkins = new CheckinService(repo, settings, session, tracker, {
    // In-app popup when the app is focused (kit behaviour); floating always-on-top window otherwise.
    showPopup: (c) => { if (windows.mainFocused()) windows.main!.webContents.send(EV.checkinPrompt, c); else windows.showPopup(c); },
    hidePopup: () => windows.hidePopup(),
  });
  const reports = new ReportService(repo, settings, session, tracker, checkins, { demo, log, toast });
  const sync = new SyncService(repo, settings, session, tracker, log);
  const permissions = new PermissionService(tracker);

  registerIpc({ repo, settings, session, tracker, checkins, reports, sync, permissions, windows });

  if (demo) seedDemo(repo, tracker, session);
  tracker.start();
  reports.startScheduler();
  sync.start();

  const win = windows.createMain();
  await runSmoke(win);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) windows.createMain(); });
  app.on('second-instance', () => windows.createMain());
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { tracker?.stop(); db?.close(); });

/**
 * Headless verification: DAILYBEE_SMOKE=<png path> boots the app, optionally navigates
 * (DAILYBEE_SMOKE_SCREEN) and opens a dialog (DAILYBEE_SMOKE_PROMPT), captures the window and quits.
 */
async function runSmoke(win: BrowserWindow): Promise<void> {
  const out = process.env.DAILYBEE_SMOKE;
  if (!out) return;
  const screen = process.env.DAILYBEE_SMOKE_SCREEN;
  const prompt = process.env.DAILYBEE_SMOKE_PROMPT;
  await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()));
  await new Promise((r) => setTimeout(r, 1500));
  if (screen) win.webContents.send(EV.navigate, screen);
  if (prompt) win.webContents.send(EV.navigate, prompt === 'checkin' ? 'checkin' : 'prompt:' + prompt);
  await new Promise((r) => setTimeout(r, Number(process.env.DAILYBEE_SMOKE_WAIT ?? 2500)));
  const img = await win.webContents.capturePage();
  writeFileSync(out, img.toPNG());
  log('[smoke] wrote ' + out);
  app.quit();
}
