import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { OUTCOMES, TASK_SIZES, type Outcome, type Project, type TaskSize } from '../../shared/types';
import type { Repo } from '../repo';
import type { SessionService } from './session';
import type { SettingsService } from './settings';

export interface CliHost {
  /** Entries changed outside the IPC layer: tell the windows */
  entriesChanged(): void;
}

/**
 * Local control port for the CLI (scripts/dailybee.mjs) and the git post-commit hook.
 * Loopback only, guarded by a per-launch token written to <userData>/cli.json.
 *   POST /status            → session + elapsed
 *   POST /start {task, project?, size?, goal?}
 *   POST /stop  {summary?, outcome?}
 *   POST /commit {message, repo?}   → starts a task from the commit subject when
 *                                    "Start timer on git commit" is on and nothing is running
 */
export class CliServer {
  private server: Server | null = null;
  readonly token = randomBytes(12).toString('hex');

  constructor(private readonly userData: string, private readonly settings: SettingsService, private readonly session: SessionService, private readonly repo: Repo, private readonly host: CliHost, private readonly log: (m: string) => void) {}

  /** Prefers the well-known port; falls back to any free one (a second profile on the same machine) and records it in cli.json. */
  start(port = 47831): void {
    if (this.server) return;
    const srv = createServer((req, res) => { void this.handle(req, res); });
    srv.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE' && port !== 0) { this.log(`[cli] port ${port} is busy, picking a free one`); srv.listen(0, '127.0.0.1'); return; }
      this.log('[cli] ' + String(e));
    });
    srv.on('listening', () => {
      const addr = srv.address();
      const actual = typeof addr === 'object' && addr ? addr.port : port;
      try { writeFileSync(join(this.userData, 'cli.json'), JSON.stringify({ port: actual, token: this.token })); } catch (err) { this.log('[cli] could not write cli.json: ' + String(err)); }
      this.log(`[cli] listening on 127.0.0.1:${actual}`);
    });
    srv.listen(port, '127.0.0.1');
    this.server = srv;
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (req.headers['x-dailybee-token'] !== this.token) return send(401, { error: 'bad or missing token' });
      const body = await readJson(req);
      const url = (req.url ?? '/').split('?')[0];
      const s = this.session.get();
      if (url === '/status') return send(200, { session: s, elapsedSeconds: this.session.elapsedSeconds() });
      if (url === '/start') {
        const task = String(body.task ?? '').trim();
        if (!task) return send(400, { error: 'task is required' });
        const session = this.session.start({ task, goal: String(body.goal ?? ''), size: sizeOf(body.size), project: this.projectFor(body.project), ref: null, mood: 'Focused' });
        this.host.entriesChanged();
        return send(200, { session });
      }
      if (url === '/stop') {
        if (!s.running || !s.current) return send(409, { error: 'no task is running' });
        const r = this.session.stop({ summary: String(body.summary ?? ''), outcome: outcomeOf(body.outcome), sizeCheck: s.current.size, blocker: false });
        this.host.entriesChanged();
        return send(200, r);
      }
      if (url === '/commit') {
        if (!this.settings.get().tracking.startOnCommit) return send(200, { started: false, reason: '"Start timer on git commit" is off in Settings › Tracking' });
        if (s.running && s.current) return send(200, { started: false, reason: `already tracking “${s.current.task}”` });
        const subject = String(body.message ?? '').split('\n')[0]!.trim() || 'Commit';
        const session = this.session.start({ task: subject, goal: '', size: 'Small', project: this.projectFor(body.repo), ref: null, mood: 'Focused' });
        this.host.entriesChanged();
        return send(200, { started: true, session });
      }
      return send(404, { error: 'unknown command' });
    } catch (e) {
      this.log('[cli] ' + String(e));
      send(500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Match a project by id or name (a repo folder name usually equals the project name); fall back to the first project. */
  private projectFor(hint: unknown): string {
    const projects = this.repo.getKv<Project[]>('projects', []);
    const h = String(hint ?? '').toLowerCase();
    const hit = h ? projects.find((p) => p.id.toLowerCase() === h || p.name.toLowerCase() === h) : undefined;
    return hit?.id ?? projects[0]?.id ?? 'api';
  }
}

const sizeOf = (v: unknown): TaskSize => (TASK_SIZES as readonly string[]).includes(String(v)) ? (v as TaskSize) : 'Small';
const outcomeOf = (v: unknown): Outcome => (OUTCOMES as readonly string[]).includes(String(v)) ? (v as Outcome) : 'Done';

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => { raw += c; if (raw.length > 65536) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
