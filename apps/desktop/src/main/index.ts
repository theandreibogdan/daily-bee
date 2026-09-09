import { app, BrowserWindow, powerMonitor, screen } from 'electron';
import { appendFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EV } from '../shared/api';
import { PAUSE_LABEL } from '../shared/session';
import { dayKey } from '../shared/time';
import { Db } from './db';
import { seedDemo } from './demo';
import { makeToaster, registerIpc } from './ipc';
import { Repo } from './repo';
import { CheckinService } from './services/checkins';
import { CliServer } from './services/cli';
import { PermissionService } from './services/permissions';
import { PresenceService, type Away } from './services/presence';
import { ReportService } from './services/reports';
import { SessionService } from './services/session';
import { SettingsService } from './services/settings';
import { SyncService } from './services/sync';
import { TrackerService } from './services/tracker';
import { TrayService } from './services/tray';
import { Windows } from './windows';

const demo = process.argv.includes('--demo') || process.env.DAILYBEE_DEMO === '1';
// Console plus <userData>/dailybee.log (rotated at 1 MB), so problems can be read back after the fact.
let logFile: string | null = null;
const log = (m: string) => {
  console.log(m);
  if (logFile) { try { appendFileSync(logFile, new Date().toISOString() + ' ' + m + '\n'); } catch { /* best effort */ } }
};

// Name first: userData (and the single-instance lock inside it) derive from it.
app.setName('DailyBee');
app.setAppUserModelId('dev.dailybee.desktop');
// Isolated profile for tests and smoke runs (own database and own single-instance lock).
if (process.env.DAILYBEE_USER_DATA) app.setPath('userData', process.env.DAILYBEE_USER_DATA);

const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) app.quit();

// Ctrl+C or a kill signal quits properly so the database is flushed; a plain kill skips before-quit.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => app.quit());
// An unexpected error is logged instead of freezing the main process behind a modal error box.
const describe = (e: unknown): string => (e instanceof Error ? e.stack ?? e.message : String(e));
process.on('uncaughtException', (e) => log('[main] uncaught exception: ' + describe(e)));
process.on('unhandledRejection', (e) => log('[main] unhandled rejection: ' + describe(e)));

let db: Db | null = null;
let tracker: TrackerService | null = null;
let session: SessionService | null = null;
let presence: PresenceService | null = null;
let cli: CliServer | null = null;
let tray: TrayService | null = null;
let windowsRef: Windows | null = null;

if (isPrimary) app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  logFile = join(userData, 'dailybee.log');
  try { if (statSync(logFile).size > 1_000_000) renameSync(logFile, logFile + '.1'); } catch { /* no log yet */ }
  log(`[dailybee] ${demo ? 'demo' : 'live'} mode · data in ${userData} · ${process.env.ELECTRON_RENDERER_URL ? 'dev server ' + process.env.ELECTRON_RENDERER_URL : 'built renderer'}`);
  db = new Db(join(userData, demo ? 'dailybee-demo.sqlite' : 'dailybee.sqlite'), log);
  await db.open();

  const repo = new Repo(db);
  const settings = new SettingsService(repo);
  const sessionSvc = new SessionService(repo, settings);
  session = sessionSvc;
  tracker = new TrackerService(repo, settings, sessionSvc, { demo, getIdleSeconds: () => powerMonitor.getSystemIdleTime(), log });
  const windows = new Windows(demo);
  windowsRef = windows;
  const toast = makeToaster(windows);

  // Presence: no input (the "Idle detection" setting), screen lock and sleep pause the task timer;
  // input, unlock and wake resume it. Demo mode keeps the kit's numbers still.
  presence = new PresenceService(settings, { getIdleSeconds: () => powerMonitor.getSystemIdleTime(), on: (ev, cb) => powerMonitor.on(ev as 'suspend', cb) });
  presence.on('away', (a: Away) => {
    if (!sessionSvc.get().activeSince) return;
    sessionSvc.pause(a.reason, a.since);
    toast(`Timer paused · ${PAUSE_LABEL[a.reason]}`, 'neutral');
  });
  presence.on('back', (at: number) => {
    const s = sessionSvc.get();
    if (!s.running || s.activeSince) return;
    sessionSvc.resume(at);
    toast('Timer resumed', 'neutral');
  });
  if (!demo) presence.start();
  sessionSvc.startHeartbeat();
  const checkins = new CheckinService(repo, settings, sessionSvc, tracker, {
    // In-app popup when the app is focused (kit behaviour); floating always-on-top window otherwise.
    showPopup: (c) => { if (windows.mainFocused()) windows.main!.webContents.send(EV.checkinPrompt, c); else windows.showPopup(c); },
    hidePopup: () => windows.hidePopup(),
    // Warnings cover the whole display, wherever the user is.
    showOverlay: (c) => windows.showOverlay(c),
    hideOverlay: () => windows.hideOverlay(),
  });
  const reports = new ReportService(repo, settings, sessionSvc, tracker, checkins, { demo, log, toast });
  const sync = new SyncService(repo, settings, sessionSvc, tracker, log);
  const permissions = new PermissionService(tracker);

  registerIpc({ repo, settings, session: sessionSvc, tracker, checkins, reports, sync, permissions, windows, demo });

  // Local control port for the CLI and the git post-commit hook (scripts/dailybee.mjs).
  cli = new CliServer(userData, settings, sessionSvc, repo, { entriesChanged: () => windows.broadcast(EV.entries, repo.entriesForDay(dayKey())) }, log);
  cli.start();

  if (demo) seedDemo(repo, tracker, sessionSvc);
  tracker.start();
  reports.startScheduler();
  sync.start();

  // Tray: the app keeps tracking in the background after the window is closed.
  tray = new TrayService(windows, sessionSvc, settings, log);
  tray.start();
  windows.onHideToTray = () => { if (!repo.getKv('tray-hint', false)) { repo.setKv('tray-hint', true); tray?.hint(); } };

  // Floating widget (opt-in), position remembered.
  windows.onWidgetMoved = (pos) => repo.setKv('widget-bounds', pos);
  const applyWidget = () => { if (settings.get().widget.enabled) windows.showWidget(repo.getKv<{ x: number; y: number } | null>('widget-bounds', null)); else windows.hideWidget(); };
  settings.on('change', applyWidget);
  applyWidget();

  // DAILYBEE_DEBUG=1 exposes the services on the main-process global for inspection over --inspect.
  if (process.env.DAILYBEE_DEBUG === '1') (globalThis as Record<string, unknown>).dailybee = { repo, settings, session: sessionSvc, tracker, checkins, reports, sync, presence, tray, windows };

  const win = windows.createMain();
  await runSmoke(win);

  app.on('activate', () => windows.createMain());
  app.on('second-instance', () => windows.createMain());
});

