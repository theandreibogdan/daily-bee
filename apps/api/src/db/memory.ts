import { createHash } from 'node:crypto';
import type { DayPush } from '../schemas';
import { addDays, dayKey, isWeekday } from '../time';
import type { CheckinRec, DayRec, EntryRec, NudgeRec, PolicyRules, ProjectRec, Repo, UserRec, WorkspaceSnapshot } from '../types';

export const DEFAULT_POLICY: PolicyRules = [
  ['Managers see categories and app names, not URLs', true],
  ['Distraction check-ins after 8 min on a distraction site', true],
  ['Halfway check-in on every task with a size', true],
  ['Auto-generate daily report at 18:00', true],
  ['Share individual focus % with the whole team', false],
];

/**
 * In-memory repository for development and tests (no DATABASE_URL). Any bearer token is accepted
 * and maps to a stable user in the demo workspace; the workspace is pre-seeded with the sample
 * team from the design kit so Team/Admin look right before everyone has synced.
 */
export class MemoryRepo implements Repo {
  users = new Map<string, UserRec>();
  tokens = new Map<string, string>();
  days = new Map<string, DayRec>();
  entries = new Map<string, EntryRec>();
  checkins = new Map<string, CheckinRec>();
  nudges: NudgeRec[] = [];
  projectRecs: ProjectRec[] = [];
  policies = new Map<string, PolicyRules>();
  readonly workspaceId = 'ws_demo';

  constructor(opts: { seed?: boolean; today?: string } = {}) {
    if (opts.seed !== false) this.seed(opts.today ?? dayKey());
  }

  async authenticate(token: string): Promise<UserRec | null> {
    if (!token) return null;
    const known = this.tokens.get(token);
    if (known) return this.users.get(known) ?? null;
    const id = 'u_' + createHash('sha256').update(token).digest('hex').slice(0, 12);
    const user: UserRec = { id, workspaceId: this.workspaceId, email: id + '@local', name: 'New member', initials: '··', team: 'Platform', role: 'member' };
    this.users.set(id, user);
    this.tokens.set(token, id);
    return user;
  }

  async updateProfile(user: UserRec, profile: DayPush['user']): Promise<UserRec> {
    // A synced profile replaces a seeded placeholder with the same initials/email.
    for (const [id, u] of this.users) {
      if (id !== user.id && u.workspaceId === user.workspaceId && (u.email === profile.email || (u.seeded && u.initials === profile.initials))) {
        this.users.delete(id);
        for (const [k, d] of this.days) if (d.userId === id) this.days.set(k, { ...d, userId: user.id });
      }
    }
    const next: UserRec = { ...user, name: profile.name, initials: profile.initials, email: profile.email, team: profile.team || user.team };
    this.users.set(user.id, next);
    return next;
  }

  async saveDay(user: UserRec, push: DayPush): Promise<void> {
    this.days.set(user.id + '|' + push.day, {
      userId: user.id, day: push.day, tracking: push.tracking, trackedSeconds: push.trackedSeconds, focus: push.focus, mix: push.mix, topApps: push.topApps,
      reportStatus: push.report?.status ?? null, reportSentAt: push.report?.sentAt ?? null, shareFocus: push.shareFocus, updatedAt: Date.now(),
    });
    for (const [k, e] of this.entries) if (e.userId === user.id && e.day === push.day) this.entries.delete(k);
    for (const e of push.entries) this.entries.set(user.id + '|' + e.id, { ...e, userId: user.id, day: push.day });
    for (const [k, c] of this.checkins) if (c.userId === user.id && c.day === push.day) this.checkins.delete(k);
    for (const c of push.checkins) this.checkins.set(user.id + '|' + c.id, { ...c, userId: user.id, day: push.day });
  }

  async snapshot(workspaceId: string, fromDay: string, toDay: string): Promise<WorkspaceSnapshot> {
    const users = [...this.users.values()].filter((u) => u.workspaceId === workspaceId);
    const ids = new Set(users.map((u) => u.id));
    const inRange = (d: string) => d >= fromDay && d <= toDay;
    return {
      users,
      days: [...this.days.values()].filter((d) => ids.has(d.userId) && inRange(d.day)),
      entries: [...this.entries.values()].filter((e) => ids.has(e.userId) && inRange(e.day)),
      checkins: [...this.checkins.values()].filter((c) => ids.has(c.userId) && inRange(c.day)),
      projects: this.projectRecs.filter((p) => p.workspaceId === workspaceId),
      policy: this.policies.get(workspaceId) ?? DEFAULT_POLICY,
    };
  }

  async addNudge(from: UserRec, toInitials: string): Promise<void> {
    this.nudges.push({ id: this.nudges.length + 1, workspaceId: from.workspaceId, fromUserId: from.id, toInitials, createdAt: Date.now() });
  }

  async setPolicy(workspaceId: string, rules: PolicyRules): Promise<PolicyRules> {
    this.policies.set(workspaceId, rules);
    return rules;
  }

