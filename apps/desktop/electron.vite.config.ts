import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const shared = resolve(__dirname, 'src/shared');

export default defineConfig({
  main: {
    // Workspace packages are TypeScript sources: bundle them; keep real dependencies external.
    plugins: [externalizeDepsPlugin({ exclude: ['@dailybee/tracker', '@dailybee/ui', '@dailybee/api'] })],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { external: ['electron', 'sql.js', 'nodemailer', '@anthropic-ai/sdk', 'pg'] } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer/src'), '@shared': shared } },
    server: { port: 5173, strictPort: true },
  },
});
