import { app, BrowserWindow, dialog, globalShortcut, Notification, powerMonitor, screen } from 'electron';
import { appendFileSync, copyFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { EV } from '../shared/api';
import { PAUSE_LABEL } from '../shared/session';
import { clock, dayKey, formatDurationShort } from '../shared/time';
import type { AwayPrompt, BackupInfo, BackupPick, BackupResult, Checkin, Entry, ProfilesStatus, RecentTask, ReportDraft, Session, ShortcutStatus, StartupStatus, SyncStatus } from '../shared/types';
import { Db } from './db';
import { seedDemo } from './demo';
import { makeToaster, registerAppIpc, registerIpc, unregisterIpc } from './ipc';
import { Repo } from './repo';
import { AccountService } from './services/account';
import { AwayService, type AwayDecision } from './services/away';
import { BACKUP_EXT, BackupService, inspectBackup } from './services/backup';
import { CheckinService } from './services/checkins';
import { CliServer } from './services/cli';
import { EntryService, type EntriesChanged } from './services/entries';
import { NotificationService } from './services/notifications';
import { PermissionService } from './services/permissions';
import { PresenceService, type Away } from './services/presence';
import { ProfileService } from './services/profiles';
import { QuickActions } from './services/quick';
import { ReportService } from './services/reports';
import { SessionService } from './services/session';
import { SettingsService } from './services/settings';
import { SyncService } from './services/sync';
import { TrackerService } from './services/tracker';
import { TrayService } from './services/tray';
import { Windows } from './windows';

const demo = process.argv.includes('--demo') || process.env.DAILYBEE_DEMO === '1';
// Launched by the login item with "Start in the tray" (or DAILYBEE_HIDDEN=1 for a test): no window until asked.
const startHidden = process.argv.includes('--hidden') || process.env.DAILYBEE_HIDDEN === '1';
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
  notifications: NotificationService; entries: EntryService; away: AwayService; backup: BackupService; quick: QuickActions;
  /** Periodic work (the backup reminder) cleared on teardown */
  timers: NodeJS.Timeout[];
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
  // Hand corrections to the history, and the question asked after time away.
  const entries = new EntryService(repo, { log });
  const away = new AwayService(session, settings);
  // Start, stop and resume without the window (tray menu, global shortcut).
  const quick = new QuickActions(repo, session);

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
    away.onAway(a);
    toast(`Timer paused · ${PAUSE_LABEL[a.reason]}`, 'neutral');
  });
  presence.on('back', (at: number) => {
    const s = session.get();
    if (!s.running || s.activeSince) return;
    session.resume(at);
    const p = away.onBack(at);
    toast(p ? 'Timer resumed · what about the time away?' : 'Timer resumed', 'neutral');
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
  // Every line in the bell is also a system notification (Settings › Notifications › Desktop notifications), whether the
  // window is in front, hidden in the tray or not open at all; clicking one brings DailyBee up.
  const desktopNotify = (title: string, body?: string) => {
    if (!settings.get().notifications.desktop || !Notification.isSupported()) return;
    try {
      const note = new Notification({ title, body: body ?? '', silent: true });
      note.on('click', () => w.createMain());
      note.show();
    } catch (e) { log('[notify] ' + String(e)); }
  };
  const notifications = new NotificationService(repo, { desktop: desktopNotify, log });
  // The tray and the shortcut act without the window: a toast for the window, the bell line (and its system notification) comes from the session.
  quick.on('started', (t: RecentTask) => { toast(`Resumed “${t.task}”`); });
  quick.on('stopped', ({ entry, seconds }: { entry: Entry; seconds: number }) => { toast(`Stopped “${entry.task}” · ${formatDurationShort(seconds)} saved`, 'neutral'); void sync.pushDay().catch(() => {}); });
  let lastStartedAt = session.get().running ? session.get().startedAt : null, wasPaused = session.get().running && !!session.get().paused;
  session.on('change', (st: Session) => {
    // A new run, including a switch straight from one task to another.
    if (st.running && st.startedAt !== lastStartedAt) notifications.push({ kind: 'session', title: `Started “${st.current?.task ?? 'a task'}”`, screen: 'today' });
    if (st.running && !!st.paused !== wasPaused) notifications.push({ kind: 'session', tone: st.paused ? 'warning' : 'neutral', title: st.paused ? `Timer paused · ${PAUSE_LABEL[st.paused.reason]}` : 'Timer resumed', screen: 'today', key: 'pause' });
    lastStartedAt = st.running ? st.startedAt : null;
    wasPaused = st.running && !!st.paused;
  });
  session.on('stopped', ({ entry, seconds }: { entry: Entry; seconds: number }) => notifications.push({ kind: 'session', tone: 'success', title: `Stopped “${entry.task}” · ${formatDurationShort(seconds)} saved`, text: entry.summary || (entry.outcome && entry.outcome !== 'Done' ? entry.outcome : undefined), screen: 'today' }));
  checkins.on('prompt', (c: Checkin | null) => { if (c) notifications.push({ kind: 'checkin', tone: 'warning', title: c.kind === 'pulse' ? 'Halfway check-in' : `${c.kind === 'warning' ? 'Warning' : 'Drift'} on ${c.domain ?? 'a distraction site'}`, text: c.text, screen: 'today' }); });
  reports.on('sent', (r: ReportDraft) => notifications.push({ kind: 'report', tone: 'success', title: `Report sent to ${r.recipients}`, screen: 'reports' }));
  reports.on('failed', (m: string) => notifications.push({ kind: 'report', tone: 'danger', title: 'Report not sent', text: m, screen: 'reports' }));
  reports.on('drafted', () => notifications.push({ kind: 'report', title: 'Daily report drafted', text: 'Review it on Reports and send it when you are ready.', screen: 'reports' }));
  let lastSyncError: string | null = null;
  sync.on('change', (st: SyncStatus) => {
    if (st.lastError && st.lastError !== lastSyncError) notifications.push({ kind: 'sync', tone: 'danger', title: 'Sync failed', text: st.lastError, screen: 'settings', key: 'sync' });
    else if (!st.lastError && lastSyncError && st.connected) notifications.push({ kind: 'sync', tone: 'success', title: 'Sync is back', key: 'sync' });
    lastSyncError = st.lastError;
  });
  // A run closed at launch (crash, kill, shutdown) is worth a line in the bell too, since the toast can be missed.
  if (session.recovered) notifications.push({ kind: 'session', tone: 'warning', title: 'Timer stopped when DailyBee closed', text: `“${session.recovered.task}” · ${formatDurationShort(session.recovered.seconds)} saved${session.recovered.day === dayKey() ? '' : ' to ' + session.recovered.day}`, screen: 'today' });
  // Hand corrections: today's list refreshes everywhere and the day's report is rebuilt from the corrected data.
  entries.on('change', ({ days }: EntriesChanged) => {
    w.broadcast(EV.entries, repo.entriesForDay(dayKey()));
    for (const d of days) void reports.entriesChanged(d);
  });
  // The time-away question: in the app while it is in front, floating otherwise. The answer goes into the change log and the bell.
  away.on('prompt', (p: AwayPrompt | null) => {
    w.broadcast(EV.away, p);
    if (p && !w.mainFocused()) w.showAway(p);
    if (!p) w.hideAway();
  });
  away.on('decided', ({ prompt, choice, entry }: AwayDecision) => {
    const saved = choice !== 'stop' || !!entry;
    entries.recordAway(prompt, choice, saved);
    const span = formatDurationShort(prompt.seconds);
    notifications.push({ kind: 'session', tone: choice === 'stop' ? 'success' : 'neutral', title: choice === 'keep' ? `Counted ${span} away as work` : choice === 'stop' ? (saved ? `Stopped “${prompt.task}” at ${clock(prompt.since)}, when you left` : `Stopped “${prompt.task}” · under a minute of work, nothing saved`) : `Left ${span} away out of the timer`, screen: 'today' });
  });

  // Who uses this profile: the wizard result (solo profile or team account).
  const account = new AccountService(repo, settings, log, { demo });

  // Settings › Backup: the profile is one file. Solo profiles are reminded monthly while no fresh copy exists.
  const backup = new BackupService(db, repo, file, log);
  const remind = () => {
    if (demo || account.status().mode !== 'solo') return;
    const text = backup.reminderDue();
    if (!text) return;
    notifications.push({ kind: 'system', tone: 'warning', title: 'Back up your profile', text, screen: 'settings', key: 'backup' });
    backup.markReminded();
  };
  const timers: NodeJS.Timeout[] = [setTimeout(remind, 20_000), setInterval(remind, 6 * 3600_000)];

  // Settings › Startup: registered with the operating system for whichever profile is open. Development builds
  // would register electron.exe, so only the installed app does it.
  const applyStartup = () => {
    if (!app.isPackaged) return;
    const st = settings.get().startup;
    try { app.setLoginItemSettings({ openAtLogin: st.launchAtLogin, args: st.startInTray ? ['--hidden'] : [] }); }
    catch (e) { log('[startup] ' + String(e)); }
  };
  settings.on('change', applyStartup);
  applyStartup();

  // Settings › Keyboard shortcut: one key from any app stops the running task or resumes the last one.
  const shortcut = { registered: false, problem: null as string | null };
  const applyShortcut = () => {
    globalShortcut.unregisterAll();
    shortcut.registered = false;
    shortcut.problem = null;
    const sc = settings.get().shortcuts;
    const acc = (sc.toggle || '').trim();
    if (!sc.enabled || !acc) return;
    try {
      shortcut.registered = globalShortcut.register(acc, () => { if (quick.toggle() === 'dialog') w.openPrompt('start'); });
      if (!shortcut.registered) shortcut.problem = 'Another app already uses this shortcut';
    } catch (e) {
      shortcut.problem = 'Not a shortcut the system understands' + (e instanceof Error && e.message ? ': ' + e.message : '');
    }
    log(`[shortcut] ${acc}: ${shortcut.registered ? 'registered' : shortcut.problem}`);
  };
  settings.on('change', applyShortcut);
  applyShortcut();
  const shortcutStatus = (): ShortcutStatus => ({ enabled: settings.get().shortcuts.enabled, accelerator: settings.get().shortcuts.toggle, registered: shortcut.registered, problem: shortcut.problem });

  registerIpc({ repo, settings, session, tracker, checkins, reports, sync, permissions, windows: w, account, notifications, entries, away, backup, quick, shortcut: shortcutStatus, demo });

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
  const tray = new TrayService(w, session, settings, quick, log);
  tray.start();
  // Resume and Start recent follow the entries.
  session.on('entries', () => tray.rebuild());
  entries.on('change', () => tray.rebuild());
  w.keepAliveInTray = true;
  w.onHideToTray = () => { if (!repo.getKv('tray-hint', false)) { repo.setKv('tray-hint', true); tray.hint(); } };

  // Floating widget (opt-in), position remembered.
  w.onWidgetMoved = (pos) => repo.setKv('widget-bounds', pos);
  const applyWidget = () => { if (settings.get().widget.enabled) w.showWidget(repo.getKv<{ x: number; y: number } | null>('widget-bounds', null)); else w.hideWidget(); };
  settings.on('change', applyWidget);
  applyWidget();

  booted = { profileId, db, repo, settings, session, tracker, presence, checkins, reports, sync, account, cli, tray, notifications, entries, away, backup, quick, timers };
  // The profile list mirrors the account: name, mode, workspace, whether the wizard finished.
  if (profileId !== 'demo') {
    profiles!.setActive(profileId);
    profiles!.touch(profileId);
    profiles!.updateFromAccount(profileId, account.status());
    account.on('change', (st) => { profiles!.updateFromAccount(profileId, st); announce(); });
    // Name and picture are edited in Settings › Profile: the list follows without a restart.
    settings.on('change', () => { profiles!.updateFromAccount(profileId, account.status()); announce(); });
  }
  // DAILYBEE_DEBUG=1 exposes the services on the main-process global for inspection over --inspect.
  debugHook({ repo, settings, session, tracker, checkins, reports, sync, presence, tray, account, entries, away, backup, notifications, quick });
  announce();
  return booted;
}

/** Stop every service of the open profile and close its database. A running task is saved as an entry. */
function teardown(reason: 'quit' | 'close'): Entry | null {
  const b = booted;
  if (!b) return null;
  const w = windows!;
  for (const t of b.timers) clearTimeout(t);
  globalShortcut.unregisterAll();
  b.away.dismiss();
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
  w.hideAway();
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

// ---- backups: restoring swaps database files, so it lives next to boot/teardown ----------------
async function describeBackup(file: string): Promise<BackupPick> {
  try { return { file, info: await inspectBackup(file, log), message: '' }; }
  catch (e) { return { file, info: null, message: e instanceof Error ? e.message : String(e) }; }
}

async function pickBackup(win: BrowserWindow | null): Promise<BackupPick> {
  const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'DailyBee backup', extensions: [BACKUP_EXT, 'sqlite'] }, { name: 'All files', extensions: ['*'] }] };
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  const file = r.canceled ? null : (r.filePaths[0] ?? null);
  if (!file) return { file: null, info: null, message: 'No file chosen' };
  return describeBackup(file);
}