// Windows may all be hidden/closed while tracking continues; the tray menu quits.
app.on('window-all-closed', () => { /* keep running in the tray */ });
app.on('before-quit', () => {
  if (windowsRef) windowsRef.quitting = true;
  tray?.stop();
  presence?.stop();
  cli?.stop();
  tracker?.stop();
  session?.stopHeartbeat();
  // Bank the active stretch; the run resumes at the next launch without counting the time in between.
  session?.pause('offline');
  db?.close();
});

/**
 * Headless verification: DAILYBEE_SMOKE=<png path> boots the app, optionally navigates
 * (DAILYBEE_SMOKE_SCREEN) and opens a dialog (DAILYBEE_SMOKE_PROMPT), captures the window and quits.
 */
async function runSmoke(win: BrowserWindow): Promise<void> {
  const out = process.env.DAILYBEE_SMOKE;
  if (!out) return;
  const screenName = process.env.DAILYBEE_SMOKE_SCREEN;
  const prompt = process.env.DAILYBEE_SMOKE_PROMPT;
  await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()));
  await new Promise((r) => setTimeout(r, 1500));
  if (screenName) win.webContents.send(EV.navigate, screenName);
  if (prompt) win.webContents.send(EV.navigate, prompt === 'checkin' || prompt === 'warning' ? prompt : 'prompt:' + prompt);
  await new Promise((r) => setTimeout(r, Number(process.env.DAILYBEE_SMOKE_WAIT ?? 2500)));
  const img = await win.webContents.capturePage();
  writeFileSync(out, img.toPNG());
  log('[smoke] wrote ' + out);
  // Window bounds + scale so an OS-level screenshot can crop the real frame (capturePage excludes the window controls).
  const scale = screen.getPrimaryDisplay().scaleFactor;
  log('[smoke] bounds ' + JSON.stringify({ ...win.getBounds(), scale }));
  const widget = windowsRef?.widget;
  if (widget && !widget.isDestroyed()) log('[smoke] widget ' + JSON.stringify({ ...widget.getBounds(), scale }));
  const overlay = windowsRef?.overlay;
  if (overlay && !overlay.isDestroyed()) {
    log('[smoke] overlay ' + JSON.stringify({ ...overlay.getBounds(), scale, visible: overlay.isVisible(), focused: overlay.isFocused(), onTop: overlay.isAlwaysOnTop() }));
    // The overlay's own page (scrim + card over transparency), without whatever is on the desktop behind it.
    const shot = await overlay.webContents.capturePage();
    writeFileSync(out.replace(/\.png$/i, '') + '-overlay.png', shot.toPNG());
  }
  // DAILYBEE_SMOKE_CLOSE=1: close the main window the way the × does and report that the app kept running (tray).
  if (process.env.DAILYBEE_SMOKE_CLOSE === '1') {
    win.close();
    await new Promise((r) => setTimeout(r, 800));
    log(`[smoke] after close: destroyed=${win.isDestroyed()} visible=${win.isDestroyed() ? 'n/a' : win.isVisible()} tracking=${tracker ? 'running' : 'stopped'} tray=${tray ? 'yes' : 'no'}`);
  }
  const hold = Number(process.env.DAILYBEE_SMOKE_HOLD_MS ?? 0);
  if (hold > 0) await new Promise((r) => setTimeout(r, hold));
  app.quit();
}
