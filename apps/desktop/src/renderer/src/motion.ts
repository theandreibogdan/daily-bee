import type { DailyBeeApi } from '@shared/api';

const QUERY = '(prefers-reduced-motion: reduce)';

/** The operating system's reduce-motion setting (Windows: Settings › Accessibility › Visual effects › Animation effects). */
export function systemReducesMotion(): boolean {
  try { return window.matchMedia(QUERY).matches; } catch { return false; }
}

/** Settings › Appearance › Reduce animations: an explicit choice wins, null follows the system. */
export function reducesMotion(pref: boolean | null | undefined): boolean {
  return typeof pref === 'boolean' ? pref : systemReducesMotion();
}

/** Stamp the document so the kit's stylesheet can cut every animation and transition to a frame. */
export function applyMotion(pref: boolean | null | undefined): void {
  document.documentElement.dataset.motion = reducesMotion(pref) ? 'reduce' : 'full';
}

/**
 * Keep the document in step with the setting and the OS: every window (main, widget, check-in,
 * warning) calls this once. Without an open profile there is no setting, so the OS decides.
 */
export function watchMotion(api: DailyBeeApi): void {
  let pref: boolean | null | undefined;
  const sync = () => applyMotion(pref);
  sync();
  try { window.matchMedia(QUERY).addEventListener('change', sync); } catch { /* no matchMedia */ }
  const read = async () => {
    try { pref = (await api.settings.get()).appearance?.reduceMotion; } catch { pref = undefined; }
    sync();
  };
  void read();
  api.settings.onChange((s) => { pref = s.appearance?.reduceMotion; sync(); });
  api.profiles.onChange(() => void read());
}
