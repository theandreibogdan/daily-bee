import { Tabs } from '@dailybee/ui';
import type { AdminData } from '@shared/team';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { ProjectsPanel } from '../components/ProjectsPanel';
import { useStore } from '../store';
import { ScrollArea, Topbar } from './Shell';

type Range = 'week' | 'month' | 'quarter';

/** Solo use: the project registry with your own usage against budgets (Team use keeps this under Admin). */
export function ProjectsScreen() {
  const [range, setRange] = useState<Range>('week');
  const [data, setData] = useState<AdminData | null>(null);
  const projects = useStore((s) => s.projects);
  const entries = useStore((s) => s.entries);
  useEffect(() => { let alive = true; void api.team.admin(range, 'All teams').then((d) => { if (alive) setData(d); }); return () => { alive = false; }; }, [range, projects, entries]);
  const periodLabel = range === 'week' ? 'this week' : range === 'month' ? 'last 30 days' : 'last 90 days';
  return (
    <>
      <Topbar title="Projects">
        <Tabs size="sm" variant="pill" tabs={(['week', 'month', 'quarter'] as Range[]).map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} value={range} onChange={setRange} />
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 'var(--content-max)' }}>
        <ProjectsPanel stats={data?.projects ?? []} range={range} periodLabel={periodLabel} />
      </div>
      </ScrollArea>
    </>
  );
}
