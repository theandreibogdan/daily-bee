import { Badge, Button, CATEGORIES, CAT_LABEL, Card, CategoryBadge, Checkbox, Icon, IconButton, MixBar, Tabs, Td, Th, Timer, Tooltip, catColor, formatClock, formatDuration, type TimelineCategory } from '@dailybee/ui';
import type { ActivityRow, Category, CategoryMix, TimelineSegment } from '@dailybee/tracker/types';
import { isEdited, type Checkin, type Entry, type RecategoriseTarget } from '@shared/types';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ProjectRef } from './ProjectRef';
import { RecategoriseMenu } from './RecategoriseMenu';

/**
 * The cards of the Today screen, parameterised by day so Reports › History can show any saved day
 * with the same layout: KPI row (tracked, focus, check-ins), timeline, activity with tabs, entries.
 */

const domainOf = (url: string): string => url.split('/')[0] ?? url;

export const EMPTY_MIX: CategoryMix = {
  seconds: { work: 0, research: 0, learning: 0, communication: 0, distraction: 0 },
  percent: { work: 0, research: 0, learning: 0, communication: 0, distraction: 0 },
  focus: 0, total: 0,
};

/** Gray badge for time captured while no task was running. */
export function NoTaskBadge({ label }: { label: string }) {
  return (
    <Badge size="sm" style={{ background: 'var(--hive-100)', color: 'var(--hive-500)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hive-300)' }} />{label}
    </Badge>
  );
}

export function checkinLine(c: Checkin): string {
  const label = c.answer === 'back' ? 'back to it' : c.answer === 'break' ? 'taking a break' : c.answer === 'relevant' ? 'this is work' : c.answer === 'dismiss' ? 'dismissed' : c.answer ? c.answer.toLowerCase() : 'no answer yet';
  if (c.kind === 'pulse') return `Halfway pulse → “${label}”`;
  return `${c.kind === 'warning' ? 'Warning' : 'Drift'} on ${c.domain ?? 'a distraction site'} → “${label}”`;
}

