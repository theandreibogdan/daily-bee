import { app, BrowserWindow, Notification, powerMonitor, screen } from 'electron';
import { appendFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EV } from '../shared/api';
import { PAUSE_LABEL } from '../shared/session';
import { dayKey, formatDurationShort } from '../shared/time';
import type { Checkin, Entry, ProfilesStatus, ReportDraft, Session, SyncStatus } from '../shared/types';
import { Db } from './db';
import { seedDemo } from './demo';
import { makeToaster, registerAppIpc, registerIpc, unregisterIpc } from './ipc';
import { Repo } from './repo';
import { AccountService } from './services/account';
import { CheckinService } from './services/checkins';
import { CliServer } from './services/cli';
import { NotificationService } from './services/notifications';
import { PermissionService } from './services/permissions';
import { PresenceService, type Away } from './services/presence';
import { ProfileService } from './services/profiles';
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

/** Everything that belongs to one open profile (or the demo day). Torn down when the profile closes. */
interface Booted {
  profileId: string;
  db: Db; repo: Repo; settings: SettingsService; session: SessionService; tracker: TrackerService; presence: PresenceService;
  checkins: CheckinService; reports: ReportService; sync: SyncService; account: AccountService; cli: CliServer; tray: TrayService;
}

let userData = '';
let booted: Booted | null = null;
let profiles: ProfileService | null = null;
let windows: Windows | null = null;

const profilesStatus = (): ProfilesStatus => ({
  open: booted?.profileId ?? null, demo,
  profiles: demo || !profiles ? [] : profiles.list().map((p) => profiles!.summary(p)),
});
const announce = () => windows?.broadcast(EV.profiles, profilesStatus());
const debugHook = (extra: Record<string, unknown>) => { if (process.env.DAILYBEE_DEBUG === '1') (globalThis as Record<string, unknown>).dailybee = { app, profiles, windows, ...extra }; };

