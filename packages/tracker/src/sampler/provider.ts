import type { PermissionStatus, WindowSample } from '../types';

/** Raw platform observation before timestamp/idle are attached. */
export type RawSample = Omit<WindowSample, 'ts' | 'idle'>;

export interface Provider {
  /** Observe the foreground window; `wantUrl` asks the OS for the browser page URL too. */
  sample(wantUrl: boolean): Promise<RawSample>;
  permissions(): Promise<PermissionStatus[]>;
  /** Kill any sidecar process; the provider must relaunch lazily on the next sample(). */
  dispose(): void;
}

export const EMPTY: RawSample = { app: 'Unknown app', process: null, title: '', url: null, pageTitle: null, browser: null, urlSource: 'none' };

/** The host app's own window (dev builds run as "electron"/"Electron"; packaged builds as the product name). */
export function selfSample(title: string, opts: { selfAppName?: string }): RawSample {
  const name = opts.selfAppName ?? 'DailyBee';
  return { app: name, process: name.toLowerCase(), title: title || name, url: null, pageTitle: null, browser: null, urlSource: 'none' };
}

/**
 * Our own window: same process id, or another DailyBee instance (an Electron process whose
 * window title is exactly the app name — dev builds run as "electron").
 */
export function isSelf(pid: number | null | undefined, opts: { selfPid?: number; selfAppName?: string }, processName?: string | null, title?: string | null): boolean {
  const self = opts.selfPid ?? process.pid;
  if (!!pid && pid === self) return true;
  const name = opts.selfAppName ?? 'DailyBee';
  const proc = (processName || '').toLowerCase().replace(/\.exe$/, '');
  return !!title && title.trim() === name && (proc === 'electron' || proc === name.toLowerCase() || proc === 'com.github.electron' || proc === 'dev.dailybee.desktop');
}

/** Accept only values that look like a page address (UIA returns whatever is in the address bar, even half-typed queries). */
export function looksLikeUrl(v: string | null | undefined): v is string {
  if (!v) return false;
  const s = v.trim();
  if (!s || /\s/.test(s)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return true;
  if (/^(about|chrome|edge|brave|vivaldi|opera|arc):/i.test(s)) return true;
  return /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/|$)/i.test(s);
}
