import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import { EV } from '../shared/api';
import type { Checkin } from '../shared/types';

const isDev = !!process.env.ELECTRON_RENDERER_URL;
/** Height of the custom title bar (renderer draws it). */
export const TITLEBAR_HEIGHT = 40;
/** Floating widget window size (DIP). */
export const WIDGET_SIZE = { width: 320, height: 68 };

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
  widget: BrowserWindow | null = null;
  /** Set on before-quit: close events then really close instead of hiding to the tray. */
  quitting = false;
  /** Fired when the main window hides to the tray (used once for a "still tracking" hint). */
  onHideToTray: (() => void) | null = null;
  onWidgetMoved: ((pos: { x: number; y: number }) => void) | null = null;

  constructor(private readonly demo: boolean) {}

  private prefs(): Electron.WebPreferences {
    return { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, additionalArguments: this.demo ? ['--dailybee-demo'] : [] };
  }

  createMain(): BrowserWindow {
    if (this.main && !this.main.isDestroyed()) {
      if (this.main.isMinimized()) this.main.restore();
      this.main.show();
      this.main.focus();
      return this.main;
    }
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
    // Closing the window hides it to the tray; tracking keeps running. Quit from the tray menu (or ⌘Q).
    win.on('close', (e) => {
      if (this.quitting) return;
      e.preventDefault();
      win.hide();
      this.onHideToTray?.();
    });
    win.on('closed', () => { if (this.main === win) this.main = null; });
    load(win);
    this.main = win;
    return win;
  }

  /** Show the main window and open one of the prompts in it (tray menu actions). */
  openPrompt(p: 'start' | 'end' | 'report'): void {
    const win = this.createMain();
    const send = () => { if (!win.isDestroyed()) win.webContents.send(EV.navigate, 'prompt:' + p); };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => setTimeout(send, 800));
    else send();
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

  /**
   * Persistent floating widget: small, translucent, always on top, draggable. Shows time on task,
   * the task name and the current app or tab with its category. Position is remembered.
   */
  showWidget(saved?: { x: number; y: number } | null): void {
    if (this.widget && !this.widget.isDestroyed()) { this.widget.showInactive(); return; }
    const area = screen.getPrimaryDisplay().workArea;
    const { width, height } = WIDGET_SIZE;
    const inArea = saved && saved.x >= area.x - width / 2 && saved.x <= area.x + area.width - width / 2 && saved.y >= area.y && saved.y <= area.y + area.height - 20;
    const x = inArea ? saved!.x : area.x + area.width - width - 16;
    const y = inArea ? saved!.y : area.y + area.height - height - 16;
    const w = new BrowserWindow({
      width, height, x, y, frame: false, transparent: true, alwaysOnTop: true, resizable: false, skipTaskbar: true, hasShadow: false, show: false,
      minimizable: false, maximizable: false, fullscreenable: false, title: 'DailyBee widget', webPreferences: this.prefs(),
    });
    w.setAlwaysOnTop(true, 'floating');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    w.on('moved', () => { if (!w.isDestroyed()) { const b = w.getBounds(); this.onWidgetMoved?.({ x: b.x, y: b.y }); } });
    w.on('closed', () => { if (this.widget === w) this.widget = null; });
    w.once('ready-to-show', () => { if (!w.isDestroyed()) w.showInactive(); });
    load(w, { view: 'widget' });
    this.widget = w;
  }

  hideWidget(): void {
    if (this.widget && !this.widget.isDestroyed()) this.widget.destroy();
    this.widget = null;
  }

  broadcast(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }

  mainFocused(): boolean {
    return !!this.main && !this.main.isDestroyed() && this.main.isVisible() && this.main.isFocused();
  }
}