function ActivityRowView({ a, expanded, onToggle, onRecategorise }: { a: ActivityRow; expanded: boolean; onToggle: () => void; onRecategorise?: (target: RecategoriseTarget, cat: Category) => void }) {
  // Rows captured while no task was running stay in the list but are shown gray.
  const muted = !a.tracked;
  const ink = muted ? 'var(--text-tertiary)' : undefined;
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }} title={muted ? 'Captured while no task was running' : undefined}>
      <div onClick={a.tabs ? onToggle : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: a.tabs ? 'pointer' : 'default' }}>
        <span style={{ display: 'inline-flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--bg-sunken)', color: muted ? 'var(--hive-400)' : 'var(--text-secondary)', flexShrink: 0 }}><Icon name={a.icon} size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: 'var(--type-label)', color: ink }}>{a.app}</div>
          <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail}</div>
        </div>
        {muted ? <NoTaskBadge label={CAT_LABEL[a.cat]} /> : <CategoryBadge cat={a.cat} size="sm" />}
        <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', minWidth: 52, textAlign: 'right', color: ink }}>{formatDuration(a.seconds, 'short')}</span>
        {a.tabs ? <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} style={{ color: 'var(--text-tertiary)' }} /> : <span style={{ width: 16 }} />}
      </div>
      {expanded && a.tabs && (
        <div style={{ padding: '0 16px 10px 60px', display: 'grid', gap: 6 }}>
          {a.tabs.map((t) => {
            const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
            // Page title above the address (like app rows); hovering shows the complete address.
            const text = (
              <div style={{ display: 'grid', gap: 1, minWidth: 0, flex: 1, cursor: t.fullUrl ? 'default' : undefined }}>
                {t.title && <div style={{ font: 'var(--type-caption)', color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)', ...ellipsis }}>{t.title}</div>}
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
                {onRecategorise && <RecategoriseMenu current={t.cat} onPick={(c) => onRecategorise({ kind: 'domain', value: domainOf(t.url) }, c)} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TimelineItem = { kind: 'segment'; seg: TimelineSegment } | { kind: 'gap'; start: number; end: number };

/** Timeline: stacked category segments from the first sample's hour to `to`; time without samples stays empty. */
export function TimelineBar({ segments, from, to }: { segments: TimelineSegment[]; from: number; to: number }) {
  const startHour = new Date(from).getHours();
  const endHour = Math.max(startHour + 1, new Date(to).getHours() + 1);
  // Hour labels thin out when the bar is narrow (each label needs ~44px).
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => { const w = entries[0]?.contentRect.width ?? 0; setWidth(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hours = endHour - startHour + 1;
  const step = width ? Math.max(1, Math.ceil((hours * 44) / width)) : 1;
  const ticks: string[] = [];
  for (let h = startHour; h <= endHour; h += step) ticks.push(`${String(h).padStart(2, '0')}:00`);
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
      <div ref={barRef} style={{ display: 'flex', height: 28, borderRadius: 'var(--radius-sm)', overflow: 'hidden', gap: 2 }}>
        {items.map((it, i) => {
          if (it.kind === 'gap') return <div key={i} aria-hidden="true" style={{ flex: `${Math.max(1, it.end - it.start)} 0 0`, minWidth: 0 }} />;
          const { seg } = it;
          const minutes = Math.round((seg.end - seg.start) / 60000);
          const untracked = seg.cat !== 'break' && seg.tracked === false;
          return (
            <Tooltip key={i} content={`${formatClock(seg.start)} · ${CAT_LABEL[seg.cat as TimelineCategory]} · ${minutes ? minutes + 'm' : '<1m'}${untracked ? ' · no task' : ''}`} style={{ flex: `${Math.max(1, seg.end - seg.start)} 0 0`, minWidth: 2 }}>
              <div style={{ width: '100%', height: 28, background: untracked ? 'var(--hive-300)' : catColor(seg.cat as TimelineCategory), opacity: seg.cat === 'break' || untracked ? 1 : 0.95 }} />
            </Tooltip>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        {ticks.map((t) => <span key={t}>{t}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {([...CATEGORIES, 'break'] as TimelineCategory[]).map((c) => <CategoryBadge key={c} cat={c} size="sm" />)}
        {segments.some((s) => s.tracked === false && s.cat !== 'break') && <NoTaskBadge label="No task" />}
      </div>
    </>
  );
}

/** Tracked / Focus / Check-ins. `today` switches the wording; `onTrigger` shows the simulate button. */
export function KpiCards({ tracked, goalHours, mix, checkins, today, emptyCheckins, onTrigger }: { tracked: number; goalHours: number; mix: CategoryMix; checkins: Checkin[]; today: boolean; emptyCheckins: string; onTrigger?: () => void }) {
  const pct = CATEGORIES.map((c) => mix.percent[c]);
  const goalSec = goalHours * 3600;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <Card title={today ? 'Tracked today' : 'Tracked'}>
        <Timer seconds={tracked} mode="short" size="md" running={today} />
        <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', marginTop: 6 }}>Goal {goalHours}h · {Math.round((tracked / goalSec) * 100)}%</div>
        <div style={{ height: 6, background: 'var(--hive-100)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}><div style={{ width: Math.min(100, (tracked / goalSec) * 100) + '%', height: '100%', background: 'var(--honey-500)', transition: 'width 1s linear' }} /></div>
      </Card>
      <Card title="Focus" meta="work + research + learning">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-3xl)', fontWeight: 500 }}>{mix.focus}%</span>
          <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>· {pct[4]}% distraction</span>
        </div>
        <div style={{ marginTop: 12 }}><MixBar mix={pct} /></div>
      </Card>
      <Card title="Check-ins" meta={`${checkins.length} ${today ? 'today' : 'that day'}`} actions={onTrigger ? <IconButton icon="bell-ring" label="Trigger" size="sm" onClick={onTrigger} /> : undefined}>
        <div style={{ display: 'grid', gap: 8 }}>
          {checkins.length === 0 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>{emptyCheckins}</div>}
          {checkins.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', font: 'var(--type-body-sm)' }}>
              <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>{c.at}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{checkinLine(c)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function TimelineCard({ segments, from, to, live }: { segments: TimelineSegment[]; from: number; to: number; live: boolean }) {
  return (
    <Card title="Timeline" meta={`${formatClock(from)} – ${live ? 'now' : formatClock(to)}`} padding={16}>
      <TimelineBar segments={segments} from={from} to={to} />
    </Card>
  );
}

/** Apps & tabs with the Apps / Categories switch. Recategorising is only offered when `onRecategorise` is given. */
export function ActivityCard({ rows, mix, meta, empty, onRecategorise }: { rows: ActivityRow[]; mix: CategoryMix; meta: string; empty: string; onRecategorise?: (target: RecategoriseTarget, cat: Category) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'apps' | 'cats'>('apps');
  const pct = CATEGORIES.map((c) => mix.percent[c]);
  const byCat = CATEGORIES.map((c) => mix.seconds[c]);
  return (
    <Card title="Activity" meta={meta} padding={0} actions={<Tabs variant="pill" size="sm" tabs={[{ value: 'apps', label: 'Apps' }, { value: 'cats', label: 'Categories' }]} value={view} onChange={setView} />}>
      <div style={{ marginTop: 12 }}>
        {view === 'apps'
          ? rows.length === 0
            ? <div style={{ padding: '10px 16px 16px', font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>{empty}</div>
            : rows.map((a) => <ActivityRowView key={a.key} a={a} expanded={open === a.key} onToggle={() => setOpen(open === a.key ? null : a.key)} onRecategorise={onRecategorise} />)
          : CATEGORIES.map((c, i) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <CategoryBadge cat={c} />
              <div style={{ flex: 1, height: 6, background: 'var(--hive-100)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: pct[i] + '%', height: '100%', background: catColor(c) }} /></div>
              <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', minWidth: 40, textAlign: 'right' }}>{pct[i]}%</span>
              <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minWidth: 56, textAlign: 'right' }}>{formatDuration(byCat[i]!, 'short')}</span>
            </div>
          ))}
      </div>
    </Card>
  );
}

/** The marks of an entry touched by hand (isEdited): added by hand, split off, or corrected n times. */
export function EntryBadges({ e }: { e: Entry }) {
  const marks: ReactNode[] = [];
  if (e.origin === 'manual') marks.push(<Badge key="m" tone="info" size="sm">Added by hand</Badge>);
  if (e.origin === 'split') marks.push(<Badge key="s" size="sm">Split off</Badge>);
  if ((e.edits ?? 0) > 0) marks.push(
    <Tooltip key="e" content={`Corrected by hand ${e.edits === 1 ? 'once' : e.edits + ' times'}${e.editedAt ? ' · last ' + formatClock(e.editedAt) : ''}`}>
      <Badge tone="honey" size="sm">Edited{(e.edits ?? 0) > 1 ? ` ×${e.edits}` : ''}</Badge>
    </Tooltip>,
  );
  if (!marks.length) return null;
  return <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', verticalAlign: 'middle' }}>{marks}</span>;
}

/** The hand corrections a day's Entries card offers (components/EntryDialogs.tsx). */
export interface EntryActions { onAdd?: () => void; onEdit?: (e: Entry) => void; onSplit?: (e: Entry) => void; onDelete?: (e: Entry) => void; onLog?: () => void }

/** The entries table. Toggling done, resuming and the corrections are offered when the handlers are given. */
export function EntriesCard({ entries, meta, empty, onToggle, onResume, actions }: { entries: Entry[]; meta: string; empty: string; onToggle?: (id: string) => void; onResume?: (e: Entry) => void; actions?: EntryActions }) {
  const edited = entries.filter(isEdited).length;
  const canEdit = !!(actions?.onEdit || actions?.onSplit || actions?.onDelete);
  const header = actions ? (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {edited > 0 && <Badge tone="honey" size="sm">{edited} edited</Badge>}
      {actions.onLog && <IconButton icon="history" label="Change log" size="sm" onClick={actions.onLog} />}
      {actions.onAdd && <Button size="sm" variant="ghost" icon="plus" onClick={actions.onAdd}>Add entry</Button>}
    </div>
  ) : undefined;
  return (
    <Card title="Entries" meta={meta} padding={0} actions={header}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead><tr><Th w={40}></Th><Th>Task</Th><Th>Project</Th><Th right>Duration</Th><Th w={canEdit ? 124 : 40}></Th></tr></thead>
          <tbody>
            {entries.length === 0 && <tr><Td colSpan={5} style={{ color: 'var(--text-tertiary)', font: 'var(--type-body-sm)' }}>{empty}</Td></tr>}
            {entries.map((e) => (
              <tr key={e.id}>
                <Td>{onToggle ? <Checkbox checked={e.done} onChange={() => onToggle(e.id)} /> : <Icon name={e.done ? 'check-circle-2' : 'circle'} size={16} style={{ color: e.done ? 'var(--success)' : 'var(--text-tertiary)' }} />}</Td>
                <Td style={{ minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ font: 'var(--type-label)', color: e.done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: e.done ? 'line-through' : 'none' }}>{e.task}</span>
                    <EntryBadges e={e} />
                  </div>
                  <div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{e.ref ? `${e.ref} · ` : ''}{e.start}{e.outcome && e.outcome !== 'Done' ? ` · ${e.outcome}` : ''}</div>
                </Td>
                <Td><ProjectRef id={e.project} /></Td>
                <Td right mono>{formatDuration(e.seconds, 'short')}</Td>
                <Td>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 0 }}>
                    {onResume && <IconButton icon="play" label="Resume" size="sm" onClick={() => onResume(e)} />}
                    {actions?.onEdit && <IconButton icon="pencil" label="Correct" size="sm" onClick={() => actions.onEdit?.(e)} />}
                    {actions?.onSplit && <IconButton icon="scissors" label="Split" size="sm" onClick={() => actions.onSplit?.(e)} />}
                    {actions?.onDelete && <IconButton icon="trash-2" label="Delete" size="sm" onClick={() => actions.onDelete?.(e)} />}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
