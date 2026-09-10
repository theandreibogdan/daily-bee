import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { formatDurationShort } from '../../shared/time';
import type { Windows } from '../windows';
import type { QuickActions } from './quick';
import type { SessionService } from './session';
import type { SettingsService } from './settings';

/** "CommandOrControl+Alt+D" the way the platform writes it. */
export function prettyAccelerator(acc: string): string {
  const mac = process.platform === 'darwin';
  return acc.replace(/CommandOrControl|CmdOrCtrl/g, mac ? '⌘' : 'Ctrl').replace(/Command|Cmd/g, '⌘').replace(/Control/g, 'Ctrl').replace(/\+/g, mac ? '' : '+');
}

const trunc = (t: string, max = 42): string => (t.length > max ? t.slice(0, max - 1) + '…' : t);

/**
 * System tray (Windows / Linux) and menu bar item (macOS). The app keeps tracking after the main
 * window is closed; the tray shows the status and is the place to quit from.
 */
export class TrayService {
  private tray: Tray | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly windows: Windows, private readonly session: SessionService, private readonly settings: SettingsService, private readonly quick: QuickActions, private readonly log: (m: string) => void, private readonly updates?: { ready(): string | null; install(): void }) {}

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
    const { widget, tracking, shortcuts } = { widget: this.settings.get().widget.enabled, tracking: this.settings.get().tracking.enabled, shortcuts: this.settings.get().shortcuts };
    const last = s.running ? null : this.quick.last();
    const recent = s.running ? [] : this.quick.recent(7).filter((t) => !last || t.task !== last.task).slice(0, 6);
    // Start, stop and resume without the window; the dialogs stay one click away for a new task or a wrap-up.
    const actions: Electron.MenuItemConstructorOptions[] = s.running && s.current
      ? [
        { label: `Stop now · saves “${trunc(s.current.task, 32)}”`, click: () => { this.quick.stopNow(); } },
        { label: 'Stop with wrap-up…', click: () => this.windows.openPrompt('end') },
      ]
      : [
        ...(last ? [{ label: `Resume “${trunc(last.task, 36)}”`, click: () => { this.quick.start(last); } }] : []),
        ...(recent.length ? [{ label: 'Start recent', submenu: recent.map((t) => ({ label: trunc(t.task), click: () => { this.quick.start(t); } })) }] : []),
        { label: 'Start a task…', click: () => this.windows.openPrompt('start') },
      ];
    const ready = this.updates?.ready() ?? null;
    const menu = Menu.buildFromTemplate([
      ...(ready ? [{ label: `Restart to update to DailyBee ${ready}`, click: () => this.updates?.install() }, { type: 'separator' as const }] : []),
      { label: this.status(), enabled: false },
      ...(shortcuts.enabled && shortcuts.toggle ? [{ label: `${prettyAccelerator(shortcuts.toggle)} · start or stop from anywhere`, enabled: false }] : []),
      { type: 'separator' },
      { label: 'Open DailyBee', click: () => this.windows.createMain() },
      { type: 'separator' },
      ...actions,
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
