import { EventEmitter } from 'node:events';
import { createTRPCClient, httpBatchLink, type TRPCClient } from '@trpc/client';
import { CATEGORIES } from '@dailybee/tracker';
import type { AppRouter } from '@dailybee/api/router';
import type { AdminData, TeamData } from '../../shared/team';
import type { Project, SyncStatus } from '../../shared/types';
import { dayKey, startOfDay, startOfWeek } from '../../shared/time';
import { FAKE_TEAM } from '../fakeTeam';
import { addDaysKey, buildLocalAdmin, rangeBounds, type LocalDay } from './admin';
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
    // A sign-in through the wizard pushes today right away instead of waiting for the 15-minute tick.
    settings.on('change', () => { const had = !!this.client; this.refreshClient(); if (!had && this.client) setTimeout(() => void this.pushDay().catch(() => {}), 1000); });
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
      // Every push also refreshes the workspace's project list, so members pick up projects the admin adds.
      await this.pullProjects().catch(() => {});
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

  /** The workspace's admin view when connected; otherwise the same figures computed from this device's own data. */
  async admin(range: 'week' | 'month' | 'quarter', team: string): Promise<AdminData> {
    if (this.client) {
      try {
        const data = await this.client.admin.overview.query({ range, team });
        await this.pullProjects();
        return { ...data, fetchedAt: Date.now() };
      } catch (e) {
        this.status = { ...this.status, connected: false, lastError: e instanceof Error ? e.message : String(e) };
        this.emit('change', this.status);
      }
    }
    return this.localAdmin(range);
  }

  /** Own days (digests + entries + reports), tasks and projects, aggregated like the API does for a team. */
  localAdmin(range: 'week' | 'month' | 'quarter', now = Date.now()): AdminData {
    const today = dayKey(now);
    const { from, prevFrom } = rangeBounds(today, range);
    const s = this.settings.get();
    const days: LocalDay[] = [];
    const entries = [];
    for (let d = prevFrom; d <= today; d = addDaysKey(d, 1)) {
      const dayEntries = this.repo.entriesForDay(d);
      if (d >= from) entries.push(...dayEntries);
      const digest = this.tracker.summaryForDay(d);
      const tracked = dayEntries.reduce((a, e) => a + e.seconds, 0) + (d === today ? this.session.elapsedSeconds(now) : 0);
      if (!tracked && digest.source === 'none' && !this.repo.report(d)) continue;
      days.push({ day: d, trackedSeconds: tracked, mixSeconds: digest.mix.seconds, topApps: this.tracker.topAppsForDay(d), reportStatus: this.repo.report(d)?.status ?? null });
    }
    const p = s.policy;
    return buildLocalAdmin({
      today, range, days, entries, tasks: this.repo.tasks(), projects: this.repo.projects(),
      me: { name: s.profile.name, initials: s.profile.initials, team: s.workspace.teamName },
      policy: [
        ['Managers see categories and app names, never URLs', true],
        [p.fullscreenWarning ? `Full-screen warning after ${p.warningSeconds} s on a distraction site` : `Drift check-in after ${p.driftMinutes} min on a distraction site`, true],
        ['Halfway check-in on every task with a size', p.halfwayCheckin],
        [`Auto-send the daily report at ${p.reportTime}`, p.autoSend],
        ['Share individual focus % with the whole team', p.shareFocusWithTeam],
      ],
    });
  }

  /** Leads change the workspace policy through the API; local switches cover the solo case. */
  async setPolicy(rules: Array<[string, boolean]>): Promise<{ ok: boolean; message: string; policy: Array<[string, boolean]> }> {
    if (!this.client) return { ok: false, message: 'Connect a workspace in Settings to manage its policy', policy: rules };
    try {
      const policy = await this.client.admin.policy.set.mutate({ rules });
      return { ok: true, message: 'Workspace policy updated', policy };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log('[sync] policy: ' + message);
      return { ok: false, message: 'Policy not saved — ' + message, policy: rules };
    }
  }

  /** Mirror a project change to the workspace; returns a message when that part failed (the local save always happens). */
  async pushProject(p: Project, remove = false): Promise<string | null> {
    if (!this.client) return null;
    try {
      if (remove) await this.client.admin.projects.remove.mutate({ id: p.id });
      else await this.client.admin.projects.save.mutate({ id: p.id, name: p.name, color: p.color, budgetHours: p.budgetHours });
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log('[sync] project: ' + message);
      return `Saved on this device; the workspace was not updated — ${message}`;
    }
  }

  /** The workspace's registry wins for names, colours and budgets; local-only projects are kept. */
  private async pullProjects(): Promise<void> {
    if (!this.client) return;
    try {
      const remote = await this.client.sync.projects.query();
      const local = this.repo.projects();
      const merged: Project[] = local.map((p) => { const r = remote.find((x) => x.id === p.id); return r ? { ...p, name: r.name, color: r.color, budgetHours: r.budgetHours } : p; });
      for (const r of remote) if (!merged.some((p) => p.id === r.id)) merged.push({ id: r.id, name: r.name, color: r.color, budgetHours: r.budgetHours });
      if (JSON.stringify(merged) !== JSON.stringify(local)) { this.repo.saveProjects(merged); this.emit('projects', merged); }
    } catch (e) {
      this.log('[sync] projects: ' + String(e));
    }
  }

  async nudge(initials: string): Promise<{ ok: boolean; message: string }> {
    if (!this.client) return { ok: false, message: 'Connect a workspace in Settings to nudge teammates' };
    try {
      await this.client.team.nudge.mutate({ initials });
      return { ok: true, message: 'Nudge sent' };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log('[sync] nudge: ' + message);
      return { ok: false, message: 'Nudge failed — ' + message };
    }
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
