#!/usr/bin/env node
// DailyBee CLI — talks to the running desktop app over its local control port.
//
//   node scripts/dailybee.mjs status
//   node scripts/dailybee.mjs start "Fix login form" [--project web-app] [--size Small] [--goal "..."]
//   node scripts/dailybee.mjs stop [--summary "what got done"] [--outcome Done|"Partly done"|"Not done"|"Handed off"]
//   node scripts/dailybee.mjs commit ["subject"]      # used by the git hook; starts a task from the last commit
//   node scripts/dailybee.mjs hook install | remove   # run inside a git repository
//
// The app writes <userData>/cli.json (port + token) while it runs. Set DAILYBEE_USER_DATA to point at
// another profile, e.g. the one used for tests.
import { execSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
const userData = process.env.DAILYBEE_USER_DATA
  ?? (process.platform === 'win32' ? join(process.env.APPDATA ?? join(home, 'AppData/Roaming'), 'DailyBee')
    : process.platform === 'darwin' ? join(home, 'Library/Application Support/DailyBee')
    : join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'DailyBee'));
const cfgPath = join(userData, 'cli.json');

const fail = (m) => { console.error('dailybee: ' + m); process.exit(1); };
const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1] ?? ''; i++; } else positional.push(rest[i]);
}

async function call(path, body = {}) {
  if (!existsSync(cfgPath)) fail(`DailyBee is not running (no ${cfgPath})`);
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${cfg.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dailybee-token': cfg.token }, body: JSON.stringify(body) });
  } catch { fail('DailyBee is not running (nothing on port ' + cfg.port + ')'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(json.error ?? res.statusText);
  return json;
}

const fmt = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };
const git = (args) => execSync('git ' + args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

switch (cmd) {
  case 'status': {
    const { session, elapsedSeconds } = await call('/status');
    if (!session.running) console.log('No task running');
    else console.log(`${session.current.task} · ${fmt(elapsedSeconds)}${session.paused ? ` · paused (${session.paused.reason})` : ''}`);
    break;
  }
  case 'start': {
    const task = positional.join(' ');
    if (!task) fail('usage: start "task name" [--project id] [--size Small] [--goal "..."]');
    const { session } = await call('/start', { task, project: flags.project, size: flags.size, goal: flags.goal });
    console.log(`Tracking “${session.current.task}”`);
    break;
  }
  case 'stop': {
    const { entry } = await call('/stop', { summary: flags.summary, outcome: flags.outcome });
    console.log(`Saved “${entry.task}” · ${fmt(entry.seconds)}`);
    break;
  }
  case 'commit': {
    let message = positional.join(' ');
    let repo = '';
    try { if (!message) message = git('log -1 --pretty=%s'); repo = basename(git('rev-parse --show-toplevel')); } catch { /* not in a git repo: use the message given */ }
    if (!message) fail('no commit message (run inside a repo or pass one)');
    const r = await call('/commit', { message, repo });
    console.log(r.started ? `Tracking “${r.session.current.task}”` : `Not started: ${r.reason}`);
    break;
  }
  case 'hook': {
    let gitDir;
    try { gitDir = resolve(git('rev-parse --git-dir')); } catch { fail('run this inside a git repository'); }
    const hook = join(gitDir, 'hooks', 'post-commit');
    if (positional[0] === 'remove') {
      if (existsSync(hook) && readFileSync(hook, 'utf8').includes('dailybee')) { unlinkSync(hook); console.log('removed ' + hook); } else console.log('no DailyBee hook in ' + hook);
      break;
    }
    if (positional[0] !== 'install') fail('usage: hook install | remove');
    const self = fileURLToPath(import.meta.url).replace(/\\/g, '/');
    const node = process.execPath.replace(/\\/g, '/');
    mkdirSync(join(gitDir, 'hooks'), { recursive: true });
    if (existsSync(hook) && !readFileSync(hook, 'utf8').includes('dailybee')) fail(hook + ' already exists; add this line to it:\n  "' + node + '" "' + self + '" commit >/dev/null 2>&1 || true');
    writeFileSync(hook, `#!/bin/sh\n# DailyBee: start the timer from the commit subject (Settings › Tracking › Start timer on git commit)\n"${node}" "${self}" commit >/dev/null 2>&1 || true\n`);
    try { chmodSync(hook, 0o755); } catch { /* windows */ }
    console.log('installed ' + hook);
    break;
  }
  default:
    console.log('usage: dailybee status | start "task" | stop | commit ["subject"] | hook install|remove');
}
