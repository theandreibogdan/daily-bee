// pnpm does not always run Electron's own postinstall (which downloads the platform binary).
// Runs after `pnpm install`; a no-op when the binary is already there.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
let pkgJson;
try {
  pkgJson = require.resolve('electron/package.json');
} catch {
  process.exit(0); // electron not installed in this checkout (e.g. API-only install)
}
const dir = dirname(pkgJson);
const binary = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app' : 'electron';
if (existsSync(join(dir, 'dist', binary))) process.exit(0);

console.log('[ensure-electron] Electron binary missing — running electron/install.js');
const result = spawnSync(process.execPath, [join(dir, 'install.js')], { stdio: 'inherit', cwd: dir });
process.exit(result.status ?? 1);
