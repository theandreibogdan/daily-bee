import { EventEmitter } from 'node:events';
import { createTRPCClient, httpBatchLink, type TRPCClient } from '@trpc/client';
import { CATEGORIES } from '@dailybee/tracker';
import type { AppRouter } from '@dailybee/api/router';
import type { AdminData, TeamData } from '../../shared/team';
import type { SyncStatus } from '../../shared/types';
import { dayKey, startOfDay, startOfWeek } from '../../shared/time';
import { FAKE_ADMIN, FAKE_TEAM } from '../fakeTeam';
import type { Repo } from '../repo';
import type { SessionService } from './session';
import type { SettingsService } from './settings';
import type { TrackerService } from './tracker';

const FORBIDDEN_KEYS = new Set(['url', 'urls', 'title', 'pagetitle', 'page_title', 'domain', 'tabs', 'windowtitle']);
const URL_RE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s)]+/gi;

/**
 * Privacy guard: sync payloads may only carry entries, outcomes, check-in answers, app names and
 * aggregated category mix. Keys that could hold pages are dropped and URL-like text is redacted,
 * so per-page URLs and window titles can never leave the device even by accident.
 */
export function scrubForSync<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(URL_RE, '[url]');
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue;
        out[k] = walk(x);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

export class SyncService extends EventEmitter {
  private status: SyncStatus = { configured: false, connected: false, lastPushAt: null, lastError: null, shares: 'Entries, outcomes, check-in answers, app names and category mix. Never URLs or window titles.' };
  private timer: NodeJS.Timeout | null = null;
  private client: TRPCClient<AppRouter> | null = null;
  private clientKey = '';

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, private readonly session: SessionService, private readonly tracker: TrackerService, private readonly log: (m: string) => void) {
    super();
    this.refreshClient();
    settings.on('change', () => this.refreshClient());
  }

  private refreshClient(): void {
    const w = this.settings.get().workspace;
    const key = w.apiUrl + '|' + w.token;
    if (key === this.clientKey) return;
    this.clientKey = key;
    this.client = w.apiUrl && w.token
      ? createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: w.apiUrl.replace(/\/$/, '') + '/trpc', headers: () => ({ authorization: 'Bearer ' + w.token }) })] })
      : null;
    this.status = { ...this.status, configured: !!this.client, connected: false, lastError: null };
    this.emit('change', this.status);
  }

  getStatus(): SyncStatus { return this.status; }

  start(): void {
    if (this.timer) return;
    // Push once shortly after launch, then every 15 minutes (and after stop / report send).
    setTimeout(() => void this.pushDay().catch(() => {}), 3000);
    this.timer = setInterval(() => void this.pushDay().catch(() => {}), 15 * 60_000);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** Push today's aggregate. Safe to call often. */
  async pushDay(day = dayKey()): Promise<SyncStatus> {
    if (!this.client) return this.status;
    const s = this.settings.get();
    const entries = this.repo.entriesForDay(day);
    const checkins = this.repo.checkinsForDay(day);
    const sum = this.tracker.summary();
    const report = this.repo.report(day);
    const payload = scrubForSync({
      day,
      user: { name: s.profile.name, initials: s.profile.initials, email: s.profile.email, team: s.workspace.teamName },
      tracking: this.session.get().running,
      trackedSeconds: entries.reduce((a, e) => a + e.seconds, 0) + (day === dayKey() ? this.session.elapsedSeconds() : 0),
      entries: entries.map((e) => ({ id: e.id, task: e.task, ref: e.ref, project: e.project, startTs: e.startTs, seconds: e.seconds, done: e.done, outcome: e.outcome ?? null, blocker: !!e.blocker, size: e.size ?? null, sizeCheck: e.sizeCheck ?? null })),
      checkins: checkins.map((c) => ({ id: c.id, ts: c.ts, kind: c.kind, answer: c.answer })),
      mix: Object.fromEntries(CATEGORIES.map((c) => [c, sum.mix.percent[c]])) as Record<(typeof CATEGORIES)[number], number>,
      focus: sum.mix.focus,
      topApps: this.repo.appNamesForDay(day, 3),
      report: report ? { status: report.status, sentAt: report.sentAt } : null,
      shareFocus: s.policy.shareFocusWithTeam,
    });
    if (process.env.DAILYBEE_LOG_SYNC) this.log('[sync] payload ' + JSON.stringify(payload));
    try {
      await this.client.sync.pushDay.mutate(payload);
      this.status = { ...this.status, connected: true, lastPushAt: Date.now(), lastError: null };
    } catch (e) {
      this.status = { ...this.status, connected: false, lastError: e instanceof Error ? e.message : String(e) };
      this.log('[sync] ' + this.status.lastError);
    }
    this.emit('change', this.status);
    return this.status;
  }

  async team(range: 'day' | 'week' | 'month'): Promise<TeamData> {
    if (this.client) {
      try {
        const data = await this.client.team.overview.query({ range });
        this.status = { ...this.status, connected: true, lastError: null };
        this.emit('change', this.status);
        return { ...data, fetchedAt: Date.now() };
      } catch (e) {
        this.status = { ...this.status, connected: false, lastError: e instanceof Error ? e.message : String(e) };
        this.emit('change', this.status);
      }
    }
    return this.localTeam();
  }

  async admin(range: 'week' | 'month' | 'quarter', team: string): Promise<AdminData> {
    if (this.client) {
      try {
        const data = await this.client.admin.overview.query({ range, team });
        return { ...data, fetchedAt: Date.now() };
      } catch (e) {
        this.status = { ...this.status, connected: false, lastError: e instanceof Error ? e.message : String(e) };
        this.emit('change', this.status);
      }
    }
    return { ...FAKE_ADMIN, fetchedAt: null };
  }

  async nudge(initials: string): Promise<void> {
    if (!this.client) return;
    try { await this.client.team.nudge.mutate({ initials }); } catch (e) { this.log('[sync] nudge: ' + String(e)); }
  }

  /** Fake team with the user's own row replaced by real local totals. */
  private localTeam(): TeamData {
    const s = this.settings.get();
    const now = Date.now();
    const today = this.repo.entriesForDay(dayKey(now)).reduce((a, e) => a + e.seconds, 0) + this.session.elapsedSeconds(now);
    const week = this.repo.entriesBetween(startOfWeek(now), startOfDay(now)).reduce((a, e) => a + e.seconds, 0) + today;
    const report = this.repo.report(dayKey(now));
    const me = { initials: s.profile.initials, name: s.profile.name, today, week, report: (report?.status === 'sent' ? 'Sent' : report ? 'Draft' : 'Missing') as 'Sent' | 'Draft' | 'Missing', tracking: this.session.get().running };
    const members = FAKE_TEAM.members.map((m) => (m.initials === me.initials ? { ...m, ...me } : m));
    return { ...FAKE_TEAM, members, fetchedAt: null };
  }
}
