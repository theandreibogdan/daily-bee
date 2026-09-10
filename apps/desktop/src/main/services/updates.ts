import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import type { UpdateStatus } from '../../shared/types';
import type { AppState } from './appState';

/** What electron-updater's autoUpdater looks like to this service (kept narrow so tests can fake it). */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  forceDevUpdateConfig: boolean;
  logger: unknown;
  setFeedURL(options: { provider: 'generic'; url: string }): void;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- electron-updater's own listener type
  on(event: string, listener: (...args: any[]) => void): unknown;
}

/** electron-updater's UpdateInfo, the parts used here. */
export interface UpdateInfoLike { version: string; releaseNotes?: string | Array<{ version: string; note: string | null }> | null; releaseDate?: string }

export interface UpdateHost {
  version: string;
  isPackaged: boolean;
  /** Runtime feed override (DAILYBEE_UPDATE_URL); the packaged app otherwise reads app-update.yml from the build */
  feedUrl: string | null;
  state: AppState;
  /** Development builds: electron-updater insists on reading dev-app-update.yml next to the app while downloading; the service writes it there when a feed is given */
  devConfigPath?: string;
  log(m: string): void;
  now?(): number;
}

/** First check half a minute after launch, then twice a day. */
const FIRST_CHECK_MS = 30_000;
const CHECK_EVERY_MS = 12 * 3600_000;

/**
 * Self-update through electron-updater: checks the feed on a schedule and on request, downloads in
 * the background, tells the app when a version is ready (Settings › Updates, the bell, the tray) and
 * installs on restart. Release notes of a downloaded update are kept in the app state and shown
 * once, as "What's new", when the app next runs as that version.
 */
export class UpdateService extends EventEmitter {
  private state: UpdateStatus['state'] = 'idle';
  private latest: string | null = null;
  private notes: string | null = null;
  private progress: number | null = null;
  private error: string | null = null;
  private checkedAt: number | null = null;
  private whatsNew: UpdateStatus['whatsNew'] = null;
  private timers: NodeJS.Timeout[] = [];
  readonly supported: boolean;
  readonly reason: string | null;

  constructor(private readonly updater: Updater | null, private readonly host: UpdateHost) {
    super();
    const feed = host.feedUrl?.trim().replace(/\/$/, '') || null;
    if (!updater) { this.supported = false; this.reason = 'Updates are not available in this build.'; }
    else if (!host.isPackaged && !feed) { this.supported = false; this.reason = 'This is a development build; the installed app checks for updates on its own.'; }
    else { this.supported = true; this.reason = null; }
    // "What's new": the app runs as a version whose notes were saved when the update downloaded.
    const s = host.state.get();
    if (s.lastRunVersion !== host.version) {
      if (s.pendingNotes && s.pendingNotes.version === host.version) this.whatsNew = { version: s.pendingNotes.version, notes: s.pendingNotes.notes };
      host.state.update({ lastRunVersion: host.version, pendingNotes: this.whatsNew ? null : s.pendingNotes });
    }
    if (updater && this.supported) {
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = true;
      updater.allowPrerelease = false;
      updater.logger = null;
      if (feed) {
        if (!host.isPackaged && host.devConfigPath) {
          try { writeFileSync(host.devConfigPath, `provider: generic
url: ${feed}
updaterCacheDirName: dailybee-updater
`); }
          catch (e) { host.log('[updates] could not write ' + host.devConfigPath + ': ' + String(e)); }
        }
        updater.forceDevUpdateConfig = !host.isPackaged;
        updater.setFeedURL({ provider: 'generic', url: feed });
      }
      updater.on('checking-for-update', () => this.set({ state: 'checking', error: null }));
      updater.on('update-available', (info: UpdateInfoLike) => this.set({ state: 'available', latest: info.version, notes: notesText(info.releaseNotes), progress: 0 }));
      updater.on('update-not-available', (info: UpdateInfoLike) => this.set({ state: 'up-to-date', latest: info?.version ?? host.version, checkedAt: this.now() }));
      updater.on('download-progress', (p: { percent: number }) => this.set({ state: 'downloading', progress: Math.round(p.percent) }));
      updater.on('update-downloaded', (info: UpdateInfoLike) => {
        const notes = notesText(info.releaseNotes);
        host.state.update({ pendingNotes: { version: info.version, notes: notes ?? '', at: this.now() } });
        this.set({ state: 'ready', latest: info.version, notes, progress: 100, checkedAt: this.now() });
        this.emit('ready', this.status());
      });
      updater.on('error', (e: Error) => this.set({ state: 'error', error: friendly(e), checkedAt: this.now() }));
    }
  }

