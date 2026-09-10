import { Button, Icon, IconButton, Tooltip, formatClock } from '@dailybee/ui';
import type { AppNotification } from '@shared/types';
import { useEffect, useRef, useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';

const iconFor = (n: AppNotification): string => {
  if (n.kind === 'checkin') return 'bell-ring';
  if (n.kind === 'report') return 'file-text';
  if (n.kind === 'sync') return n.tone === 'danger' ? 'alert-circle' : 'refresh-cw';
  if (n.kind === 'session') return n.title.startsWith('Timer paused') ? 'pause' : n.title.startsWith('Timer resumed') ? 'play' : n.tone === 'success' ? 'check-circle-2' : 'play';
  return n.tone === 'danger' || n.tone === 'warning' ? 'alert-circle' : 'info';
};
const colorFor = (tone: AppNotification['tone']): string => (tone === 'danger' ? 'var(--danger-text)' : tone === 'warning' ? 'var(--warning)' : tone === 'success' ? 'var(--success)' : 'var(--text-secondary)');
const when = (ts: number, startOfToday: number): string => (ts >= startOfToday ? formatClock(ts) : new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + formatClock(ts));

/**
 * The bell: the profile's notification log (main/services/notifications.ts), newest first, with an
 * unread count. Opening a notification marks it read and jumps to its screen. Missing permissions
 * stay pinned at the top while they last.
 */
export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const notes = useStore((s) => s.notifications);
  const permissions = useStore((s) => s.permissions);
  const nav = useStore((s) => s.nav);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  const unread = notes.filter((n) => !n.read).length;
  const denied = permissions.filter((p) => p.state === 'denied');
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups: Array<[string, AppNotification[]]> = [['Today', notes.filter((n) => n.ts >= startOfToday)], ['Earlier', notes.filter((n) => n.ts < startOfToday)]];
  const openNote = (n: AppNotification) => {
    if (!n.read) void api.notifications.markRead([n.id]);
    if (n.screen) { nav(n.screen); setOpen(false); }
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Tooltip content={unread ? `${unread} new notification${unread === 1 ? '' : 's'}` : 'Notifications'} side="bottom">
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <IconButton icon="bell" label="Notifications" active={open} onClick={() => setOpen(!open)} />
          {unread > 0 && (
            <span aria-label={`${unread} unread`} style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 'var(--radius-full)', background: 'var(--honey-500)', color: 'var(--text-on-accent)', font: 'var(--type-overline)', lineHeight: '16px', textAlign: 'center', boxShadow: '0 0 0 2px var(--bg-app)' }}>{unread > 99 ? '99+' : unread}</span>
          )}
        </span>
      </Tooltip>
      {open && (
        <div role="dialog" aria-label="Notifications" className="db-scroll" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 380, maxWidth: '80vw', maxHeight: 460, overflowY: 'auto', overflowX: 'hidden', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 6, zIndex: 120, animation: 'db-rise var(--dur-slow) var(--ease-out)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 6px 8px 10px' }}>
            <span style={{ font: 'var(--type-label)' }}>Notifications</span>
            {unread > 0 && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{unread} new</span>}
            <span style={{ flex: 1 }} />
            {unread > 0 && <Button size="sm" variant="ghost" onClick={() => void api.notifications.markRead()}>Mark all read</Button>}
            {notes.length > 0 && <Button size="sm" variant="ghost" onClick={() => void api.notifications.clear()}>Clear</Button>}
          </div>
          {denied.map((p) => (
            <div key={p.id} role="button" tabIndex={0} onClick={() => { nav('settings'); setOpen(false); }} onKeyDown={(e) => { if (e.key === 'Enter') { nav('settings'); setOpen(false); } }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--danger-bg)', cursor: 'pointer', marginBottom: 4 }}>
              <Icon name="alert-circle" size={16} style={{ marginTop: 2, color: 'var(--danger-text)' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: 'var(--type-label)', color: 'var(--danger-text)' }}>{p.name} permission missing</div>
                <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Settings › System permissions</div>
              </div>
            </div>
          ))}
          {notes.length === 0 && denied.length === 0 && (
            <div style={{ padding: '8px 10px 14px', font: 'var(--type-body-sm)', color: 'var(--text-tertiary)', textWrap: 'pretty' }}>Nothing yet. Task starts and stops, timer pauses, check-ins, reports and sync show up here.</div>
          )}
          {groups.filter(([, list]) => list.length).map(([label, list]) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
              <div style={{ font: 'var(--type-overline)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '8px 10px 4px' }}>{label}</div>
              {list.map((n) => (
                <div key={n.id} role={n.screen ? 'button' : undefined} tabIndex={n.screen ? 0 : undefined} onClick={() => openNote(n)} onKeyDown={(e) => { if (e.key === 'Enter') openNote(n); }}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 'var(--radius-md)', cursor: n.screen ? 'pointer' : 'default', background: n.read ? 'transparent' : 'var(--surface-accent-soft)' }}>
                  <Icon name={iconFor(n)} size={16} style={{ marginTop: 2, color: colorFor(n.tone), flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ font: 'var(--type-label)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!n.read && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--honey-500)', flexShrink: 0 }} />}
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                    </div>
                    {n.text && <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.text}</div>}
                  </div>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{when(n.ts, startOfToday)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
