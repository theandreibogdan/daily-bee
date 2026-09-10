import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, newInviteCode, verifyPassword } from '../auth';
import { MemoryRepo } from '../db/memory';
import { createCaller } from '../router';

const TODAY = '2026-09-10';

describe('password hashing', () => {
  it('verifies the right password only and never stores it in clear', () => {
    const h = hashPassword('correct horse');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(h).not.toContain('correct horse');
    expect(verifyPassword('correct horse', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
    expect(verifyPassword('x', null)).toBe(false);
    expect(newInviteCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

describe('auth router', () => {
  let repo: MemoryRepo;
  beforeEach(() => { delete process.env.DAILYBEE_EVERYONE_IS_LEAD; repo = new MemoryRepo({ today: TODAY }); });
  const anon = () => createCaller({ repo, user: null, today: TODAY });
  const as = async (token: string) => createCaller({ repo, user: await repo.authenticate(token), today: TODAY });

  it('creates a workspace with an admin, lets a member join with the code, and signs both in', async () => {
    const created = await anon().auth.createWorkspace({ workspaceName: 'Acme', name: 'Ada Lovelace', email: 'ADA@acme.test', password: 'secret1' });
    expect(created.user).toMatchObject({ name: 'Ada Lovelace', initials: 'AL', role: 'admin', email: 'ada@acme.test' });
    expect(created.workspace.inviteCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(created.token).toBeTruthy();
    // The admin's token works on lead-only procedures.
    const admin = await as(created.token!);
    expect((await admin.auth.me()).user.role).toBe('admin');
    expect((await admin.admin.projects.list()).length).toBe(0);
    // A teammate joins with the code and is a plain member: no admin procedures.
    const joined = await anon().auth.join({ inviteCode: created.workspace.inviteCode!.toLowerCase(), name: 'Bob Byte', email: 'bob@acme.test', password: 'secret2' });
    expect(joined.user.role).toBe('member');
    expect(joined.workspace.id).toBe(created.workspace.id);
    const member = await as(joined.token!);
    await expect(member.admin.projects.list()).rejects.toThrow(/Lead or admin/);
    // Sign in later with email + password; wrong password is refused.
    const login = await anon().auth.login({ email: 'ada@acme.test', password: 'secret1' });
    expect(login.user.role).toBe('admin');
    expect(login.token).not.toBe(created.token);
    await expect(anon().auth.login({ email: 'ada@acme.test', password: 'nope' })).rejects.toThrow(/Wrong email or password/);
    await expect(anon().auth.join({ inviteCode: 'ZZZZ-ZZZZ', name: 'X', email: 'x@acme.test', password: 'secret3' })).rejects.toThrow(/join code/);
    await expect(anon().auth.createWorkspace({ workspaceName: 'Again', name: 'Ada', email: 'ada@acme.test', password: 'secret1' })).rejects.toThrow(/already exists/);
  });

  it('keeps sync working with the issued token', async () => {
    const created = await anon().auth.createWorkspace({ workspaceName: 'Acme', name: 'Ada Lovelace', email: 'ada@acme.test', password: 'secret1' });
    const admin = await as(created.token!);
    const r = await admin.sync.pushDay({
      day: TODAY, user: { name: 'Ada Lovelace', initials: 'AL', email: 'ada@acme.test', team: 'Acme' }, tracking: true, trackedSeconds: 600,
      entries: [], checkins: [], mix: { work: 100, research: 0, learning: 0, communication: 0, distraction: 0 }, focus: 100, topApps: ['VS Code'], report: null, shareFocus: false,
    });
    expect(r.ok).toBe(true);
    const team = await admin.team.overview({ range: 'week' });
    expect(team.members.map((m) => m.initials)).toContain('AL');
  });
});

describe('tokens and member access', () => {
  const TODAY2 = '2026-09-10';
  it('rejects tokens the server never issued, keeps the demo tokens, and lets a member read the project registry', async () => {
    const repo = new MemoryRepo({ today: TODAY2 });
    const anon = createCaller({ repo, user: null, today: TODAY2 });
    const as = async (token: string) => createCaller({ repo, user: await repo.authenticate(token), today: TODAY2 });
    expect(await repo.authenticate('made-up-token')).toBeNull();
    await expect((await as('made-up-token')).auth.me()).rejects.toThrow(/UNAUTHORIZED|invalid token/i);
    expect((await repo.authenticate('demo-ml'))?.initials).toBe('ML');
    const created = await anon.auth.createWorkspace({ workspaceName: 'Beta', name: 'Cara Ng', email: 'cara@beta.test', password: 'secret1' });
    const admin = await as(created.token!);
    await admin.admin.projects.save({ id: 'shared', name: 'Shared', color: 'var(--blue-500)', budgetHours: 20 });
    const joined = await anon.auth.join({ inviteCode: created.workspace.inviteCode!, name: 'Dan Ito', email: 'dan@beta.test', password: 'secret2' });
    const member = await as(joined.token!);
    expect((await member.sync.projects()).map((p) => p.name)).toEqual(['Shared']);
    // A member who joined today is not flagged for missing reports.
    await member.sync.pushDay({ day: TODAY2, user: { name: 'Dan Ito', initials: 'DI', email: 'dan@beta.test', team: 'Beta' }, tracking: false, trackedSeconds: 300, entries: [], checkins: [], mix: { work: 100, research: 0, learning: 0, communication: 0, distraction: 0 }, focus: 100, topApps: [], report: null, shareFocus: false });
    const overview = await admin.admin.overview({ range: 'week', team: 'All teams' });
    expect(overview.alerts.map((a) => a[1]).join(' ')).not.toMatch(/has not sent a report/);
  });
});
