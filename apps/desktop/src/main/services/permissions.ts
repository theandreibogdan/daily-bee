import { shell, systemPreferences } from 'electron';
import type { PermissionStatus } from '@dailybee/tracker';
import type { TrackerService } from './tracker';

const MAC_PANES: Record<string, string> = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
};

/**
 * Settings › System permissions. Merges what the tracker learned from its last samples with
 * Electron's own checks, and knows how to open the right OS pane / trigger the OS prompt.
 * Without a permission, DailyBee degrades to app names only.
 */
export class PermissionService {
  constructor(private readonly tracker: TrackerService) {}

  async list(): Promise<PermissionStatus[]> {
    const fromTracker = await this.tracker.permissions();
    if (process.platform !== 'darwin') return fromTracker;
    return fromTracker.map((p) => {
      if (p.id === 'accessibility') {
        const trusted = systemPreferences.isTrustedAccessibilityClient(false);
        return { ...p, state: trusted ? 'granted' : p.state === 'granted' ? 'granted' : 'denied' };
      }
      if (p.id === 'screen') {
        const s = systemPreferences.getMediaAccessStatus('screen');
        return { ...p, state: s === 'granted' ? 'granted' : s === 'not-determined' ? 'unknown' : 'denied' };
      }
      return p;
    });
  }

  async request(id: string): Promise<PermissionStatus[]> {
    if (process.platform === 'darwin') {
      if (id === 'accessibility') {
        systemPreferences.isTrustedAccessibilityClient(true);
        await shell.openExternal(MAC_PANES.accessibility!);
      } else if (id.startsWith('automation:')) {
        // Sending one Apple event makes macOS show its own consent prompt for that browser.
        try { await this.tracker.testCapture(); } catch { /* prompt shown or denied */ }
        await shell.openExternal(MAC_PANES.automation!);
      } else if (id === 'screen') {
        await shell.openExternal(MAC_PANES.screen!);
      }
    }
    return this.list();
  }
}
