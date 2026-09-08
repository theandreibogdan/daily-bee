import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { browserByProcess } from '../browsers';
import { readFirefoxActiveTab } from '../firefox';
import { friendlyAppName, parseBrowserTitle } from '../title';
import type { PermissionStatus, SamplerOptions } from '../types';
import { EMPTY, isSelf, selfSample, type Provider, type RawSample } from './provider';

/**
 * Linux provider: X11 via `xdotool` (_NET_ACTIVE_WINDOW). Wayland exposes no foreground window
 * to third parties outside the portal, so we degrade to "unknown app". Browser URLs come from
 * Firefox's session store or the window title — Chromium has no scripting surface on Linux.
 */
const run = (cmd: string, args: string[]): Promise<string> => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 2000 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
});

export function createLinuxProvider(opts: SamplerOptions = {}): Provider {
  const log = opts.log ?? (() => {});
  let xdotoolOk: boolean | null = null;
  return {
    async sample(wantUrl: boolean): Promise<RawSample> {
      let out: string;
      try {
        out = await run('xdotool', ['getactivewindow', 'getwindowname', 'getwindowpid']);
        xdotoolOk = true;
      } catch (e) {
        if (xdotoolOk !== false) log('[tracker/linux] xdotool unavailable: ' + String(e));
        xdotoolOk = false;
        return EMPTY;
      }
      const [title = '', pidLine = ''] = out.split('\n');
      const pid = parseInt(pidLine.trim(), 10);
      let processName: string | null = null;
      if (pid) { try { processName = readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { processName = null; } }
      if (isSelf(pid, opts, processName, title)) return selfSample(title, opts);
      const browser = browserByProcess(processName);
      const app = browser ? browser.label : friendlyAppName(processName);
      if (!browser) return { app, process: processName, title, url: null, pageTitle: null, browser: null, urlSource: 'none' };
      const pageTitle = parseBrowserTitle(title, browser);
      let url: string | null = null;
      let urlSource: RawSample['urlSource'] = 'title';
      if (wantUrl && (browser.id === 'firefox' || browser.id === 'zen')) {
        const ff = readFirefoxActiveTab('linux');
        if (ff && (!pageTitle || !ff.title || ff.title === pageTitle)) { url = ff.url; urlSource = 'sessionstore'; }
      }
      return { app, process: processName, title, url, pageTitle, browser: browser.id, urlSource };
    },
    async permissions(): Promise<PermissionStatus[]> {
      const wayland = !!process.env.WAYLAND_DISPLAY && !process.env.DISPLAY;
      return [
        { id: 'x11', name: 'X11 window access', description: wayland ? 'Wayland session: foreground window is not exposed to apps' : 'xdotool reads the active window', state: wayland ? 'denied' : xdotoolOk === false ? 'denied' : xdotoolOk ? 'granted' : 'unknown', requestable: false },
      ];
    },
    dispose() { /* nothing persistent */ },
  };
}
