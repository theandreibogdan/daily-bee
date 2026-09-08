export interface PreloadBridge {
  platform: 'darwin' | 'win32' | 'linux';
  demo: boolean;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, cb: (payload: unknown) => void) => () => void;
}

declare global {
  interface Window {
    dailybee?: PreloadBridge;
  }
}

export {};