/** Open a profile's database and start every service on it. */
async function boot(profileId: string): Promise<Booted> {
  if (booted) throw new Error('A profile is already open');
  const w = windows!;
  const file = profileId === 'demo' ? join(userData, 'dailybee-demo.sqlite') : profiles!.path(profileId);
  log(`[profile] opening ${profileId === 'demo' ? 'the demo day' : profileId} · ${file}`);
  const db = new Db(file, log);
  await db.open();

  const repo = new Repo(db);
  const settings = new SettingsService(repo);
  // Live mode closes a run left open by a crash or shutdown into an entry; demo re-seeds its own run.
  const session = new SessionService(repo, settings, { recover: demo ? 'discard' : 'stop' });
  const tracker = new TrackerService(repo, settings, session, { demo, getIdleSeconds: () => powerMonitor.getSystemIdleTime(), log });
  const toast = makeToaster(w);

  // Presence: no input (the "Idle detection" setting), screen lock and sleep pause the task timer;
  // input, unlock and wake resume it. Demo mode keeps the kit's numbers still.
  const presence = new PresenceService(settings, {
    getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    on: (ev, cb) => powerMonitor.on(ev as 'suspend', cb),
    off: (ev, cb) => powerMonitor.off(ev as 'suspend', cb),
  });
  presence.on('away', (a: Away) => {
    if (!session.get().activeSince) return;
    session.pause(a.reason, a.since);
    toast(`Timer paused · ${PAUSE_LABEL[a.reason]}`, 'neutral');
  });
  presence.on('back', (at: number) => {
    const s = session.get();
    if (!s.running || s.activeSince) return;
    session.resume(at);
    toast('Timer resumed', 'neutral');
  });
  if (!demo) presence.start();
  session.startHeartbeat();
  const checkins = new CheckinService(repo, settings, session, tracker, {
    // In-app popup when the app is focused (kit behaviour); floating always-on-top window otherwise.
    showPopup: (c) => { if (w.mainFocused()) w.main!.webContents.send(EV.checkinPrompt, c); else w.showPopup(c); },
    hidePopup: () => w.hidePopup(),
    // Warnings cover the whole display, wherever the user is.
    showOverlay: (c) => w.showOverlay(c),
    hideOverlay: () => w.hideOverlay(),
  });
  const reports = new ReportService(repo, settings, session, tracker, checkins, { demo, log, toast });
  const sync = new SyncService(repo, settings, session, tracker, log);
  const permissions = new PermissionService(tracker);

  // The bell: what happened, per profile. Desktop notifications only while DailyBee is in the background and the setting allows them.
  const notifications = new NotificationService(repo, {
    desktop: (title, body) => {
      if (!settings.get().notifications.desktop || w.mainFocused() || !Notification.isSupported()) return;
      try { new Notification({ title, body: body ?? '', silent: true }).show(); } catch (e) { log('[notify] ' + String(e)); }
    },
    log,
  });
  let wasRunning = session.get().running, wasPaused = !!session.get().paused;
  session.on('change', (st: Session) => {
    if (st.running && !wasRunning) notifications.push({ kind: 'session', title: `Started “${st.current?.task ?? 'a task'}”`, screen: 'today' });
    if (!st.running && wasRunning) notifications.push({ kind: 'session', tone: 'success', title: 'Task stopped, entry saved', screen: 'today' });
    if (st.running && !!st.paused !== wasPaused) notifications.push({ kind: 'session', tone: st.paused ? 'warning' : 'neutral', title: st.paused ? `Timer paused · ${PAUSE_LABEL[st.paused.reason]}` : 'Timer resumed', screen: 'today', key: 'pause' });
    wasRunning = st.running; wasPaused = !!st.paused;
  });
  checkins.on('prompt', (c: Checkin | null) => { if (c) notifications.push({ kind: 'checkin', tone: 'warning', title: c.kind === 'pulse' ? 'Halfway check-in' : `${c.kind === 'warning' ? 'Warning' : 'Drift'} on ${c.domain ?? 'a distraction site'}`, text: c.text, screen: 'today' }); });
  reports.on('sent', (r: ReportDraft) => notifications.push({ kind: 'report', tone: 'success', title: `Report sent to ${r.recipients}`, screen: 'reports', desktop: true }));
  reports.on('failed', (m: string) => notifications.push({ kind: 'report', tone: 'danger', title: 'Report not sent', text: m, screen: 'reports', desktop: true }));
  reports.on('drafted', () => notifications.push({ kind: 'report', title: 'Daily report drafted', text: 'Review it on Reports and send it when you are ready.', screen: 'reports', desktop: true }));
  let lastSyncError: string | null = null;
  sync.on('change', (st: SyncStatus) => {
    if (st.lastError && st.lastError !== lastSyncError) notifications.push({ kind: 'sync', tone: 'danger', title: 'Sync failed', text: st.lastError, screen: 'settings', key: 'sync', desktop: true });
    else if (!st.lastError && lastSyncError && st.connected) notifications.push({ kind: 'sync', tone: 'success', title: 'Sync is back', key: 'sync' });
    lastSyncError = st.lastError;
  });

  // Who uses this profile: the wizard result (solo profile or team account).
  const account = new AccountService(repo, settings, log, { demo });
  registerIpc({ repo, settings, session, tracker, checkins, reports, sync, permissions, windows: w, account, notifications, demo });

  // Local control port for the CLI and the git post-commit hook (scripts/dailybee.mjs).
  const cli = new CliServer(userData, settings, session, repo, { entriesChanged: () => w.broadcast(EV.entries, repo.entriesForDay(dayKey())) }, log);
  cli.start();

  if (demo) {
    seedDemo(repo, tracker, session);
    // The kit's sample channel and team name belong to the demo day only; live profiles start blank.
    settings.update({ delivery: { slackChannel: settings.get().delivery.slackChannel || '#eng-daily' }, workspace: { teamName: settings.get().workspace.teamName || 'Platform' } });
  }
  tracker.start();
  reports.startScheduler();
  sync.start();

  // Tray: the app keeps tracking in the background after the window is closed.
  const tray = new TrayService(w, session, settings, log);
  tray.start();
  w.keepAliveInTray = true;
  w.onHideToTray = () => { if (!repo.getKv('tray-hint', false)) { repo.setKv('tray-hint', true); tray.hint(); } };

  // Floating widget (opt-in), position remembered.
  w.onWidgetMoved = (pos) => repo.setKv('widget-bounds', pos);
  const applyWidget = () => { if (settings.get().widget.enabled) w.showWidget(repo.getKv<{ x: number; y: number } | null>('widget-bounds', null)); else w.hideWidget(); };
  settings.on('change', applyWidget);
  applyWidget();

  booted = { profileId, db, repo, settings, session, tracker, presence, checkins, reports, sync, account, cli, tray };
  // The profile list mirrors the account: name, mode, workspace, whether the wizard finished.
  if (profileId !== 'demo') {
    profiles!.setActive(profileId);
    profiles!.touch(profileId);
    profiles!.updateFromAccount(profileId, account.status());
    account.on('change', (st) => { profiles!.updateFromAccount(profileId, st); announce(); });
  }
  // DAILYBEE_DEBUG=1 exposes the services on the main-process global for inspection over --inspect.
  debugHook({ repo, settings, session, tracker, checkins, reports, sync, presence, tray, account });
  announce();
  return booted;
}

/** Stop every service of the open profile and close its database. A running task is saved as an entry. */
function teardown(reason: 'quit' | 'close'): Entry | null {
  const b = booted;
  if (!b) return null;
  const w = windows!;
  b.tray.stop();
  b.presence.stop();
  b.cli.stop();
  b.tracker.stop();
  b.session.stopHeartbeat();
  b.reports.stopScheduler();
  b.sync.stop();
  // Closing the profile stops the timer: the running task is saved with its exact active time.
  // The demo's seeded run is dropped instead, so the kit's day stays as designed.
  let closed: Entry | null = null;
  if (demo) b.session.discard();
  else {
    closed = b.session.stopOnQuit();
    if (closed) log(`[session] stopped “${closed.task}” on ${reason} · ${formatDurationShort(closed.seconds)}`);
  }
  unregisterIpc();
  w.keepAliveInTray = false;
  w.onHideToTray = null;
  w.onWidgetMoved = null;
  w.hideWidget();
  w.hidePopup();
  w.hideOverlay();
  b.db.close();
  booted = null;
  debugHook({});
  log(`[profile] closed ${b.profileId}`);
  return closed;
}

