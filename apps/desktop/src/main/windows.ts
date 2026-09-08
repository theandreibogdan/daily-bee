import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import { EV } from '../shared/api';
import type { Checkin } from '../shared/types';

const isDev = !!process.env.ELECTRON_RENDERER_URL;
/** Height of the custom title bar (renderer draws it; the Windows controls overlay matches it). */
export const TITLEBAR_HEIGHT = 40;

function load(win: BrowserWindow, query?: Record<string, string>): void {
  if (isDev) {
    const u = new URL(process.env.ELECTRON_RENDERER_URL!);
    for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
    void win.loadURL(u.toString());
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query });
  }
}

export class Windows {
  main: BrowserWindow | null = null;
  popup: BrowserWindow | null = null;

  constructor(private readonly demo: boolean) {}

  private prefs(): Electron.WebPreferences {
    return { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, additionalArguments: this.demo ? ['--dailybee-demo'] : [] };
  }

  createMain(): BrowserWindow {
    if (this.main && !this.main.isDestroyed()) { this.main.show(); return this.main; }
    // Custom title bar: the renderer draws the bar (name, mark, drag region) and, on Windows, the
    // minimise / maximise / close buttons (driven over IPC). macOS keeps its traffic lights; Linux
    // keeps its native frame.
    const custom = process.platform !== 'linux';
    const win = new BrowserWindow({
      width: 1280, height: 800, minWidth: 960, minHeight: 640, show: false, title: 'DailyBee',
      backgroundColor: '#FAF8F3', autoHideMenuBar: true, webPreferences: this.prefs(),
      ...(custom ? { titleBarStyle: 'hidden' as const } : {}),
      ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 12 } } : {}),
    });
    win.once('ready-to-show', () => win.show());
    const sendState = () => { if (!win.isDestroyed()) win.webContents.send(EV.windowState, { maximized: win.isMaximized(), focused: win.isFocused() }); };
    win.on('maximize', sendState);
    win.on('unmaximize', sendState);
    win.on('focus', sendState);
    win.on('blur', sendState);
    win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });
    win.on('closed', () => { if (this.main === win) this.main = null; });
    load(win);
    this.main = win;
    return win;
  }

  /** Floating check-in (360px, top-right of the primary display) shown when the app is not focused. */
  showPopup(c: Checkin): void {
    const area = screen.getPrimaryDisplay().workArea;
    const width = 360, height = 240;
    if (!this.popup || this.popup.isDestroyed()) {
      this.popup = new BrowserWindow({
        width, height, x: area.x + area.width - width - 24, y: area.y + 72, frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true, focusable: true, show: false, hasShadow: false,
        webPreferences: this.prefs(),
      });
      this.popup.setAlwaysOnTop(true, 'floating');
      this.popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.popup.on('closed', () => { this.popup = null; });
      load(this.popup, { view: 'checkin' });
      this.popup.webContents.once('did-finish-load', () => this.popup?.webContents.send(EV.checkinPrompt, c));
    } else {
      this.popup.webContents.send(EV.checkinPrompt, c);
    }
    this.popup.showInactive();
  }

  hidePopup(): void {
    if (this.popup && !this.popup.isDestroyed()) this.popup.hide();
  }

  broadcast(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }

  mainFocused(): boolean {
    return !!this.main && !this.main.isDestroyed() && this.main.isVisible() && this.main.isFocused();
  }
}
