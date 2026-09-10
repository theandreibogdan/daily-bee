import { describe, expect, it } from 'vitest';
import { MemoryRepo } from '../db/memory';
import { createCaller } from '../router';

const TODAY = '2026-09-10';

async function lead() {
  process.env.DAILYBEE_EVERYONE_IS_LEAD = '1';
  const repo = new MemoryRepo({ today: TODAY });
  const user = await repo.authenticate('demo-ml');
  return createCaller({ repo, user, today: TODAY });
}

describe('admin.projects', () => {
  it('lists, saves and removes projects, and the overview picks the registry up', async () => {
    const api = await lead();
    expect((await api.admin.projects.list()).map((p) => p.id)).toEqual(['api', 'infra', 'web']);
    const after = await api.admin.projects.save({ id: 'design-system', name: 'design-system', color: 'var(--honey-500)', budgetHours: 12 });
    expect(after.find((p) => p.id === 'design-system')).toMatchObject({ name: 'design-system', budgetHours: 12 });
    const renamed = await api.admin.projects.save({ id: 'design-system', name: 'Design system', color: 'var(--red-500)', budgetHours: 20 });
    expect(renamed.filter((p) => p.id === 'design-system')).toHaveLength(1);
    expect(renamed.find((p) => p.id === 'design-system')?.budgetHours).toBe(20);
    const overview = await api.admin.overview({ range: 'week', team: 'All teams' });
    expect(overview.projects.map((p) => p.name)).toContain('Design system');
    const removed = await api.admin.projects.remove({ id: 'design-system' });
    expect(removed.map((p) => p.id)).toEqual(['api', 'infra', 'web']);
  });

  it('rejects ids that are not slugs and names with URLs', async () => {
    const api = await lead();
    await expect(api.admin.projects.save({ id: 'Bad Id', name: 'x', color: '', budgetHours: 1 })).rejects.toThrow();
    await expect(api.admin.projects.save({ id: 'ok', name: 'see https://x.y', color: '', budgetHours: 1 })).rejects.toThrow();
  });
});
