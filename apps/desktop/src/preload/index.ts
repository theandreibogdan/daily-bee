import { contextBridge, ipcRenderer } from 'electron';

/**
 * Minimal, typed-at-the-edges bridge. The renderer's `bridge/electron.ts` maps these two
 * primitives onto the DailyBeeApi contract, so the main process never exposes raw ipcRenderer.
 */
const bridge = {
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  demo: process.argv.includes('--dailybee-demo'),
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, cb: (payload: unknown) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

export type PreloadBridge = typeof bridge;

contextBridge.exposeInMainWorld('dailybee', bridge);
