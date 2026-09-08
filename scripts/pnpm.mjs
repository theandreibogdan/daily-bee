// Runs pnpm from the root package.json scripts without requiring `pnpm` on PATH.
// Uses a pnpm found on PATH when there is one, otherwise goes through Corepack (bundled with
// Node), which picks the version from the "packageManager" field in package.json.
// Needed on Windows machines where npm's global folder is not on PATH or PowerShell blocks .ps1 shims.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const args = process.argv.slice(2);
const names = process.platform === 'win32' ? ['pnpm.cmd', 'pnpm.exe', 'pnpm.bat'] : ['pnpm'];
const onPath = (process.env.PATH || '').split(delimiter).some((dir) => dir && names.some((n) => existsSync(join(dir, n))));
const command = onPath ? 'pnpm' : 'corepack pnpm';

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
});
if (result.error) {
  console.error(`[pnpm.mjs] could not start "${command}": ${result.error.message}\nInstall pnpm (npm install -g pnpm) or enable Corepack (corepack enable pnpm).`);
  process.exit(1);
}
process.exit(result.status ?? 1);
