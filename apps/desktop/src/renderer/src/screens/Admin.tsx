import { Avatar, Badge, Button, CATEGORIES, Card, CategoryBadge, Icon, IconButton, MixBar, Select, Switch, Tabs, Td, Th, Tooltip } from '@dailybee/ui';
import type { AdminData, AdminPerson } from '@shared/team';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { ProjectsPanel } from '../components/ProjectsPanel';
import { useStore } from '../store';
import { ScrollArea, Topbar } from './Shell';

type Range = 'week' | 'month' | 'quarter';
type SortKey = 'focus' | 'week' | 'distraction' | 'reports';
type Tab = 'overview' | 'people' | 'projects' | 'policy';

function Kpi({ label, value, unit, delta, good, range }: { label: string; value: number; unit: string; delta: string; good: boolean; range: Range }) {
  // No movement is neutral, not bad.
  const flat = /^0(\s|%|$)/.test(delta);
  return (
    <Card padding={16}>
      <div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-3xl)', fontWeight: 500, letterSpacing: '-0.02em' }}>{value}</span><span style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{unit}</span></div>
      <div style={{ font: 'var(--type-caption)', color: flat ? 'var(--text-tertiary)' : good ? 'var(--success-text)' : 'var(--danger-text)', marginTop: 6 }}>{flat ? 'No change' : delta} vs {range === 'week' ? 'last week' : range === 'month' ? 'the previous 30 days' : 'the previous 90 days'}</div>
    </Card>
  );
}