/**
 * replace: the open profile's database is swapped for the backup (the current file stays beside it as
 * .before-restore). new: the backup becomes another profile on this device. Either way the profile
 * boots from the restored file, so its account, password and settings are the backup's.
 */
async function restoreBackup(file: string, mode: 'replace' | 'new'): Promise<BackupResult> {
  if (demo) return { ok: false, message: 'Not available in demo mode' };
  let info: BackupInfo;
  try { info = await inspectBackup(file, log); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  const who = info.name || 'the profile';
  const what = `${info.entries} ${info.entries === 1 ? 'entry' : 'entries'} across ${info.days} ${info.days === 1 ? 'day' : 'days'}`;
  if (mode === 'replace') {
    if (!booted) return { ok: false, message: 'Open a profile first' };
    const id = booted.profileId;
    const target = profiles!.path(id);
    teardown('close');
    const safety = target + '.before-restore';
    try { copyFileSync(target, safety); copyFileSync(file, target); }
    catch (e) { await boot(id); return { ok: false, message: 'Restore failed — ' + (e instanceof Error ? e.message : String(e)) }; }
    await boot(id);
    log(`[backup] restored ${file} into ${id}; the previous data is kept as ${basename(safety)}`);
    return { ok: true, message: `Restored ${who}'s backup · ${what}`, file };
  }
  const rec = profiles!.create();
  try { copyFileSync(file, profiles!.path(rec.id)); }
  catch (e) { profiles!.remove(rec.id); return { ok: false, message: 'Restore failed — ' + (e instanceof Error ? e.message : String(e)) }; }
  if (booted) closeProfile();
  await boot(rec.id);
  log(`[backup] restored ${file} as profile ${rec.id}`);
  return { ok: true, message: `Restored ${who} as a new profile · ${what}`, file };
}

/** What the operating system says about launching at login (Settings › Startup). */
function startupStatus(): StartupStatus {
  let openAtLogin = false;
  if (app.isPackaged) {
    try { openAtLogin = app.getLoginItemSettings({ args: booted?.settings.get().startup.startInTray ? ['--hidden'] : [] }).openAtLogin; } catch { /* not supported here */ }
  }
  return { supported: app.isPackaged, openAtLogin, launchedHidden: startHidden };
}

if (isPrimary) app.whenReady().then(async () => {
  userData = app.getPath('userData');
  logFile = join(userData, 'dailybee.log');
  try { if (statSync(logFile).size > 1_000_000) renameSync(logFile, logFile + '.1'); } catch { /* no log yet */ }
  log(`[dailybee] ${demo ? 'demo' : 'live'} mode · data in ${userData} · ${process.env.ELECTRON_RENDERER_URL ? 'dev server ' + process.env.ELECTRON_RENDERER_URL : 'built renderer'}`);
  profiles = new ProfileService(userData, log);
  windows = new Windows(demo);
  registerAppIpc({ windows, profiles: profileOps, backup: { pick: pickBackup, restore: restoreBackup }, startup: startupStatus });
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

  // "Start in the tray": a launch from the login item opens no window; the tray icon is the way in.
  const hidden = startHidden && !!booted && booted.settings.get().startup.startInTray && !process.env.DAILYBEE_SMOKE;
  if (hidden) log('[startup] launched hidden: staying in the tray until opened');
  const win = hidden ? null : windows.createMain();
  const r = booted?.session.recovered;
  if (r) {
    log(`[session] closed the run left open at last exit: “${r.task}” ${formatDurationShort(r.seconds)} → ${r.day}`);
    const toast = makeToaster(windows);
    win?.webContents.once('did-finish-load', () => setTimeout(() => toast(`Timer stopped when DailyBee closed · “${r.task}” ${formatDurationShort(r.seconds)} saved${r.day === dayKey() ? '' : ' to ' + r.day}`, 'neutral'), 1200));
  }
  if (win) await runSmoke(win);

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
