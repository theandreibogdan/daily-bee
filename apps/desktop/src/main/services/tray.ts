import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { formatDurationShort } from '../../shared/time';
import type { Windows } from '../windows';
import type { SessionService } from './session';
import type { SettingsService } from './settings';

/**
 * System tray (Windows / Linux) and menu bar item (macOS). The app keeps tracking after the main
 * window is closed; the tray shows the status and is the place to quit from.
 */
export class TrayService {
  private tray: Tray | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly windows: Windows, private readonly session: SessionService, private readonly settings: SettingsService, private readonly log: (m: string) => void) {}

  start(): void {
    if (this.tray) return;
    try {
      this.tray = new Tray(this.icon());
    } catch (e) {
      this.log('[tray] unavailable: ' + String(e));
      return;
    }
    this.rebuild();
    // Left click opens the app on Windows/Linux; on macOS a click shows the menu.
    this.tray.on('click', () => { if (process.platform !== 'darwin') this.windows.createMain(); });
    this.tray.on('double-click', () => this.windows.createMain());
    this.session.on('change', () => this.rebuild());
    this.settings.on('change', () => this.rebuild());
    this.timer = setInterval(() => this.tooltip(), 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.tray?.destroy();
    this.tray = null;
  }

  /** One-time hint after the first hide-to-tray (Windows balloon). */
  hint(): void {
    if (!this.tray || process.platform !== 'win32') return;
    try {
      this.tray.displayBalloon({ title: 'DailyBee keeps tracking', content: 'The app stays in the tray. Double-click the icon to open it, right-click to quit.', iconType: 'info' });
    } catch { /* not supported */ }
  }

  private icon(): Electron.NativeImage {
    const dir = join(app.getAppPath(), 'resources', 'tray');
    const file = process.platform === 'darwin' ? 'trayTemplate.png' : process.platform === 'win32' ? 'tray-16.png' : 'tray-32.png';
    const img = nativeImage.createFromPath(join(dir, file));
    if (process.platform === 'darwin') img.setTemplateImage(true);
    return img;
  }

  private status(): string {
    const s = this.session.get();
    const off = !this.settings.get().tracking.enabled ? ' · tracking paused' : '';
    if (!s.running || !s.current) return 'Idle · no task' + off;
    return `${s.current.task} · ${formatDurationShort(this.session.elapsedSeconds())}${s.paused ? ' · paused' : ''}` + off;
  }

  private tooltip(): void {
    this.tray?.setToolTip('DailyBee · ' + this.status());
  }

  rebuild(): void {
    if (!this.tray) return;
    const s = this.session.get();
    const widget = this.settings.get().widget.enabled;
    const tracking = this.settings.get().tracking.enabled;
    const menu = Menu.buildFromTemplate([
      { label: this.status(), enabled: false },
      { type: 'separator' },
      { label: 'Open DailyBee', click: () => this.windows.createMain() },
      s.running
        ? { label: 'Stop task…', click: () => this.windows.openPrompt('end') }
        : { label: 'Start a task…', click: () => this.windows.openPrompt('start') },
      { label: 'Generate report…', click: () => this.windows.openPrompt('report') },
      { type: 'separator' },
      // Pausing stops the app and tab capture only; the task timer keeps counting.
      { label: tracking ? 'Pause tracking' : 'Resume tracking', click: () => { this.settings.update({ tracking: { enabled: !tracking } }); } },
      { label: 'Floating widget', type: 'checkbox', checked: widget, click: (item) => { this.settings.update({ widget: { enabled: item.checked } }); } },
      { type: 'separator' },
      { label: 'Quit DailyBee', click: () => app.quit() },
    ]);
    this.tray.setContextMenu(menu);
    this.tooltip();
  }
}