const csvCell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('week');
  const [team, setTeam] = useState('All teams');
  const [sel, setSel] = useState<AdminPerson | null>(null);
  const [sort, setSort] = useState<SortKey>('focus');
  const [A, setA] = useState<AdminData | null>(null);
  const showToast = useStore((s) => s.showToast);
  const settings = useStore((s) => s.settings);
  const projects = useStore((s) => s.projects);
  const adminFocus = useStore((s) => s.adminFocus);
  const { updateSettings, openReports, nav } = useStore.getState();
  const lastPush = useStore((s) => s.sync?.lastPushAt ?? null);
  useEffect(() => { let alive = true; void api.team.admin(range, team).then((d) => { if (alive) setA(d); }); return () => { alive = false; }; }, [range, team, lastPush, projects]);
  // Hand-off from Team › Open: select that person on the People tab.
  useEffect(() => {
    if (!A || !adminFocus) return;
    const p = A.people.find((x) => x.initials === adminFocus);
    if (p) { setTab('people'); setSel(p); }
    useStore.setState({ adminFocus: null });
  }, [A, adminFocus]);
  if (!A) return <><Topbar title="Admin" /></>;
  const live = A.fetchedAt !== null;
  const people = [...A.people].filter((p) => team === 'All teams' || p.team === team).sort((a, b) => b[sort] - a[sort]);
  const tone = (k: string) => (k === 'danger' ? 'danger' : k === 'warning' ? 'warning' : 'info');
  // A delta string is "good" when it moves the metric the right way; distraction and the "−1" case are handled by the callers.
  const isGood = (d: string) => d.startsWith('+') || d.startsWith('−1') || d.startsWith('-1');
  const teamName = settings?.workspace.teamName || 'Solo';
  const periodLabel = range === 'week' ? 'this week' : range === 'month' ? 'last 30 days' : 'last 90 days';
  const activeProjects = projects.filter((p) => !p.archived).length;

  const exportCsv = async () => {
    const rows = tab === 'projects'
      ? [['Project', `Hours (${periodLabel})`, 'Budget', 'Tasks', 'Overdue'], ...A.projects.map((p) => [p.name, p.hours, p.budget, p.tasks, p.overdue])]
      : [['Member', 'Team', 'Hours', 'Focus %', 'Distraction %', 'Reports', 'Top apps'], ...people.map((p) => [p.name, p.team, p.week, p.focus, p.distraction, `${p.reports}/5`, p.top])];
    const ok = await api.ui.saveText(`dailybee-${tab === 'projects' ? 'projects' : team === 'All teams' ? 'team' : team.toLowerCase()}-${range}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'));
    showToast(ok ? 'CSV exported' : 'Export cancelled', ok ? 'success' : 'neutral');
  };
  const openAlert = (text: string) => {
    const person = A.people.find((x) => text.includes(x.name));
    if (person) { setTab('people'); setSel(person); return; }
    if (A.projects.some((p) => text.includes(p.name))) { setTab('projects'); return; }
    if (/overdue|re-assessed/i.test(text)) { nav('tasks'); return; }
    if (/report/i.test(text)) { openReports('history'); return; }
    setTab('people');
  };
  const nudge = async (p: AdminPerson) => {
    const r = await api.team.nudge(p.initials);
    showToast(r.ok ? `${r.message} to ${p.name.split(' ')[0]}` : r.message, r.ok ? 'success' : 'warning');
  };
  const setWorkspacePolicy = async (i: number, on: boolean) => {
    const rules = A.policy.map((r, j) => (j === i ? [r[0], on] : r) as [string, boolean]);
    const r = await api.team.setPolicy(rules);
    showToast(r.message, r.ok ? 'success' : 'warning');
    if (r.ok) setA({ ...A, policy: r.policy });
  };

  return (
    <>
      <Topbar title="Admin">
        <Select size="sm" options={A.orgs.length ? ['All teams', ...A.orgs] : [teamName]} value={A.orgs.length ? team : teamName} disabled={!A.orgs.length} onChange={(e) => setTeam(e.target.value)} style={{ width: 150, flexShrink: 0 }} />
        <Tabs size="sm" variant="pill" tabs={(['week', 'month', 'quarter'] as Range[]).map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} value={range} onChange={setRange} />
        <Tooltip content={tab === 'projects' ? 'Export the projects table as CSV' : 'Export the people table as CSV'} side="bottom"><Button variant="secondary" size="sm" icon="download" onClick={() => void exportCsv()}>Export</Button></Tooltip>
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 'var(--content-max)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Tabs tabs={[{ value: 'overview', label: 'Overview' }, { value: 'people', label: 'People', count: A.people.length }, { value: 'projects', label: 'Projects', count: activeProjects }, { value: 'policy', label: 'Policy' }]} value={tab} onChange={setTab} />
          <span style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}><Icon name="lock" size={14} />Manager view · per-tab URLs never leave each device</span>
        </div>
        {tab === 'overview' && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <Kpi label="Focus" value={A.kpis.focus} unit="%" delta={A.deltas.focus} good={isGood(A.deltas.focus)} range={range} />
            <Kpi label="Tracked" value={A.kpis.tracked} unit="h" delta={A.deltas.tracked} good={isGood(A.deltas.tracked)} range={range} />
            <Kpi label="Reports sent" value={A.kpis.reports} unit="%" delta={A.deltas.reports} good={A.deltas.reports.startsWith('+')} range={range} />
            <Kpi label="Distraction" value={A.kpis.distraction} unit="%" delta={A.deltas.distraction} good={!A.deltas.distraction.startsWith('+')} range={range} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
            <Card title={live ? "Where the team's time goes" : 'Where your time goes'} meta={periodLabel}>
              <MixBar mix={CATEGORIES.map((c) => A.categoryMix[c])} height={14} />
              <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                {CATEGORIES.map((c) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12 }}><CategoryBadge cat={c} size="sm" /><span style={{ flex: 1 }} /><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)' }}>{A.categoryMix[c]}%</span><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minWidth: 52, textAlign: 'right' }}>{Math.round((A.kpis.tracked * A.categoryMix[c]) / 10) / 10}h</span></div>
                ))}
              </div>
            </Card>
            <Card title="Needs attention" meta={`${A.alerts.length} item${A.alerts.length === 1 ? '' : 's'}`}>
              <div style={{ display: 'grid', gap: 10 }}>
                {A.alerts.length === 0 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>Nothing needs attention {periodLabel}.</div>}
                {A.alerts.map(([k, t]) => (
                  <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Badge tone={tone(k)} size="sm" dot>{k === 'danger' ? 'Missing' : k === 'warning' ? 'Watch' : 'Info'}</Badge><span style={{ flex: 1, font: 'var(--type-body-sm)' }}>{t}</span><IconButton icon="chevron-right" label="Open" size="sm" onClick={() => openAlert(t)} /></div>
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
                  <div><div style={{ font: 'var(--type-label)', marginBottom: 6 }}>Top apps</div><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{sel.top}</div><div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 4 }}>App names only. Page-level URLs never leave {sel.name.split(' ')[0]}'s device.</div></div>
                  <div><div style={{ font: 'var(--type-label)', marginBottom: 6 }}>Daily reports</div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Badge size="sm" tone={sel.reports === 5 ? 'success' : sel.reports >= 4 ? 'neutral' : 'danger'}>{sel.reports} of 5</Badge><span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>sent this week</span></div></div>
                  <div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="secondary" icon="file-text" onClick={() => openReports('history')}>Open reports</Button>{live && <Button size="sm" variant="secondary" icon="message-square" onClick={() => void nudge(sel)}>Nudge</Button>}</div>
                </div>
              </Card>
            )}
          </div>
        )}
        {tab === 'projects' && <ProjectsPanel stats={A.projects} range={range} periodLabel={periodLabel} />}
        {tab === 'policy' && (
          <Card title="Tracking policy" meta={live ? 'applies to the whole workspace' : 'this device'} padding={20}>
            <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
              {live
                ? A.policy.map(([l, on], i) => <Switch key={l} checked={on} onChange={(v) => void setWorkspacePolicy(i, v)} label={l} />)
                : settings && <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: 'var(--type-body)' }}><Icon name="check-circle-2" size={18} style={{ color: 'var(--success)' }} /><span style={{ flex: 1 }}>Managers see categories and app names, never URLs</span><Badge size="sm" tone="success">Always on</Badge></div>
                  <Switch checked={settings.policy.fullscreenWarning} onChange={(v) => void updateSettings({ policy: { fullscreenWarning: v } })} label={`Full-screen warning after ${settings.policy.warningSeconds} s on a distraction site`} description={`Otherwise a small drift popup after ${settings.policy.driftMinutes} min`} />
                  <Switch checked={settings.policy.halfwayCheckin} onChange={(v) => void updateSettings({ policy: { halfwayCheckin: v } })} label="Halfway check-in on every task with a size" />
                  <Switch checked={settings.policy.autoSend} onChange={(v) => void updateSettings({ policy: { autoSend: v } })} label={`Auto-send the daily report at ${settings.policy.reportTime}`} />
                  <Switch checked={settings.policy.shareFocusWithTeam} onChange={(v) => void updateSettings({ policy: { shareFocusWithTeam: v } })} label="Share individual focus % with the whole team" description="Included in the next sync" />
                </>}
              <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{live ? 'Changes apply to everyone in the workspace; leads and admins can make them.' : 'These switches change this device (the same values as Settings). A connected workspace shows its own policy here.'}</div>
            </div>
          </Card>
        )}
        {!live && <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Your own data. Sign in to a workspace to see the whole team here.</div>}
      </div>
      </ScrollArea>
    </>
  );
}
