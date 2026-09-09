import { Badge, CAT_LABEL, CategoryBadge, Icon, IconButton, StatusDot, Tooltip, formatDuration } from '@dailybee/ui';
import { IDLE_SESSION, elapsedSeconds } from '@shared/session';
import type { CurrentApp, Session } from '@shared/types';
import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../bridge';

const drag = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties;
const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/**
 * Persistent floating widget (renderer?view=widget): time on task, task name, and the current app or
 * tab with its category. Translucent, always on top, draggable; double-click opens the app.
 */
export function WidgetWindow() {
  const [session, setSession] = useState<Session>(IDLE_SESSION);
  const [current, setCurrent] = useState<CurrentApp | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    void api.session.get().then(setSession);
    void api.activity.summary().then((s) => setCurrent(s.current));
    const offSession = api.session.onChange(setSession);
    const offActivity = api.activity.onChange((s) => setCurrent(s.current));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { offSession(); offActivity(); clearInterval(tick); };
  }, []);
  const running = session.running && !!session.current;
  const elapsed = elapsedSeconds(session, now);
  const noTask = !!current && current.tracked === false;
  return (
    <div onDoubleClick={() => void api.window.showMain()} title="Double-click to open DailyBee"
      style={{ ...drag, position: 'fixed', inset: 0, padding: '8px 8px 8px 12px', background: 'rgba(255, 255, 255, 0.92)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', display: 'grid', gridTemplateRows: 'auto auto', gap: 4, userSelect: 'none', font: 'var(--type-body)', color: 'var(--text-primary)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <StatusDot status={running && !session.paused ? 'tracking' : 'idle'} />
        <span style={{ font: 'var(--type-label)', flex: 1, minWidth: 0, color: running ? 'var(--text-primary)' : 'var(--text-tertiary)', ...ellipsis }}>{running ? session.current!.task : 'No task'}</span>
        <span style={{ font: 'var(--type-timer)', fontSize: 16, fontVariantNumeric: 'tabular-nums', color: running ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{formatDuration(elapsed)}</span>
        <span style={noDrag}><Tooltip content="Hide widget" side="left"><IconButton icon="x" label="Hide widget" size="sm" onClick={() => void api.settings.update({ widget: { enabled: false } })} /></Tooltip></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
        <Icon name={current?.icon ?? 'app-window'} size={12} />
        <span style={{ flex: 1, minWidth: 0, ...ellipsis }}>{current ? current.app + (current.detail ? ' · ' + current.detail : '') : 'Watching apps & tabs'}</span>
        {current && (noTask
          ? <Badge size="sm" style={{ background: 'var(--hive-100)', color: 'var(--hive-500)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hive-300)' }} />{CAT_LABEL[current.cat]}</Badge>
          : <CategoryBadge cat={current.cat} size="sm" />)}
      </div>
    </div>
  );
}
