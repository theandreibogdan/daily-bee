#!/usr/bin/env node
// Runs a command with a `pnpm` executable guaranteed to be on PATH.
//
// electron-builder 26 asks pnpm for the dependency tree while packaging (`pnpm list --prod --json`),
// and it looks the command up on PATH. On a machine that only has `corepack pnpm` (Corepack ships
// with Node, but `corepack enable` needs administrator rights on Windows) that lookup fails and
// packaging stops with "No JSON content found in output". This script puts a tiny shim that
// forwards to `corepack pnpm` on PATH when there is no real pnpm, then runs the command.
// With pnpm already on PATH it changes nothing. The desktop package scripts use it:
//
//   node ../../scripts/with-pnpm.mjs electron-builder --win zip --config electron-builder.config.cjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: node scripts/with-pnpm.mjs <command> [args...]');
  process.exit(2);
}

const win = process.platform === 'win32';
const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
// Windows keeps the variable as "Path"; adding a second "PATH" key would leave two of them.
const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
const dirs = (env[pathKey] || '').split(delimiter).filter(Boolean);

// The command itself may live in node_modules/.bin (only on PATH when running under `pnpm run`).
const binDirs = [];
for (let dir = process.cwd(); ; dir = dirname(dir)) {
  const bin = join(dir, 'node_modules', '.bin');
  if (existsSync(bin)) binDirs.push(bin);
  if (dirname(dir) === dir) break;
}

const pnpmNames = win ? ['pnpm.cmd', 'pnpm.exe', 'pnpm.bat'] : ['pnpm'];
const pnpmOnPath = dirs.some((dir) => pnpmNames.some((name) => existsSync(join(dir, name))));
const shimDirs = [];
if (!pnpmOnPath) {
  const shimDir = resolve(tmpdir(), 'dailybee-pnpm-shim');
  mkdirSync(shimDir, { recursive: true });
  if (win) writeFileSync(join(shimDir, 'pnpm.cmd'), '@echo off\r\ncorepack pnpm %*\r\n');
  else writeFileSync(join(shimDir, 'pnpm'), '#!/bin/sh\nexec corepack pnpm "$@"\n', { mode: 0o755 });
  shimDirs.push(shimDir);
  console.log(`[with-pnpm] pnpm is not on PATH; using a shim in ${shimDir} that runs "corepack pnpm"`);
}
env[pathKey] = [...shimDirs, ...binDirs, ...dirs].join(delimiter);

// One command line for the shell (an args array with shell: true is deprecated in newer Node).
const quote = (arg) => (/[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, win ? '""' : '\\"')}"` : arg);
const result = spawnSync([command, ...args].map(quote).join(' '), { stdio: 'inherit', shell: true, env });
if (result.error) {
  console.error(`[with-pnpm] could not start "${command}": ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
