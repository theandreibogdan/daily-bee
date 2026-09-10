import { Badge, Button, Card, Icon, IconButton, ProjectTag, Td, Th, formatDuration } from '@dailybee/ui';
import { addDays } from '@shared/week';
import type { WeekSummary } from '@shared/types';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';
import { EmptyState } from './EmptyState';

const pct = (a: number, b: number): string | null => (b > 0 ? `${a >= b ? '+' : '−'}${Math.round((Math.abs(a - b) / b) * 100)}%` : null);

/**
 * Reports › Week: the seven days of a week with tracked time, entries, focus and report state,
 * hours per project against last week and the weekly budget, and the tasks that fell behind.
 * Data comes from reports.week (shared/week.ts builds it from entries, digests, reports and tasks).
 */
export function WeekView({ onOpenDay }: { onOpenDay: (day: string) => void }) {
  const entriesVersion = useStore((s) => s.entriesVersion);
  const focusTask = useStore((s) => s.focusTask);
  const [start, setStart] = useState<number | undefined>(undefined);
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.reports.week(start).then((w) => { if (alive) { setWeek(w); setFailed(null); } }).catch((e: unknown) => { if (alive) setFailed(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [start, entriesVersion]);
  if (failed) return <div style={{ font: 'var(--type-body-sm)', color: 'var(--danger-text)' }}>{failed}</div>;
  if (!week) return <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>Adding up the week…</div>;
  const t = week.totals;
  const delta = pct(t.tracked, t.prevTracked);
  const maxTracked = Math.max(1, ...week.days.map((d) => d.tracked));
  const empty = t.entries === 0 && t.prevTracked === 0 && week.projects.length === 0;
  const kpi = (label: string, value: string, sub: string | null) => (
    <Card key={label} padding={16}>
      <div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-2xl)', fontWeight: 500, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </Card>
  );
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <IconButton icon="chevron-left" label="Previous week" onClick={() => setStart(addDays(week.start, -7))} />
        <IconButton icon="chevron-right" label="Next week" disabled={week.current} onClick={() => setStart(addDays(week.start, 7))} />
        <span style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-tight)' }}>{week.label}</span>
        {week.current ? <Badge tone="honey">This week</Badge> : <Button size="sm" variant="ghost" icon="calendar-days" onClick={() => setStart(undefined)}>This week</Button>}
      </div>

      {empty ? <EmptyState icon="calendar-days" title="Nothing tracked this week" text="Days fill in as you track. Use the arrows to look at an earlier week." /> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          {kpi('Tracked', formatDuration(t.tracked, 'short'), delta ? `${delta} vs last week (${formatDuration(t.prevTracked, 'short')})` : t.prevTracked ? null : 'nothing the week before')}
          {kpi('Days tracked', `${t.daysTracked} of ${Math.max(t.weekdaysSoFar, 1)}`, t.weekdaysSoFar ? `weekday${t.weekdaysSoFar === 1 ? '' : 's'} so far` : 'no weekdays yet')}
          {kpi('Focus', t.focus === null ? '—' : `${t.focus}%`, t.focus === null ? 'no captures' : 'work + research + learning, weighted by time')}
          {kpi('Reports', `${t.reportsSent} sent`, `${t.done} of ${t.entries} entries done`)}
        </div>

        <Card title="Days" meta="click a day for its full breakdown" padding={16}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
            {week.days.map((d) => {
              const clickable = !d.future;
              return (
                <button key={d.day} type="button" disabled={!clickable} onClick={() => onOpenDay(d.day)} aria-label={`${d.weekday} ${d.date}: ${formatDuration(d.tracked, 'short')}`}
                  style={{ display: 'grid', gap: 6, justifyItems: 'center', padding: '10px 6px', border: '1px solid ' + (d.today ? 'var(--honey-500)' : 'var(--border-subtle)'), borderRadius: 'var(--radius-md)', background: d.today ? 'var(--surface-accent-soft)' : 'var(--surface-card)', cursor: clickable ? 'pointer' : 'default', opacity: d.future ? 0.5 : 1, fontFamily: 'inherit', color: 'inherit' }}>
                  <div style={{ font: 'var(--type-label)' }}>{d.weekday} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{d.date}</span></div>
                  <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                    <div style={{ width: 22, height: Math.max(d.tracked > 0 ? 4 : 0, Math.round((d.tracked / maxTracked) * 64)), background: d.today ? 'var(--honey-500)' : 'var(--honey-300)', borderRadius: 3, transition: 'height var(--dur-base) var(--ease-out)' }} />
                  </div>
                  <div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)' }}>{d.future ? '' : formatDuration(d.tracked, 'short')}</div>
                  <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{d.future ? '' : `${d.entries} ${d.entries === 1 ? 'entry' : 'entries'}${d.focus !== null ? ` · ${d.focus}%` : ''}`}</div>
                  {!d.future && <span aria-hidden="true" title={d.report === 'None' ? 'No report' : d.report} style={{ width: 8, height: 8, borderRadius: '50%', background: d.report === 'Sent' ? 'var(--success)' : d.report === 'Draft' ? 'var(--honey-500)' : 'var(--hive-200)' }} />}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
            {([['Sent', 'var(--success)'], ['Draft', 'var(--honey-500)'], ['No report', 'var(--hive-200)']] as Array<[string, string]>).map(([l, c]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}</span>)}
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
          <Card title="Projects" meta="hours this week against last week and the weekly budget" padding={0}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead><tr><Th>Project</Th><Th right>This week</Th><Th right>Last week</Th><Th right>Change</Th><Th>Budget</Th></tr></thead>
                <tbody>
                  {week.projects.length === 0 && <tr><Td colSpan={5} style={{ color: 'var(--text-tertiary)', font: 'var(--type-body-sm)' }}>No project time this week or last.</Td></tr>}
                  {week.projects.map((p) => {
                    const budget = p.budgetHours * 3600;
                    const share = budget > 0 ? Math.min(1, p.seconds / budget) : 0;
                    const over = budget > 0 && p.seconds > budget;
                    return (
                      <tr key={p.id || '_none'}>
                        <Td><ProjectTag name={p.name} color={p.color} />{p.archived && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginLeft: 6 }}>archived</span>}</Td>
                        <Td right mono>{formatDuration(p.seconds, 'short')}</Td>
                        <Td right mono style={{ color: 'var(--text-secondary)' }}>{formatDuration(p.prevSeconds, 'short')}</Td>
                        <Td right mono style={{ color: p.seconds >= p.prevSeconds ? 'var(--success)' : 'var(--text-secondary)' }}>{pct(p.seconds, p.prevSeconds) ?? (p.seconds ? 'new' : '—')}</Td>
                        <Td style={{ minWidth: 140 }}>
                          {budget > 0
                            ? <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ height: 6, background: 'var(--hive-100)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: share * 100 + '%', height: '100%', background: over ? 'var(--danger)' : 'var(--honey-500)' }} /></div>
                              <span style={{ font: 'var(--type-caption)', color: over ? 'var(--danger-text)' : 'var(--text-tertiary)' }}>{Math.round(p.seconds / 360) / 10}h of {p.budgetHours}h{over ? ' · over budget' : ''}</span>
                            </div>
                            : <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>no budget</span>}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Tasks that fell behind" meta="overdue, and in progress but untouched this week" padding={20}>
            <div style={{ display: 'grid', gap: 14 }}>
              {week.tasks.overdue.length === 0 && week.tasks.untouched.length === 0 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>Nothing overdue, and every task in progress got time this week.</div>}
              {[['Overdue', week.tasks.overdue, 'danger'], ['Untouched this week', week.tasks.untouched, 'neutral']].map(([label, list, tone]) => (list as WeekSummary['tasks']['overdue']).length > 0 && (
                <div key={label as string} style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Badge tone={tone as 'danger' | 'neutral'} size="sm">{label as string}</Badge><span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{(list as WeekSummary['tasks']['overdue']).length}</span></div>
                  {(list as WeekSummary['tasks']['overdue']).map((task) => (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', font: 'var(--type-body-sm)' }}>
                      <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{task.id}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                      <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{task.logged}h of {task.estimate}h</span>
                      <IconButton icon="arrow-right" label={`Open ${task.id}`} size="sm" onClick={() => focusTask(task.id)} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}><Icon name="info" size={14} />Tracked time is the sum of the week's entries, exact seconds; reports use the "Round entries to 5 min" setting.</div>
    </div>
  );
}
