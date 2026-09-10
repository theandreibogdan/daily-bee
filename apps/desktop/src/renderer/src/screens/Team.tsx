import { Badge, Button, Card, IconButton, Tabs, Td, Th, Timer, formatDuration } from '@dailybee/ui';
import { PersonAvatar } from '../components/PersonAvatar';
import type { TeamData } from '@shared/team';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';
import { describeServer } from '../cloud';
import { ScrollArea, Topbar } from './Shell';

type Range = 'day' | 'week' | 'month';
/** Tallest bar in the Hours-by-day chart, in px. */
const BAR_MAX = 88;

export function TeamScreen() {
  const [range, setRange] = useState<Range>('week');
  const [data, setData] = useState<TeamData | null>(null);
  const showToast = useStore((s) => s.showToast);
  const workspace = useStore((s) => s.settings?.workspace);
  const account = useStore((s) => s.account);
  const { focusAdmin, nav } = useStore.getState();
  const lastPush = useStore((s) => s.sync?.lastPushAt ?? null);
  // Teammates join with the workspace's code from the first-run wizard (Team use → Team member → Join with a code).
  const invite = () => {
    const ws = account?.workspace;
    if (!ws?.apiUrl) { showToast('Sign in to a workspace first (Settings › Account)', 'warning'); nav('settings'); return; }
    const code = ws.inviteCode ? `Join code: ${ws.inviteCode}\n` : '';
    void api.ui.copyText(`Join the ${ws.name || workspace?.teamName || 'DailyBee'} workspace on DailyBee\nServer: ${describeServer(ws.apiUrl)}\n${code}In DailyBee: Team use → Team member → ${ws.inviteCode ? 'Join with a code' : 'Sign in'}.`);
    showToast(ws.inviteCode ? `Join code ${ws.inviteCode} copied with the server address` : 'Workspace details copied');
  };
  useEffect(() => { let alive = true; void api.team.data(range).then((d) => { if (alive) setData(d); }); return () => { alive = false; }; }, [range, lastPush]);
  const t = data?.members ?? [];
  const today = t.reduce((a, m) => a + m.today, 0), week = t.reduce((a, m) => a + m.week, 0);
  const tone = (r: string) => (r === 'Sent' ? 'success' : r === 'Draft' ? 'neutral' : 'danger');
  const goal = data?.goalHours ?? 40;
  const hours = data?.hoursByDay ?? [0, 0, 0, 0, 0, 0, 0];
  const maxH = Math.max(goal * 1.2, ...hours);
  const drafts = t.filter((m) => m.report === 'Draft').length, missing = t.filter((m) => m.report === 'Missing').length;
  return (
    <>
      <Topbar title="Team">
        <Tabs size="sm" variant="pill" tabs={(['day', 'week', 'month'] as Range[]).map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} value={range} onChange={setRange} />
        <Button variant="secondary" size="sm" icon="user-plus" onClick={invite}>Invite</Button>
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 'var(--content-max)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <Card title="Tracking now">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-3xl)', fontWeight: 500 }}>{t.filter((m) => m.tracking).length}</span><span style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>of {t.length}</span></div>
            <div style={{ display: 'flex', marginTop: 12 }}>{t.filter((m) => m.tracking).map((m, i) => <span key={m.initials} style={{ marginLeft: i ? -6 : 0, boxShadow: '0 0 0 2px var(--hive-0)', borderRadius: '50%' }}><PersonAvatar initials={m.initials} size={24} /></span>)}</div>
          </Card>
          <Card title="Today"><Timer seconds={today} mode="short" size="md" running={t.some((m) => m.tracking)} /><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', marginTop: 6 }}>avg {formatDuration(t.length ? Math.round(today / t.length) : 0, 'short')} per person</div></Card>
          <Card title="This week"><Timer seconds={week} mode="short" size="md" running={t.some((m) => m.tracking)} /><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', marginTop: 6 }}>{data ? `${data.weekDeltaPct >= 0 ? '+' : ''}${data.weekDeltaPct}% vs last week` : '—'}</div></Card>
          <Card title="Reports today">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-3xl)', fontWeight: 500 }}>{t.filter((m) => m.report === 'Sent').length}/{t.length}</span></div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{drafts > 0 && <Badge tone="neutral" size="sm">{drafts} draft{drafts === 1 ? '' : 's'}</Badge>}{missing > 0 && <Badge tone="danger" size="sm">{missing} missing</Badge>}</div>
          </Card>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
          <Card title="People" meta={`${t.length} members`} padding={0}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead><tr><Th>Member</Th><Th right>Today</Th><Th right>Week</Th><Th>Load</Th><Th>Report</Th><Th w={40}></Th></tr></thead>
                <tbody>
                  {t.map((m) => (
                    <tr key={m.initials}>
                      <Td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><PersonAvatar initials={m.initials} tracking={m.tracking} /><span style={{ font: 'var(--type-label)' }}>{m.name}</span></div></Td>
                      <Td right mono style={{ color: m.today ? 'inherit' : 'var(--text-tertiary)' }}>{m.today ? formatDuration(m.today, 'short') : '—'}</Td>
                      <Td right mono>{formatDuration(m.week, 'short')}</Td>
                      <Td><div style={{ width: 96, height: 6, background: 'var(--hive-100)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: Math.min(100, (m.week / (goal * 3600)) * 100) + '%', height: '100%', background: m.week > goal * 3600 * 0.9 ? 'var(--warning)' : 'var(--honey-500)' }} /></div></Td>
                      <Td><Badge tone={tone(m.report)} size="sm">{m.report}</Badge></Td>
                      <Td><IconButton icon="chevron-right" label={`Open ${m.name} in Admin`} size="sm" onClick={() => focusAdmin(m.initials)} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Hours by day" meta="this week">
            {/* Fixed-height plot: value label (14) + gap (6) + bar (≤ BAR_MAX) + gap (6) + day letter (16). The goal line sits above the letters at its share of BAR_MAX. */}
            <div style={{ position: 'relative', height: BAR_MAX + 42, marginTop: 8 }}>
              <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 22 + (goal / maxH) * BAR_MAX, borderTop: '1px dashed var(--hive-400)', pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', right: 0, bottom: 3, font: 'var(--type-caption)', color: 'var(--text-tertiary)', background: 'var(--surface-card)', paddingLeft: 6 }}>goal {goal}h</span>
              </div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                {hours.map((h, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6, justifyItems: 'center' }}>
                    <span style={{ font: 'var(--type-mono)', fontSize: 10, lineHeight: '14px', color: 'var(--text-tertiary)', background: 'var(--surface-card)', padding: '0 4px', borderRadius: 2, position: 'relative' }}>{h || ''}</span>
                    <div title={`${'Mon Tue Wed Thu Fri Sat Sun'.split(' ')[i]} · ${h}h`} style={{ width: '100%', height: Math.max(2, (h / maxH) * BAR_MAX), background: i < 5 ? 'var(--honey-500)' : 'var(--hive-200)', borderRadius: 3 }} />
                    <span style={{ font: 'var(--type-caption)', lineHeight: '16px', color: 'var(--text-tertiary)' }}>{'MTWTFSS'[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
        {data && data.fetchedAt === null && <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Sample teammates — only your own row is real. Sign in to a workspace (Settings › Account → Solo or Team…) to see your team.</div>}
      </div>
      </ScrollArea>
    </>
  );
}