  private now(): number { return this.host.now?.() ?? Date.now(); }

  status(): UpdateStatus {
    return { supported: this.supported, reason: this.reason, version: this.host.version, feed: this.host.feedUrl?.trim().replace(/\/$/, '') || (this.host.isPackaged ? "the build's update feed" : null), state: this.state, latest: this.latest, notes: this.notes, progress: this.progress, error: this.error, checkedAt: this.checkedAt, whatsNew: this.whatsNew };
  }

  /** Schedule the automatic checks (no-op when updates are not supported). */
  start(): void {
    if (!this.supported || this.timers.length) return;
    this.timers = [setTimeout(() => void this.check(), FIRST_CHECK_MS), setInterval(() => void this.check(), CHECK_EVERY_MS)];
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /** One check now; the updater's events move the state from here. Resolves with the state once the check itself has run. */
  async check(): Promise<UpdateStatus> {
    if (!this.supported || !this.updater) return this.status();
    if (this.state === 'downloading' || this.state === 'ready') return this.status();
    // The updater announces 'checking-for-update' itself; only a failure to even start needs a state here.
    this.error = null;
    try { await this.updater.checkForUpdates(); }
    catch (e) { this.set({ state: 'error', error: friendly(e), checkedAt: this.now() }); }
    return this.status();
  }

  /** Quit and run the downloaded installer; the app comes back as the new version. */
  install(): boolean {
    if (!this.updater || this.state !== 'ready') return false;
    this.host.log(`[updates] installing ${this.latest}`);
    this.updater.quitAndInstall(false, true);
    return true;
  }

  whatsNewSeen(): UpdateStatus {
    this.whatsNew = null;
    this.host.state.update({ pendingNotes: null });
    this.emit('change', this.status());
    return this.status();
  }

  private set(patch: Partial<{ state: UpdateStatus['state']; latest: string | null; notes: string | null; progress: number | null; error: string | null; checkedAt: number | null }>): void {
    if (patch.state !== undefined) this.state = patch.state;
    if (patch.latest !== undefined) this.latest = patch.latest;
    if (patch.notes !== undefined) this.notes = patch.notes;
    if (patch.progress !== undefined) this.progress = patch.progress;
    if (patch.error !== undefined) this.error = patch.error;
    if (patch.checkedAt !== undefined) this.checkedAt = patch.checkedAt;
    if (patch.state) this.host.log(`[updates] ${patch.state}${this.latest ? ' ' + this.latest : ''}${this.error ? ' · ' + this.error : ''}`);
    this.emit('change', this.status());
  }
}

/** Release notes as plain text: electron-updater hands over a string (HTML from GitHub), a list per version, or nothing. */
export function notesText(notes: UpdateInfoLike['releaseNotes']): string | null {
  if (!notes) return null;
  const strip = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
  if (typeof notes === 'string') return strip(notes) || null;
  const text = notes.map((n) => (n.note ? `${notes.length > 1 ? n.version + '\n' : ''}${strip(n.note)}` : '')).filter(Boolean).join('\n\n');
  return text || null;
}

function friendly(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR|getaddrinfo/i.test(raw)) return 'The update server could not be reached';
  if (/404/.test(raw)) return 'No update feed at that address (404)';
  if (/app-update\.yml|dev-app-update\.yml|is not defined|Cannot find/i.test(raw)) return 'No update feed is configured in this build';
  if (/sha512|checksum/i.test(raw)) return 'The downloaded file did not match the feed (checksum)';
  if (/signature|publisher/i.test(raw)) return 'The downloaded installer is not signed by the expected publisher';
  return raw.split('\n')[0]!.slice(0, 160);
}
