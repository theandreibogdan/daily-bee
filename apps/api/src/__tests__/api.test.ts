import { describe, expect, it } from 'vitest';
import { MemoryRepo } from '../db/memory';
import { createCaller } from '../router';
import { DayPush } from '../schemas';

const TODAY = '2026-09-07';

async function caller(repo = new MemoryRepo({ today: TODAY }), token = 'demo-ml') {
  process.env.DAILYBEE_EVERYONE_IS_LEAD = '1';
  const user = await repo.authenticate(token);
  return { repo, user, api: createCaller({ repo, user, today: TODAY }) };
}

const push = () => DayPush.parse({
  day: TODAY,
  user: { name: 'Mara Lindqvist', initials: 'ML', email: 'mara.lindqvist@dailybee.dev', team: 'Platform' },
  tracking: true, trackedSeconds: 19860,
  entries: [{ id: 'e1', task: 'Timer sync across devices', ref: 'DB-1042', project: 'api', startTs: 1, seconds: 5460, done: false, outcome: null, blocker: false, size: 'Large', sizeCheck: 'Large' }],
  checkins: [{ id: 'c1', ts: 2, kind: 'drift', answer: 'break' }],
  mix: { work: 62, research: 12, learning: 7, communication: 13, distraction: 6 }, focus: 81,
  topApps: ['VS Code', 'GitHub'], report: { status: 'draft', sentAt: null }, shareFocus: false,
});

describe('privacy contract', () => {
  it('rejects unknown keys such as url/title/tabs', () => {
    expect(() => DayPush.parse({ ...push(), url: 'https://x' })).toThrow();
    const bad = push();
    (bad.entries[0] as Record<string, unknown>).url = 'https://github.com/x';
    expect(() => DayPush.parse(bad)).toThrow();
    expect(() => DayPush.parse({ ...push(), topApps: ['github.com/dailybee/api'] })).not.toThrow();
    expect(() => DayPush.parse({ ...push(), topApps: ['https://github.com/dailybee/api'] })).toThrow();
  });
  it('rejects URL-shaped free text', () => {
    expect(() => DayPush.parse({ ...push(), entries: [{ ...push().entries[0]!, task: 'see www.youtube.com/watch' }] })).toThrow();
  });
});

describe('router', () => {
  it('requires a token', async () => {
    const { api } = await caller(new MemoryRepo({ today: TODAY }), '');
    await expect(api.team.overview({ range: 'week' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('pushes a day and reflects it in team + admin views', async () => {
    const { api } = await caller();
    await api.sync.pushDay(push());
    const team = await api.team.overview({ range: 'week' });
    const me = team.members.find((m) => m.initials === 'ML')!;
    expect(me.today).toBe(19860);
    expect(me.report).toBe('Draft');
    expect(me.tracking).toBe(true);
    expect(team.members.length).toBe(6);
    expect(team.hoursByDay.length).toBe(7);
    const admin = await api.admin.overview({ range: 'week', team: 'All teams' });
    expect(admin.people.find((p) => p.initials === 'ML')?.top).toContain('VS Code');
    expect(admin.kpis.focus).toBeGreaterThan(0);
    expect(Object.values(admin.categoryMix).reduce((a, b) => a + b, 0)).toBe(100);
    expect(admin.policy.length).toBe(5);
    expect(admin.orgs).toEqual(['Engineering', 'Platform', 'Product']);
  });
  it('never returns URLs to managers', async () => {
    const { api } = await caller();
    await api.sync.pushDay(push());
    const json = JSON.stringify(await api.admin.overview({ range: 'week', team: 'All teams' })) + JSON.stringify(await api.team.overview({ range: 'day' }));
    expect(json).not.toMatch(/https?:\/\//);
    expect(json).not.toMatch(/"url"/);
  });
});