  async projects(workspaceId: string): Promise<ProjectRec[]> {
    return this.projectRecs.filter((p) => p.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveProject(workspaceId: string, project: Omit<ProjectRec, 'workspaceId'>): Promise<ProjectRec[]> {
    const rec: ProjectRec = { ...project, workspaceId };
    const i = this.projectRecs.findIndex((p) => p.workspaceId === workspaceId && p.id === project.id);
    if (i >= 0) this.projectRecs[i] = rec; else this.projectRecs.push(rec);
    return this.projects(workspaceId);
  }

  async removeProject(workspaceId: string, id: string): Promise<ProjectRec[]> {
    this.projectRecs = this.projectRecs.filter((p) => !(p.workspaceId === workspaceId && p.id === id));
    return this.projects(workspaceId);
  }

  async close(): Promise<void> { /* nothing to release */ }

  /** Sample team (design kit data.js) with plausible history for the last three weeks. */
  private seed(today: string): void {
    const members: Array<[string, string, string, number, number[], string[]]> = [
      ['ML', 'Mara Lindqvist', 'Platform', 33.75, [68, 12, 5, 11, 4], ['VS Code', 'GitHub']],
      ['JK', 'Jonas Kaur', 'Engineering', 37.3, [61, 14, 8, 12, 5], ['VS Code', 'Linear']],
      ['SO', 'Sena Okafor', 'Product', 30.0, [45, 18, 6, 22, 9], ['Figma', 'Slack']],
      ['RA', 'Rui Almeida', 'Platform', 26.75, [70, 10, 4, 13, 3], ['Terminal', 'Grafana']],
      ['TN', 'Tomas Novak', 'Engineering', 35.5, [66, 9, 9, 9, 7], ['IntelliJ', 'GitHub']],
      ['PB', 'Priya Bhatt', 'Product', 24.5, [40, 20, 10, 18, 12], ['Notion', 'Zoom']],
    ];
    const todayHours: Record<string, number> = { ML: 5.5, JK: 7, SO: 4, RA: 0, TN: 6, PB: 2.5 };
    const todayReport: Record<string, 'draft' | 'sent' | null> = { ML: 'draft', JK: 'sent', SO: 'sent', RA: null, TN: 'sent', PB: 'draft' };
    const trackingNow = new Set(['ML', 'JK', 'TN']);
    members.forEach(([initials, name, team, weekHours, mix, apps], i) => {
      const id = 'u_seed_' + initials.toLowerCase();
      this.users.set(id, { id, workspaceId: this.workspaceId, email: name.toLowerCase().replace(' ', '.') + '@dailybee.dev', name, initials, team, role: i === 0 ? 'lead' : 'member', seeded: true });
      this.tokens.set('demo-' + initials.toLowerCase(), id);
      for (let back = 21; back >= 0; back--) {
        const day = addDays(today, -back);
        if (!isWeekday(day)) continue;
        const isToday = day === today;
        const hours = isToday ? todayHours[initials]! : Math.max(0, weekHours / 5 + ((i * 7 + back * 3) % 5) * 0.25 - 0.5);
        if (!hours && !isToday) continue;
        const missing = initials === 'RA' && back <= 2;
        const m = { work: mix[0]!, research: mix[1]!, learning: mix[2]!, communication: mix[3]!, distraction: mix[4]! };
        this.days.set(id + '|' + day, { userId: id, day, tracking: isToday && trackingNow.has(initials), trackedSeconds: Math.round(hours * 3600), focus: m.work + m.research + m.learning, mix: m, topApps: apps, reportStatus: isToday ? todayReport[initials]! : missing ? null : 'sent', reportSentAt: null, shareFocus: false, updatedAt: Date.now() });
      }
    });
    this.projectRecs = [
      { workspaceId: this.workspaceId, id: 'api', name: 'api-gateway', color: 'var(--blue-500)', budgetHours: 80 },
      { workspaceId: this.workspaceId, id: 'web', name: 'web-app', color: 'var(--green-500)', budgetHours: 70 },
      { workspaceId: this.workspaceId, id: 'infra', name: 'infra', color: 'var(--orange-500)', budgetHours: 60 },
    ];
    const seedEntries: Array<[string, string, string, number, boolean, boolean]> = [
      ['u_seed_ml', 'Timer sync across devices', 'api', 5460, false, false], ['u_seed_ml', 'Review: rate limiter PR', 'api', 2700, true, false], ['u_seed_jk', 'Daily report template polish', 'web', 3900, true, false],
      ['u_seed_ra', 'Postgres connection pooling', 'infra', 7200, false, true], ['u_seed_so', 'Onboarding: invite teammates flow', 'web', 9000, false, false], ['u_seed_tn', 'Rate limiter rollout', 'api', 6000, true, false],
    ];
    seedEntries.forEach(([userId, task, project, seconds, done, blocker], i) => {
      this.entries.set(userId + '|seed' + i, { id: 'seed' + i, userId, day: today, task, ref: null, project, startTs: Date.now() - seconds * 1000, seconds, done, outcome: done ? 'Done' : null, blocker, size: 'Medium', sizeCheck: i % 3 === 0 ? 'Large' : 'Medium' });
    });
    this.policies.set(this.workspaceId, DEFAULT_POLICY);
  }
}

declare module '../types' {
  interface UserRec { seeded?: boolean }
}
