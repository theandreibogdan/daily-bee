// Plain Vite config for running the renderer in a normal browser (no Electron).
// The renderer then talks to the in-memory mock in src/renderer/src/bridge/mock.ts.
// Used by `pnpm dev:renderer`; the Electron build uses electron.vite.config.ts.
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer/src'), '@shared': resolve(__dirname, 'src/shared') } },
  server: { port: 5174, strictPort: true },
});
