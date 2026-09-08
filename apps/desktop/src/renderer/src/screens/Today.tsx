import { Badge, Button, CATEGORIES, CAT_LABEL, Card, CategoryBadge, Checkbox, Icon, IconButton, MixBar, Tabs, Tag, Td, Th, Timer, Tooltip, catColor, formatClock, formatDuration, type TimelineCategory } from '@dailybee/ui';
import type { ActivityRow, TimelineSegment } from '@dailybee/tracker/types';
import type { Checkin } from '@shared/types';
import { useState } from 'react';
import { ProjectRef } from '../components/ProjectRef';
import { RecategoriseMenu } from '../components/RecategoriseMenu';
import { selectElapsed, selectTrackedToday, useStore } from '../store';
import { ScrollArea, Topbar } from './Shell';

const domainOf = (url: string): string => url.split('/')[0] ?? url;

function ActivityRowView({ a, expanded, onToggle }: { a: ActivityRow; expanded: boolean; onToggle: () => void }) {
  const recategorise = useStore((s) => s.recategorise);
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div onClick={a.tabs ? onToggle : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: a.tabs ? 'pointer' : 'default' }}>
        <span style={{ display: 'inline-flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--bg-sunken)', color: 'var(--text-secondary)', flexShrink: 0 }}><Icon name={a.icon} size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: 'var(--type-label)' }}>{a.app}</div>
          <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail}</div>
        </div>
        <CategoryBadge cat={a.cat} size="sm" />
        <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', minWidth: 52, textAlign: 'right' }}>{formatDuration(a.seconds, 'short')}</span>
        {a.tabs ? <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} style={{ color: 'var(--text-tertiary)' }} /> : <span style={{ width: 16 }} />}
      </div>
      {expanded && a.tabs && (
        <div style={{ padding: '0 16px 10px 60px', display: 'grid', gap: 6 }}>
          {a.tabs.map((t) => {
            const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
            // Page title above the address (like app rows); hovering shows the complete address.
            const text = (
              <div style={{ display: 'grid', gap: 1, minWidth: 0, flex: 1, cursor: t.fullUrl ? 'default' : undefined }}>
                {t.title && <div style={{ font: 'var(--type-caption)', color: 'var(--text-primary)', ...ellipsis }}>{t.title}</div>}
                <div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: t.title ? 'var(--text-tertiary)' : 'var(--text-secondary)', ...ellipsis }}>{t.label}</div>
              </div>
            );
            return (
              <div key={t.url} style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
                <Icon name="link" size={12} />
                {t.fullUrl
                  ? <Tooltip content={<span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)' }}>{t.fullUrl}</span>} align="start" maxWidth={440} style={{ flex: 1, minWidth: 0 }}>{text}</Tooltip>
                  : text}
                <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)' }}>{formatDuration(t.seconds, 'short')}</span>
                <RecategoriseMenu current={t.cat} onPick={(c) => void recategorise({ kind: 'domain', value: domainOf(t.url) }, c)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function checkinLine(c: Checkin): string {
  const label = c.answer === 'back' ? 'back to it' : c.answer === 'break' ? 'taking a break' : c.answer === 'relevant' ? 'this is work' : c.answer === 'dismiss' ? 'dismissed' : c.answer ? c.answer.toLowerCase() : 'no answer yet';
  return c.kind === 'drift' ? `Drift on ${c.domain ?? 'a distraction site'} → “${label}”` : `Halfway pulse → “${label}”`;
}

type TimelineItem = { kind: 'segment'; seg: TimelineSegment } | { kind: 'gap'; start: number; end: number };

/** Timeline: stacked category segments from 09:00 (or the first sample) to now; time without samples stays empty. */
function TimelineBar({ segments, from, to }: { segments: TimelineSegment[]; from: number; to: number }) {
  const startHour = new Date(from).getHours();
  const endHour = Math.max(startHour + 1, new Date(to).getHours() + 1);
  const ticks: string[] = [];
  for (let h = startHour; h <= endHour; h++) ticks.push(`${String(h).padStart(2, '0')}:00`);
  // Lay the bar out on real time: gaps before, between and after segments take their share of the width.
  const items: TimelineItem[] = [];
  let cursor = from;
  for (const seg of [...segments].sort((a, b) => a.start - b.start)) {
    const start = Math.max(seg.start, from);
    if (seg.end <= cursor) continue;
    if (start > cursor) items.push({ kind: 'gap', start: cursor, end: start });
    items.push({ kind: 'segment', seg: { ...seg, start } });
    cursor = seg.end;
  }
  if (to > cursor) items.push({ kind: 'gap', start: cursor, end: to });
  return (
    <>
      <div style={{ display: 'flex', height: 28, borderRadius: 'var(--radius-sm)', overflow: 'hidden', gap: 2 }}>
        {items.map((it, i) => {
          if (it.kind === 'gap') return <div key={i} aria-hidden="true" style={{ flex: `${Math.max(1, it.end - it.start)} 0 0`, minWidth: 0 }} />;
          const { seg } = it;
          const minutes = Math.round((seg.end - seg.start) / 60000);
          return (
            <Tooltip key={i} content={`${formatClock(seg.start)} · ${CAT_LABEL[seg.cat as TimelineCategory]} · ${minutes ? minutes + 'm' : '<1m'}`} style={{ flex: `${Math.max(1, seg.end - seg.start)} 0 0`, minWidth: 2 }}>
              <div style={{ width: '100%', height: 28, background: catColor(seg.cat as TimelineCategory), opacity: seg.cat === 'break' ? 1 : 0.95 }} />
            </Tooltip>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        {ticks.map((t) => <span key={t}>{t}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>{([...CATEGORIES, 'break'] as TimelineCategory[]).map((c) => <CategoryBadge key={c} cat={c} size="sm" />)}</div>
    </>
  );
}

export function TodayScreen() {
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'apps' | 'cats'>('apps');
  const session = useStore((s) => s.session);
  const seconds = useStore(selectElapsed);
  const total = useStore(selectTrackedToday);
  const entries = useStore((s) => s.entries);
  const activity = useStore((s) => s.activity);
  const checkins = useStore((s) => s.checkins);
  const projects = useStore((s) => s.projects);
  const goalHours = useStore((s) => s.settings?.dailyGoalHours ?? 8);
  const now = useStore((s) => s.now);
  const { openPrompt, toggleEntry, triggerCheckin } = useStore.getState();
  const running = session.running && !!session.current;
  const current = session.current;
  const rows = activity?.rows ?? [];
  const mix = CATEGORIES.map((c) => activity?.mix.percent[c] ?? 0);
  const byCat = CATEGORIES.map((c) => activity?.mix.seconds[c] ?? 0);
  const focus = activity?.mix.focus ?? 0;
  const goalSec = goalHours * 3600;
  const goalPct = Math.round((total / goalSec) * 100);
  const project = projects.find((p) => p.id === current?.project);
  const timelineFrom = activity?.firstTs ?? activity?.timeline[0]?.start ?? now;
  const timelineStart = Math.min(timelineFrom, dayAt(9, now));
  const answeredToday = checkins.length;

  return (
    <>
      <Topbar title="Today">
        <Tooltip content="Simulate a check-in popup" side="bottom"><Button variant="ghost" size="sm" icon="bell-ring" onClick={() => void triggerCheckin()}>Check-in</Button></Tooltip>
        <Button variant="secondary" size="sm" icon="sparkles" onClick={() => openPrompt('report')}>Generate report</Button>
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 'var(--content-max)' }}>
        <Card padding={20}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 24, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {running ? <Badge tone="honey" dot pulse>Tracking</Badge> : <Badge>Idle</Badge>}
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{running && session.startedAt ? `Started ${formatClock(session.startedAt)} · watching apps & browser tabs` : 'Start a task to begin tracking'}</span>
              </div>
              <div style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-tight)' }}>{running ? current!.task : 'No active task'}</div>
              {running && current!.goal && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-tertiary)' }}>Done means: </span>{current!.goal}</div>}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {running && <>
                  {project && <Tag color={project.color}>{project.name}</Tag>}
                  {current!.ref && <Tag>{current!.ref}</Tag>}
                  <Tag>{current!.size}</Tag>
                </>}
                <span style={{ flex: 1 }} />
                {activity?.current && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
                    <Icon name={activity.current.icon} size={14} />Now in {activity.current.app}{activity.current.detail ? ` · ${activity.current.detail}` : ''}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Timer seconds={running ? seconds : 0} running={running} size="xl" style={{ fontSize: 44 }} />
              {running
                ? <Button size="lg" glow icon="square" onClick={() => openPrompt('end')}>Stop</Button>
                : <Button size="lg" icon="play" spring onClick={() => openPrompt('start')}>Start a task</Button>}
            </div>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <Card title="Tracked today">
            <Timer seconds={total} mode="short" size="md" running />
            <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', marginTop: 6 }}>Goal {goalHours}h · {goalPct}%</div>
            <div style={{ height: 6, background: 'var(--hive-100)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}><div style={{ width: Math.min(100, (total / goalSec) * 100) + '%', height: '100%', background: 'var(--honey-500)', transition: 'width 1s linear' }} /></div>
          </Card>
          <Card title="Focus" meta="work + research + learning">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-3xl)', fontWeight: 500 }}>{focus}%</span>
              <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>· {mix[4]}% distraction</span>
            </div>
            <div style={{ marginTop: 12 }}><MixBar mix={mix} /></div>
          </Card>
          <Card title="Check-ins" meta={`${answeredToday} today`} actions={<IconButton icon="bell-ring" label="Trigger" size="sm" onClick={() => void triggerCheckin()} />}>
            <div style={{ display: 'grid', gap: 8 }}>
              {checkins.length === 0 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>No check-ins yet today. They appear after 8 min on a distraction site or halfway through a task.</div>}
              {checkins.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', font: 'var(--type-body-sm)' }}>
                  <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>{c.at}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{checkinLine(c)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card title="Timeline" meta={`${formatClock(timelineStart)} – now`} padding={16}>
          <TimelineBar segments={activity?.timeline ?? []} from={timelineStart} to={now} />
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
          <Card title="Activity" meta={activity?.live ? 'apps & tabs · read from the system, no extension' : 'apps & tabs · read from the system, no extension'} padding={0}
            actions={<Tabs variant="pill" size="sm" tabs={[{ value: 'apps', label: 'Apps' }, { value: 'cats', label: 'Categories' }]} value={view} onChange={setView} />}>
            <div style={{ marginTop: 12 }}>
              {view === 'apps'
                ? rows.length === 0
                  ? <div style={{ padding: '10px 16px 16px', font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>No activity yet. DailyBee samples the app in front every few seconds once tracking has permission.</div>
                  : rows.map((a) => <ActivityRowView key={a.key} a={a} expanded={open === a.key} onToggle={() => setOpen(open === a.key ? null : a.key)} />)
                : CATEGORIES.map((c, i) => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <CategoryBadge cat={c} />
                    <div style={{ flex: 1, height: 6, background: 'var(--hive-100)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: mix[i] + '%', height: '100%', background: catColor(c) }} /></div>
                    <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', minWidth: 40, textAlign: 'right' }}>{mix[i]}%</span>
                    <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minWidth: 56, textAlign: 'right' }}>{formatDuration(byCat[i]!, 'short')}</span>
                  </div>
                ))}
            </div>
          </Card>
          <Card title="Entries" meta={`${entries.length} today`} padding={0}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead><tr><Th w={40}></Th><Th>Task</Th><Th>Project</Th><Th right>Duration</Th><Th w={40}></Th></tr></thead>
                <tbody>
                  {entries.length === 0 && <tr><Td colSpan={5} style={{ color: 'var(--text-tertiary)', font: 'var(--type-body-sm)' }}>No entries yet today. Start the timer or log time manually.</Td></tr>}
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <Td><Checkbox checked={e.done} onChange={() => void toggleEntry(e.id)} /></Td>
                      <Td style={{ minWidth: 180 }}>
                        <div style={{ font: 'var(--type-label)', color: e.done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: e.done ? 'line-through' : 'none' }}>{e.task}</div>
                        <div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{e.ref ? `${e.ref} · ` : ''}{e.start}</div>
                      </Td>
                      <Td><ProjectRef id={e.project} /></Td>
                      <Td right mono>{formatDuration(e.seconds, 'short')}</Td>
                      <Td><IconButton icon="play" label="Resume" size="sm" onClick={() => openPrompt('start', e)} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
      </ScrollArea>
    </>
  );
}

function dayAt(hour: number, ts: number): number {
  const d = new Date(ts);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}