/** Sign out: a team account drops its token, the profile closes and the list shows. */
function closeProfile(): void {
  if (!booted) return;
  if (!demo) booted.account.signOut();
  const closed = teardown('close');
  if (!demo) profiles!.setActive(null);
  announce();
  if (closed && windows) makeToaster(windows)(`Timer stopped · “${closed.task}” ${formatDurationShort(closed.seconds)} saved`, 'neutral');
}

async function openProfile(id: string): Promise<void> {
  if (booted?.profileId === id) return;
  if (booted) closeProfile();
  if (!profiles!.get(id)) throw new Error('That profile no longer exists');
  const b = await boot(id);
  const r = b.session.recovered;
  if (r && windows) makeToaster(windows)(`Timer stopped when DailyBee closed · “${r.task}” ${formatDurationShort(r.seconds)} saved${r.day === dayKey() ? '' : ' to ' + r.day}`, 'neutral');
}

const profileOps = {
  status: () => profilesStatus(),
  open: async (id: string) => { if (!demo) await openProfile(id); return profilesStatus(); },
  create: async () => {
    if (demo) return profilesStatus();
    if (booted) closeProfile();
    await boot(profiles!.create().id);
    return profilesStatus();
  },
  close: async () => { if (!demo) closeProfile(); return profilesStatus(); },
  // "Back to profiles" in the wizard: the profile being set up is deleted again.
  discard: async () => {
    if (demo) return profilesStatus();
    const id = booted?.profileId ?? null;
    closeProfile();
    if (id && profiles!.get(id)?.provisional) profiles!.remove(id);
    announce();
    return profilesStatus();
  },
  remove: async (id: string) => {
    if (demo) return profilesStatus();
    if (booted?.profileId === id) throw new Error('Close the profile before removing it');
    const name = profiles!.get(id)?.name || id;
    profiles!.remove(id);
    log(`[profile] removed “${name}” and its data`);
    announce();
    return profilesStatus();
  },
};

if (isPrimary) app.whenReady().then(async () => {
  userData = app.getPath('userData');
  logFile = join(userData, 'dailybee.log');
  try { if (statSync(logFile).size > 1_000_000) renameSync(logFile, logFile + '.1'); } catch { /* no log yet */ }
  log(`[dailybee] ${demo ? 'demo' : 'live'} mode · data in ${userData} · ${process.env.ELECTRON_RENDERER_URL ? 'dev server ' + process.env.ELECTRON_RENDERER_URL : 'built renderer'}`);
  profiles = new ProfileService(userData, log);
  windows = new Windows(demo);
  registerAppIpc({ windows, profiles: profileOps });
  debugHook({});

  if (demo) await boot('demo');
  else {
    profiles.prune();
    const active = profiles.active();
    if (active && profiles.get(active)) await boot(active);
    // First launch ever: an empty profile, opened on the wizard. Signed out with profiles on
    // this device: nothing opens, the window shows the profile list.
    else if (profiles.list().length === 0) await boot(profiles.create().id);
  }

  const win = windows.createMain();
  const r = booted?.session.recovered;
  if (r) {
    log(`[session] closed the run left open at last exit: “${r.task}” ${formatDurationShort(r.seconds)} → ${r.day}`);
    const toast = makeToaster(windows);
    win.webContents.once('did-finish-load', () => setTimeout(() => toast(`Timer stopped when DailyBee closed · “${r.task}” ${formatDurationShort(r.seconds)} saved${r.day === dayKey() ? '' : ' to ' + r.day}`, 'neutral'), 1200));
  }
  await runSmoke(win);

  app.on('activate', () => windows?.createMain());
  app.on('second-instance', () => windows?.createMain());
});

// With a profile open the app keeps tracking in the tray after the window closes; signed out there
// is nothing to keep alive.
app.on('window-all-closed', () => { if (!booted) app.quit(); });
app.on('before-quit', () => {
  if (windows) windows.quitting = true;
  teardown('quit');
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
  const widget = windows?.widget;
  if (widget && !widget.isDestroyed()) log('[smoke] widget ' + JSON.stringify({ ...widget.getBounds(), scale }));
  const overlay = windows?.overlay;
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
    log(`[smoke] after close: destroyed=${win.isDestroyed()} visible=${win.isDestroyed() ? 'n/a' : win.isVisible()} tracking=${booted ? 'running' : 'stopped'} tray=${booted ? 'yes' : 'no'}`);
  }
  const hold = Number(process.env.DAILYBEE_SMOKE_HOLD_MS ?? 0);
  if (hold > 0) await new Promise((r) => setTimeout(r, hold));
  app.quit();
}
