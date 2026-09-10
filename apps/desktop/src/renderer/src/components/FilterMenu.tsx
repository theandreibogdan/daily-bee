import { Icon } from '@dailybee/ui';
import { Fragment, useEffect, useRef, useState } from 'react';

export interface FilterOption { value: string; label: string; /** Leading colour dot */ dot?: string }

/**
 * A filter pill for list toolbars: "Project · web-app" with a chevron, opening an anchored menu with
 * the options and a check on the current one. `all` means no filter and shows the pill quiet.
 */
export function FilterMenu({ label, icon, value, options, onChange, allLabel = 'All' }: { label: string; icon?: string; value: string; options: FilterOption[]; onChange: (v: string) => void; allLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pillHover, setPillHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const items: FilterOption[] = [{ value: 'all', label: allLabel }, ...options];
  const active = value !== 'all';
  const current = items.find((o) => o.value === value) ?? items[0]!;

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    const idx = items.findIndex((o) => o.value === (hover ?? value));
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHover(items[Math.min(items.length - 1, idx + 1)]!.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHover(items[Math.max(0, idx - 1)]!.value); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(hover ?? value); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label} filter`} onClick={() => setOpen(!open)}
        onMouseEnter={() => setPillHover(true)} onMouseLeave={() => setPillHover(false)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 8px 0 12px', borderRadius: 'var(--radius-full)', fontFamily: 'inherit', cursor: 'pointer',
          border: '1px solid ' + (active ? 'var(--honey-500)' : open || pillHover ? 'var(--border-strong)' : 'var(--border-default)'),
          background: active ? 'var(--surface-accent-soft)' : open || pillHover ? 'var(--hive-100)' : 'var(--hive-0)',
          color: active ? 'var(--hive-900)' : 'var(--text-secondary)', font: 'var(--type-label)', transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)' }}>
        {icon && <Icon name={icon} size={14} style={{ color: active ? 'var(--honey-700)' : 'var(--text-tertiary)' }} />}
        <span>{label}</span>
        {active && (
          <>
            <span aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>·</span>
            {current.dot && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: current.dot }} />}
            <span style={{ fontWeight: 600 }}>{current.label}</span>
          </>
        )}
        <Icon name="chevron-down" size={14} style={{ color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-fast) var(--ease-out)' }} />
      </button>
      {open && (
        <div ref={listRef} role="listbox" aria-label={label} tabIndex={-1} onKeyDown={onKey} className="db-scroll"
          style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', minWidth: 208, maxHeight: 320, overflowY: 'auto', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 6, zIndex: 60, outline: 'none', animation: 'db-rise var(--dur-fast) var(--ease-out)' }}>
          {items.map((o, i) => {
            const on = o.value === value;
            const hot = hover === o.value;
            return (
              <Fragment key={o.value}>
                {/* Hairline between "All" and the values: a half-pixel line on any display density, inset from the edges. */}
                {i === 1 && <div aria-hidden="true" style={{ height: 1, margin: '4px 8px', background: 'var(--border-subtle)', transform: 'scaleY(0.5)' }} />}
                <button type="button" role="option" aria-selected={on} onClick={() => pick(o.value)} onMouseEnter={() => setHover(o.value)} onMouseLeave={() => setHover(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', border: 0, borderRadius: 'var(--radius-md)', background: on ? 'var(--surface-accent-soft)' : hot ? 'var(--hive-100)' : 'transparent', color: 'var(--text-primary)', font: on ? 'var(--type-label)' : 'var(--type-body-sm)', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  {o.dot ? <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: o.dot, flexShrink: 0 }} /> : <span aria-hidden="true" style={{ width: 8, flexShrink: 0 }} />}
                  <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{o.label}</span>
                  {on && <Icon name="check" size={14} style={{ color: 'var(--honey-700)' }} />}
                </button>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
