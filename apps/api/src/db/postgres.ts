import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Category, DayPush } from '../schemas';
import type { CheckinRec, DayRec, EntryRec, PolicyRules, ProjectRec, Repo, UserRec, WorkspaceSnapshot } from '../types';
import { DEFAULT_POLICY } from './memory';

const here = dirname(fileURLToPath(import.meta.url));
export const hashToken = (t: string): string => createHash('sha256').update(t).digest('hex');
const toDay = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** Postgres repository (DATABASE_URL). Tokens are stored hashed; see schema.sql. */
export class PostgresRepo implements Repo {
  readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  async migrate(): Promise<void> {
    await this.pool.query(readFileSync(join(here, 'schema.sql'), 'utf8'));
  }

  async authenticate(token: string): Promise<UserRec | null> {
    if (!token) return null;
    const r = await this.pool.query<UserRow>('SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1', [hashToken(token)]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }

  async updateProfile(user: UserRec, profile: DayPush['user']): Promise<UserRec> {
    const r = await this.pool.query<UserRow>('UPDATE users SET name = $2, initials = $3, email = $4, team = COALESCE(NULLIF($5, \'\'), team) WHERE id = $1 RETURNING *', [user.id, profile.name, profile.initials, profile.email, profile.team]);
    return r.rows[0] ? rowToUser(r.rows[0]) : user;
  }

  async saveDay(user: UserRec, push: DayPush): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO days(user_id, day, tracking, tracked_seconds, focus, mix, top_apps, report_status, report_sent_at, share_focus, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id, day) DO UPDATE SET tracking = EXCLUDED.tracking, tracked_seconds = EXCLUDED.tracked_seconds, focus = EXCLUDED.focus, mix = EXCLUDED.mix, top_apps = EXCLUDED.top_apps, report_status = EXCLUDED.report_status, report_sent_at = EXCLUDED.report_sent_at, share_focus = EXCLUDED.share_focus, updated_at = EXCLUDED.updated_at`,
        [user.id, push.day, push.tracking, push.trackedSeconds, push.focus, JSON.stringify(push.mix), JSON.stringify(push.topApps), push.report?.status ?? null, push.report?.sentAt ?? null, push.shareFocus, Date.now()],
      );
      await client.query('DELETE FROM entries WHERE user_id = $1 AND day = $2', [user.id, push.day]);
      for (const e of push.entries) {
        await client.query('INSERT INTO entries(user_id, id, day, task, ref, project, start_ts, seconds, done, outcome, blocker, size, size_check) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [user.id, e.id, push.day, e.task, e.ref, e.project, e.startTs, e.seconds, e.done, e.outcome, e.blocker, e.size, e.sizeCheck]);
      }
      await client.query('DELETE FROM checkins WHERE user_id = $1 AND day = $2', [user.id, push.day]);
      for (const c of push.checkins) {
        await client.query('INSERT INTO checkins(user_id, id, day, ts, kind, answer) VALUES($1,$2,$3,$4,$5,$6)', [user.id, c.id, push.day, c.ts, c.kind, c.answer]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async snapshot(workspaceId: string, fromDay: string, toDay_: string): Promise<WorkspaceSnapshot> {
    const [users, days, entries, checkins, projects, ws] = await Promise.all([
      this.pool.query<UserRow>('SELECT * FROM users WHERE workspace_id = $1 ORDER BY name', [workspaceId]),
      this.pool.query<DayRow>('SELECT d.* FROM days d JOIN users u ON u.id = d.user_id WHERE u.workspace_id = $1 AND d.day BETWEEN $2 AND $3', [workspaceId, fromDay, toDay_]),
      this.pool.query<EntryRow>('SELECT e.* FROM entries e JOIN users u ON u.id = e.user_id WHERE u.workspace_id = $1 AND e.day BETWEEN $2 AND $3', [workspaceId, fromDay, toDay_]),
      this.pool.query<CheckinRow>('SELECT c.* FROM checkins c JOIN users u ON u.id = c.user_id WHERE u.workspace_id = $1 AND c.day BETWEEN $2 AND $3', [workspaceId, fromDay, toDay_]),
      this.pool.query<ProjectRow>('SELECT * FROM projects WHERE workspace_id = $1 ORDER BY name', [workspaceId]),
      this.pool.query<{ policy: PolicyRules }>('SELECT policy FROM workspaces WHERE id = $1', [workspaceId]),
    ]);
    const policy = ws.rows[0]?.policy;
    return {
      users: users.rows.map(rowToUser),
      days: days.rows.map((r): DayRec => ({ userId: r.user_id, day: toDay(r.day), tracking: r.tracking, trackedSeconds: r.tracked_seconds, focus: r.focus, mix: r.mix as Record<Category, number>, topApps: r.top_apps, reportStatus: (r.report_status as DayRec['reportStatus']) ?? null, reportSentAt: r.report_sent_at == null ? null : Number(r.report_sent_at), shareFocus: r.share_focus, updatedAt: Number(r.updated_at) })),
      entries: entries.rows.map((r): EntryRec => ({ userId: r.user_id, id: r.id, day: toDay(r.day), task: r.task, ref: r.ref, project: r.project, startTs: Number(r.start_ts), seconds: r.seconds, done: r.done, outcome: r.outcome as EntryRec['outcome'], blocker: r.blocker, size: r.size as EntryRec['size'], sizeCheck: r.size_check as EntryRec['sizeCheck'] })),
      checkins: checkins.rows.map((r): CheckinRec => ({ userId: r.user_id, id: r.id, day: toDay(r.day), ts: Number(r.ts), kind: r.kind as CheckinRec['kind'], answer: r.answer })),
      projects: projects.rows.map((r): ProjectRec => ({ workspaceId: r.workspace_id, id: r.id, name: r.name, color: r.color, budgetHours: r.budget_hours })),
      policy: Array.isArray(policy) && policy.length ? policy : DEFAULT_POLICY,
    };
  }

  async addNudge(from: UserRec, toInitials: string): Promise<void> {
    await this.pool.query('INSERT INTO nudges(workspace_id, from_user_id, to_initials) VALUES($1,$2,$3)', [from.workspaceId, from.id, toInitials]);
  }

  async setPolicy(workspaceId: string, rules: PolicyRules): Promise<PolicyRules> {
    await this.pool.query('UPDATE workspaces SET policy = $2 WHERE id = $1', [workspaceId, JSON.stringify(rules)]);
    return rules;
  }

  /** Admin helper (scripts/tests): create a workspace, a user and a token. */
  async provision(workspace: { id: string; name: string }, user: Omit<UserRec, 'workspaceId'>, token: string): Promise<void> {
    await this.pool.query('INSERT INTO workspaces(id, name, policy) VALUES($1,$2,$3) ON CONFLICT (id) DO NOTHING', [workspace.id, workspace.name, JSON.stringify(DEFAULT_POLICY)]);
    await this.pool.query('INSERT INTO users(id, workspace_id, email, name, initials, team, role) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING', [user.id, workspace.id, user.email, user.name, user.initials, user.team, user.role]);
    await this.pool.query('INSERT INTO tokens(token_hash, user_id, label) VALUES($1,$2,$3) ON CONFLICT (token_hash) DO NOTHING', [hashToken(token), user.id, 'provisioned']);
  }

  async close(): Promise<void> { await this.pool.end(); }
}

interface UserRow { id: string; workspace_id: string; email: string; name: string; initials: string; team: string; role: string }
interface DayRow { user_id: string; day: Date | string; tracking: boolean; tracked_seconds: number; focus: number; mix: unknown; top_apps: string[]; report_status: string | null; report_sent_at: string | number | null; share_focus: boolean; updated_at: string | number }
interface EntryRow { user_id: string; id: string; day: Date | string; task: string; ref: string | null; project: string; start_ts: string | number; seconds: number; done: boolean; outcome: string | null; blocker: boolean; size: string | null; size_check: string | null }
interface CheckinRow { user_id: string; id: string; day: Date | string; ts: string | number; kind: string; answer: string | null }
interface ProjectRow { workspace_id: string; id: string; name: string; color: string; budget_hours: number }

const rowToUser = (r: UserRow): UserRec => ({ id: r.id, workspaceId: r.workspace_id, email: r.email, name: r.name, initials: r.initials, team: r.team, role: (r.role as UserRec['role']) ?? 'member' });
