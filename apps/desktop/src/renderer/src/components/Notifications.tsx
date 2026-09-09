import { Badge, Icon, IconButton, Tooltip, formatClock } from '@dailybee/ui';
import { PAUSE_LABEL } from '@shared/session';
import type { ReportDraft } from '@shared/types';
import { useEffect, useRef, useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';

interface Note { id: string; ts: number; icon: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; text: string; sub?: string }

const SEEN_KEY = 'db-notif-seen';
const readSeen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY) ?? 0); } catch { return 0; } };
const ANSWER: Record<string, string> = { back: 'back to it', break: 'taking a break', relevant: 'this is work', dismiss: 'dismissed' };

/**
 * Notification bell: today's check-ins, report status, sync state, timer pauses and permission
 * problems, derived from live state (nothing is invented). The dot clears when the list is opened.
 */
export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const [report, setReport] = useState<ReportDraft | null>(null);
  const checkins = useStore((s) => s.checkins);
  const sync = useStore((s) => s.sync);
  const session = useStore((s) => s.session);
  const permissions = useStore((s) => s.permissions);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void api.reports.current().then(setReport);
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  const notes: Note[] = [];
  for (const c of checkins) {
    const where = c.kind === 'pulse' ? 'Halfway check-in' : `${c.kind === 'warning' ? 'Warning' : 'Drift'} on ${c.domain ?? 'a distraction site'}`;
    notes.push({ id: 'c' + c.id, ts: c.ts, icon: 'bell-ring', tone: c.answer ? 'neutral' : 'warning', text: where, sub: c.answer ? `You said “${ANSWER[c.answer] ?? c.answer.toLowerCase()}”` : 'Waiting for an answer' });
  }
  if (session.running && session.paused) notes.push({ id: 'paused', ts: session.paused.since, icon: 'pause', tone: 'warning', text: 'Timer paused', sub: `${PAUSE_LABEL[session.paused.reason]} since ${formatClock(session.paused.since)}` });
  if (report) notes.push({ id: 'report', ts: report.sentAt ?? Date.now(), icon: 'file-text', tone: report.status === 'sent' ? 'success' : 'neutral', text: report.status === 'sent' ? `Report sent to ${report.recipients}` : 'Daily report drafted', sub: report.status === 'sent' && report.sentAt ? formatClock(report.sentAt) : 'Open Reports to review and send' });
  if (sync?.lastError) notes.push({ id: 'sync-err', ts: Date.now(), icon: 'alert-circle', tone: 'danger', text: 'Sync failed', sub: sync.lastError });
  else if (sync?.lastPushAt) notes.push({ id: 'sync', ts: sync.lastPushAt, icon: 'refresh-cw', tone: 'success', text: 'Synced with your workspace', sub: formatClock(sync.lastPushAt) });
  for (const p of permissions) if (p.state === 'denied') notes.push({ id: 'perm' + p.id, ts: 0, icon: 'alert-circle', tone: 'danger', text: `${p.name} permission missing`, sub: 'Settings › System permissions' });
  notes.sort((a, b) => b.ts - a.ts);
  const unread = notes.filter((n) => n.ts > seen).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) { const now = Date.now(); setSeen(now); try { localStorage.setItem(SEEN_KEY, String(now)); } catch { /* private mode */ } }
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Tooltip content="Notifications" side="bottom">
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <IconButton icon="bell" label="Notifications" active={open} onClick={toggle} />
          {unread > 0 && <span aria-label={`${unread} unread`} style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--honey-500)', boxShadow: '0 0 0 2px var(--bg-app)' }} />}
        </span>
      </Tooltip>
      {open && (
        <div role="dialog" aria-label="Notifications" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 360, maxWidth: '80vw', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 8, zIndex: 40, animation: 'db-rise var(--dur-base) var(--ease-out)' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px 8px', font: 'var(--type-label)' }}>Notifications<span style={{ flex: 1 }} /><Badge size="sm">{notes.length}</Badge></div>
          {notes.length === 0 && <div style={{ padding: '8px 10px 12px', font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>Nothing yet today.</div>}
          <div style={{ display: 'grid', gap: 2, maxHeight: 340, overflowY: 'auto' }}>
            {notes.map((n) => (
              <div key={n.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
                <Icon name={n.icon} size={16} style={{ marginTop: 2, color: n.tone === 'danger' ? 'var(--danger-text)' : n.tone === 'warning' ? 'var(--warning)' : n.tone === 'success' ? 'var(--success)' : 'var(--text-secondary)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ font: 'var(--type-label)' }}>{n.text}</div>
                  {n.sub && <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</div>}
                </div>
                {n.ts > 0 && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{formatClock(n.ts)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
