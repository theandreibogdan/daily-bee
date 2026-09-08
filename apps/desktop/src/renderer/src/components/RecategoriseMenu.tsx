import { CATEGORIES, CategoryBadge, IconButton, Tooltip, type Category } from '@dailybee/ui';
import { useEffect, useRef, useState } from 'react';

/** "Recategorise" tag button on tab rows: opens a small popover with the five category pills. */
export function RecategoriseMenu({ current, onPick }: { current: Category; onPick: (c: Category) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <Tooltip content="Recategorise"><IconButton icon="tag" label="Recategorise" size="sm" active={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} /></Tooltip>
      {open && (
        <div role="menu" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 60, background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: 6, display: 'grid', gap: 4, animation: 'db-rise var(--dur-base) var(--ease-out)' }}>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" role="menuitemradio" aria-checked={c === current} onClick={() => { setOpen(false); if (c !== current) onPick(c); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, border: 0, background: c === current ? 'var(--surface-accent-soft)' : 'transparent', borderRadius: 'var(--radius-sm)', padding: '4px 6px', cursor: 'pointer', font: 'var(--type-caption)' }}>
              <CategoryBadge cat={c} size="sm" />
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
