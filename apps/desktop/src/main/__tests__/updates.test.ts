import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppState } from '../services/appState';
import { UpdateService, notesText, type Updater } from '../services/updates';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const state = () => { const d = mkdtempSync(join(tmpdir(), 'dailybee-updates-')); dirs.push(d); return new AppState(join(d, 'app-state.json')); };

/** electron-updater as an event emitter with the methods the service calls. */
class FakeUpdater extends EventEmitter implements Updater {
  autoDownload = false; autoInstallOnAppQuit = false; allowPrerelease = true; forceDevUpdateConfig = false; logger: unknown = console;
  feed: { provider: 'generic'; url: string } | null = null;
  checks = 0; installed = 0;
  failCheck: Error | null = null;
  setFeedURL(o: { provider: 'generic'; url: string }) { this.feed = o; }
  async checkForUpdates() { this.checks++; if (this.failCheck) throw this.failCheck; this.emit('checking-for-update'); return null; }
  quitAndInstall() { this.installed++; }
}

function make(opts: { packaged?: boolean; feed?: string | null; version?: string; st?: AppState } = {}) {
  const u = new FakeUpdater();
  const st = opts.st ?? state();
  let now = 1_000_000;
  const svc = new UpdateService(u, { version: opts.version ?? '0.1.0', isPackaged: opts.packaged ?? true, feedUrl: opts.feed ?? null, state: st, log: () => {}, now: () => now });
  const changes: string[] = [];
  svc.on('change', (s: { state: string }) => changes.push(s.state));
  return { u, st, svc, changes, tick: (ms: number) => { now += ms; } };
}

describe('UpdateService', () => {
  it('is off in a development build without a feed, and configures the updater when one is given', () => {
    const dev = make({ packaged: false });
    expect(dev.svc.status()).toMatchObject({ supported: false, state: 'idle', version: '0.1.0' });
    expect(dev.svc.status().reason).toContain('development build');
    expect(dev.u.feed).toBeNull();
    const withFeed = make({ packaged: false, feed: 'http://127.0.0.1:8790/' });
    expect(withFeed.svc.status()).toMatchObject({ supported: true, feed: 'http://127.0.0.1:8790' });
    expect(withFeed.u).toMatchObject({ feed: { provider: 'generic', url: 'http://127.0.0.1:8790' }, forceDevUpdateConfig: true, autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false, logger: null });
    expect(new UpdateService(null, { version: '0.1.0', isPackaged: true, feedUrl: null, state: state(), log: () => {} }).status().supported).toBe(false);
  });

  it('follows the updater through check, download and ready, and keeps the notes for the next launch', async () => {
    const m = make();
    await m.svc.check();
    expect(m.u.checks).toBe(1);
    expect(m.svc.status().state).toBe('checking');
    m.u.emit('update-available', { version: '0.2.0', releaseNotes: '<ul><li>Tray actions</li><li>Week view</li></ul>' });
    expect(m.svc.status()).toMatchObject({ state: 'available', latest: '0.2.0', notes: 'Tray actions\nWeek view', progress: 0 });
    m.u.emit('download-progress', { percent: 42.4 });
    expect(m.svc.status()).toMatchObject({ state: 'downloading', progress: 42 });
    const ready: string[] = [];
    m.svc.on('ready', (s: { latest: string }) => ready.push(s.latest));
    m.u.emit('update-downloaded', { version: '0.2.0', releaseNotes: 'Tray actions\nWeek view' });
    expect(m.svc.status()).toMatchObject({ state: 'ready', latest: '0.2.0', progress: 100 });
    expect(ready).toEqual(['0.2.0']);
    expect(m.st.get().pendingNotes).toMatchObject({ version: '0.2.0', notes: 'Tray actions\nWeek view' });
    // Another check while an update is ready changes nothing.
    await m.svc.check();
    expect(m.u.checks).toBe(1);
    expect(m.svc.install()).toBe(true);
    expect(m.u.installed).toBe(1);
    expect(m.changes).toEqual(['checking', 'available', 'downloading', 'ready']);
  });

  it('shows what is new once, when the app runs as the version whose notes were saved', () => {
    const st = state();
    st.update({ lastRunVersion: '0.1.0', pendingNotes: { version: '0.2.0', notes: 'Week view', at: 1 } });
    const first = make({ st, version: '0.2.0' });
    expect(first.svc.status().whatsNew).toEqual({ version: '0.2.0', notes: 'Week view' });
    expect(st.get()).toMatchObject({ lastRunVersion: '0.2.0', pendingNotes: null });
    first.svc.whatsNewSeen();
    expect(first.svc.status().whatsNew).toBeNull();
    expect(make({ st, version: '0.2.0' }).svc.status().whatsNew).toBeNull();
    // Notes for a version that never ran (a downgrade, a fresh install) are not shown.
    const other = state();
    other.update({ lastRunVersion: '0.1.0', pendingNotes: { version: '0.3.0', notes: 'x', at: 1 } });
    expect(make({ st: other, version: '0.1.5' }).svc.status().whatsNew).toBeNull();
  });

  it('reports up to date, and turns errors into a sentence', async () => {
    const m = make();
    await m.svc.check();
    m.u.emit('update-not-available', { version: '0.1.0' });
    expect(m.svc.status()).toMatchObject({ state: 'up-to-date', latest: '0.1.0', checkedAt: 1_000_000, error: null });
    m.u.failCheck = new Error('net::ERR_CONNECTION_REFUSED');
    await m.svc.check();
    expect(m.svc.status()).toMatchObject({ state: 'error', error: 'The update server could not be reached' });
    m.u.failCheck = null;
    await m.svc.check();
    m.u.emit('error', new Error('sha512 checksum mismatch'));
    expect(m.svc.status().error).toBe('The downloaded file did not match the feed (checksum)');
    expect(m.svc.install()).toBe(false);
  });

  it('turns release notes into plain text', () => {
    expect(notesText(null)).toBeNull();
    expect(notesText('<p>Hello &amp; welcome</p><p>Second</p>')).toBe('Hello & welcome\nSecond');
    expect(notesText([{ version: '0.2.0', note: '<b>Tray</b>' }, { version: '0.1.1', note: 'Fixes' }])).toBe('0.2.0\nTray\n\n0.1.1\nFixes');
    expect(notesText([{ version: '0.2.0', note: 'Only one' }])).toBe('Only one');
  });
});
