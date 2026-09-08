import { Avatar, Badge, Button, CATEGORIES, Card, CategoryBadge, Icon, IconButton, MixBar, Select, Tabs, Td, Th, Tooltip } from '@dailybee/ui';
import type { AdminData, AdminPerson } from '@shared/team';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';
import { ScrollArea, Topbar } from './Shell';

type Range = 'week' | 'month' | 'quarter';
type SortKey = 'focus' | 'week' | 'distraction' | 'reports';

function Kpi({ label, value, unit, delta, good }: { label: string; value: number; unit: string; delta: string; good: boolean }) {
  return (
    <Card padding={16}>
      <div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-3xl)', fontWeight: 500, letterSpacing: '-0.02em' }}>{value}</span><span style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{unit}</span></div>
      <div style={{ font: 'var(--type-caption)', color: good ? 'var(--success-text)' : 'var(--danger-text)', marginTop: 6 }}>{delta} vs last week</div>
    </Card>
  );
}

export function AdminScreen() {
  const [tab, setTab] = useState<'overview' | 'people' | 'projects' | 'policy'>('overview');
  const [range, setRange] = useState<Range>('week');
  const [team, setTeam] = useState('All teams');
  const [sel, setSel] = useState<AdminPerson | null>(null);
  const [sort, setSort] = useState<SortKey>('focus');
  const [A, setA] = useState<AdminData | null>(null);
  const showToast = useStore((s) => s.showToast);
  const lastPush = useStore((s) => s.sync?.lastPushAt ?? null);
  useEffect(() => { let alive = true; void api.team.admin(range, team).then((d) => { if (alive) setA(d); }); return () => { alive = false; }; }, [range, team, lastPush]);
  if (!A) return <><Topbar title="Admin" /></>;
  const people = [...A.people].filter((p) => team === 'All teams' || p.team === team).sort((a, b) => b[sort] - a[sort]);
  const tone = (k: string) => (k === 'danger' ? 'danger' : k === 'warning' ? 'warning' : 'info');
  const isGood = (d: string) => d.startsWith('+') || d.startsWith('−1') || d.startsWith('-1');
  return (
    <>
      <Topbar title="Admin">
        <Select size="sm" options={['All teams', ...A.orgs]} value={team} onChange={(e) => setTeam(e.target.value)} style={{ width: 150, flexShrink: 0 }} />
        <Tabs size="sm" variant="pill" tabs={(['week', 'month', 'quarter'] as Range[]).map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} value={range} onChange={setRange} />
        <Button variant="secondary" size="sm" icon="download" onClick={() => showToast('Export queued · CSV to your email')}>Export</Button>
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 'var(--content-max)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Tabs tabs={[{ value: 'overview', label: 'Overview' }, { value: 'people', label: 'People', count: A.people.length }, { value: 'projects', label: 'Projects', count: A.projects.length }, { value: 'policy', label: 'Policy' }]} value={tab} onChange={setTab} />
          <span style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}><Icon name="lock" size={14} />Manager view · per-tab URLs hidden by policy</span>
        </div>
        {tab === 'overview' && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <Kpi label="Focus" value={A.kpis.focus} unit="%" delta={A.deltas.focus} good={isGood(A.deltas.focus)} />
            <Kpi label="Tracked" value={A.kpis.tracked} unit="h" delta={A.deltas.tracked} good={isGood(A.deltas.tracked)} />
            <Kpi label="Reports sent" value={A.kpis.reports} unit="%" delta={A.deltas.reports} good={A.deltas.reports.startsWith('+')} />
            <Kpi label="Distraction" value={A.kpis.distraction} unit="%" delta={A.deltas.distraction} good={!A.deltas.distraction.startsWith('+')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
            <Card title="Where the team's time goes" meta="this week">
              <MixBar mix={CATEGORIES.map((c) => A.categoryMix[c])} height={14} />
              <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                {CATEGORIES.map((c) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12 }}><CategoryBadge cat={c} size="sm" /><span style={{ flex: 1 }} /><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)' }}>{A.categoryMix[c]}%</span><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minWidth: 52, textAlign: 'right' }}>{Math.round((A.kpis.tracked * A.categoryMix[c]) / 100)}h</span></div>
                ))}
              </div>
            </Card>
            <Card title="Needs attention" meta={`${A.alerts.length} items`}>
              <div style={{ display: 'grid', gap: 10 }}>
                {A.alerts.map(([k, t]) => (
                  <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Badge tone={tone(k)} size="sm" dot>{k === 'danger' ? 'Missing' : k === 'warning' ? 'Watch' : 'Info'}</Badge><span style={{ flex: 1, font: 'var(--type-body-sm)' }}>{t}</span><IconButton icon="chevron-right" label="Open" size="sm" onClick={() => setTab('people')} /></div>
                ))}
              </div>
            </Card>
          </div>
          <Card title="Focus by person" meta="work + research + learning share" padding={16}>
            <div style={{ display: 'grid', gap: 10 }}>
              {people.map((p) => (
                <div key={p.initials} onClick={() => { setTab('people'); setSel(p); }} style={{ display: 'grid', gridTemplateColumns: '180px minmax(0,1fr) 60px', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar initials={p.initials} size={24} /><span style={{ font: 'var(--type-label)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span></div>
                  <MixBar mix={p.mix} />
                  <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', textAlign: 'right', color: p.focus < 60 ? 'var(--danger-text)' : 'inherit' }}>{p.focus}%</span>
                </div>
              ))}
            </div>
          </Card>
        </>}
        {tab === 'people' && (
          <div style={{ display: 'grid', gridTemplateColumns: sel ? 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))' : '1fr', gap: 24, alignItems: 'start' }}>
            <Card title="People" meta={String(people.length)} padding={0} actions={<Select size="sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} options={[{ value: 'focus', label: 'Sort: focus' }, { value: 'week', label: 'Sort: hours' }, { value: 'distraction', label: 'Sort: distraction' }, { value: 'reports', label: 'Sort: reports' }]} style={{ width: 160 }} />}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                  <thead><tr><Th>Member</Th><Th>Team</Th><Th right>Hours</Th><Th right>Focus</Th><Th right>Distraction</Th><Th>Reports</Th><Th>Mix</Th></tr></thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.initials} onClick={() => setSel(p)} style={{ cursor: 'pointer', background: sel && sel.initials === p.initials ? 'var(--surface-accent-soft)' : 'transparent' }}>
                        <Td><div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}><Avatar initials={p.initials} /><span style={{ font: 'var(--type-label)' }}>{p.name}</span></div></Td>
                        <Td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.team}</Td>
                        <Td right mono>{p.week}h</Td>
                        <Td right mono style={{ color: p.focus < 60 ? 'var(--danger-text)' : 'inherit' }}>{p.focus}%</Td>
                        <Td right mono style={{ color: p.distraction > 8 ? 'var(--danger-text)' : 'inherit' }}>{p.distraction}%</Td>
                        <Td><Badge size="sm" tone={p.reports === 5 ? 'success' : p.reports >= 4 ? 'neutral' : 'danger'}>{p.reports}/5</Badge></Td>
                        <Td><div style={{ width: 120 }}><MixBar mix={p.mix} height={6} /></div></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {sel && (
              <Card title={sel.name} meta={sel.team} actions={<IconButton icon="x" label="Close" size="sm" onClick={() => setSel(null)} />}>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {([['Hours', sel.week + 'h'], ['Focus', sel.focus + '%'], ['Reports', sel.reports + '/5']] as Array<[string, string]>).map(([k, v]) => <div key={k} style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}><div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{k}</div><div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xl)', fontWeight: 500 }}>{v}</div></div>)}
                  </div>
                  <div><div style={{ font: 'var(--type-label)', marginBottom: 8 }}>Category mix</div><MixBar mix={sel.mix} height={12} /><div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>{CATEGORIES.map((c, i) => <Tooltip key={c} content={sel.mix[i] + '%'}><CategoryBadge cat={c} size="sm" /></Tooltip>)}</div></div>
                  <div><div style={{ font: 'var(--type-label)', marginBottom: 6 }}>Top apps</div><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{sel.top}</div><div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 4 }}>Page-level URLs are visible only to {sel.name.split(' ')[0]} (policy: aggregate only)</div></div>
                  <div><div style={{ font: 'var(--type-label)', marginBottom: 8 }}>Daily reports</div><div style={{ display: 'flex', gap: 4 }}>{['M', 'T', 'W', 'T', 'F'].map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center' }}><div style={{ height: 24, borderRadius: 'var(--radius-xs)', background: i < sel.reports ? 'var(--success)' : 'var(--danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: i < sel.reports ? '#fff' : 'var(--danger-text)' }}><Icon name={i < sel.reports ? 'check' : 'x'} size={12} /></div><div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 4 }}>{d}</div></div>)}</div></div>
                  <div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="secondary" icon="file-text">Open reports</Button><Button size="sm" variant="secondary" icon="message-square" onClick={() => { void api.team.nudge(sel.initials); showToast('Nudge sent to ' + sel.name.split(' ')[0]); }}>Nudge</Button></div>
                </div>
              </Card>
            )}
          </div>
        )}
        {tab === 'projects' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {A.projects.map((p) => (
              <Card key={p.name} title={p.name} actions={p.overdue ? <Badge tone="danger" size="sm">{p.overdue} overdue</Badge> : <Badge tone="success" size="sm">On track</Badge>}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} /><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-2xl)', fontWeight: 500 }}>{p.hours}h</span><span style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>of {p.budget}h budget</span></div>
                <div style={{ height: 8, background: 'var(--hive-100)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: Math.min(100, (p.hours / p.budget) * 100) + '%', height: '100%', background: p.hours > p.budget ? 'var(--danger)' : 'var(--honey-500)' }} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 8 }}><span>{p.tasks} tasks</span><span>{Math.round((p.hours / p.budget) * 100)}% used</span></div>
              </Card>
            ))}
          </div>
        )}
        {tab === 'policy' && (
          <Card title="Tracking policy" meta="applies to all teams" padding={20}>
            <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
              {A.policy.map(([l, on]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12, font: 'var(--type-body)' }}><Icon name={on ? 'check-circle-2' : 'circle'} size={18} style={{ color: on ? 'var(--success)' : 'var(--text-tertiary)' }} /><span style={{ flex: 1 }}>{l}</span><Badge size="sm" tone={on ? 'success' : 'neutral'}>{on ? 'On' : 'Off'}</Badge></div>
              ))}
              <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Policy changes notify everyone in the workspace.</div>
            </div>
          </Card>
        )}
        {A.fetchedAt === null && <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Sample workspace. Add a workspace in Settings to see your real team.</div>}
      </div>
      </ScrollArea>
    </>
  );
}
