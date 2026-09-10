import { Icon, formatDuration } from '@dailybee/ui';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../bridge';
import { navFor } from '../screens/Shell';
import { useStore } from '../store';

interface Item { id: string; group: string; label: string; hint?: string; icon: string; run: () => void }

/**
 * Search / command palette behind the top-bar search icon and Ctrl/⌘K: jump to a screen, run an
 * action, open a task, or find today's entries. Not a kit screen; styled like the kit's dialogs.
 */
export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const tasks = useStore((s) => s.tasks);
  const entries = useStore((s) => s.entries);
  const session = useStore((s) => s.session);
  const account = useStore((s) => s.account);
  const { setPalette, nav, openPrompt, triggerCheckin, focusTask, openReports, setTour } = useStore.getState();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setCursor(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (fn: () => void) => () => { setPalette(false); fn(); };
    const all: Item[] = [
      session.running && session.current
        ? { id: 'stop', group: 'Actions', label: 'Stop task', hint: session.current.task, icon: 'square', run: go(() => openPrompt('end')) }
        : { id: 'start', group: 'Actions', label: 'Start a task', icon: 'play', run: go(() => openPrompt('start')) },
      { id: 'report', group: 'Actions', label: 'Generate report', icon: 'sparkles', run: go(() => openPrompt('report')) },
      { id: 'checkin', group: 'Actions', label: 'Simulate a check-in', icon: 'bell-ring', run: go(() => void triggerCheckin()) },
      ...(api.demo ? [] : [{ id: 'tour', group: 'Actions', label: 'Take the tour', icon: 'compass', run: go(() => setTour(true)) }]),
      ...(account?.mode === 'solo' && account.hasPassword ? [{ id: 'lock', group: 'Actions', label: 'Lock DailyBee', icon: 'lock', run: go(() => void api.account.lock()) }] : []),
      ...(api.demo ? [] : [{ id: 'switch-profile', group: 'Actions', label: 'Switch profile', icon: 'users', run: go(() => void api.profiles.close()) }]),
      ...navFor(account).map((n) => ({ id: 'nav-' + n.id, group: 'Go to', label: n.label, icon: n.icon, run: go(() => nav(n.id)) })),
      { id: 'nav-settings', group: 'Go to', label: 'Settings', icon: 'settings', run: go(() => nav('settings')) },
      { id: 'nav-history', group: 'Go to', label: 'Report history', icon: 'file-text', run: go(() => openReports('history')) },
      ...tasks.map((t) => ({ id: 'task-' + t.id, group: 'Tasks', label: t.title, hint: `${t.id} · ${t.status}`, icon: 'list-checks', run: go(() => focusTask(t.id)) })),
      ...entries.map((e) => ({ id: 'entry-' + e.id, group: 'Today', label: e.task, hint: `${e.start} · ${formatDuration(e.seconds, 'short')}`, icon: 'timer', run: go(() => nav('today')) })),
    ];
    const needle = q.trim().toLowerCase();
    const hits = needle ? all.filter((i) => `${i.label} ${i.hint ?? ''} ${i.group}`.toLowerCase().includes(needle)) : all;
    return hits.slice(0, 12);
  }, [q, tasks, entries, session, account, setPalette, nav, openPrompt, triggerCheckin, focusTask, openReports]);

  useEffect(() => { if (cursor >= items.length) setCursor(0); }, [items, cursor]);
  if (!open) return null;

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[cursor]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); setPalette(false); }
  };
  let lastGroup = '';
  return (
    <div onClick={() => setPalette(false)} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 250, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 24px 24px', animation: 'db-fade var(--dur-fast) var(--ease-out)' }}>
      <div role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'db-rise var(--dur-slow) var(--ease-out)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Icon name="search" size={18} style={{ color: 'var(--text-tertiary)' }} />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); }} onKeyDown={onKey} placeholder="Search tasks, entries, screens and actions" aria-label="Search"
            style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', font: 'var(--type-body)', color: 'var(--text-primary)' }} />
          <kbd style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xs)', padding: '1px 6px' }}>Esc</kbd>
        </div>
        <div role="listbox" style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
          {items.length === 0 && <div style={{ padding: '16px 12px', font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>Nothing matches “{q}”.</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '10px 10px 4px' }}>{header}</div>}
                <div role="option" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={it.run}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: i === cursor ? 'var(--surface-accent-soft)' : 'transparent' }}>
                  <Icon name={it.icon} size={16} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ flex: 1, minWidth: 0, font: 'var(--type-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  {it.hint && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{it.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
