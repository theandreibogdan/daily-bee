import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { IconButton } from '../core/IconButton';

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Render the panel without scrim/positioning (for specimens) */
  inline?: boolean;
  style?: CSSProperties;
}

export function Dialog({ open, onClose, title, description, children, footer, width = 480, inline, style }: DialogProps) {
  useEffect(() => {
    if (!open || inline) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, inline, onClose]);
  if (!open) return null;
  const panel = (
    <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}
      style={{ width, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', background: 'var(--surface-raised)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column',
        animation: inline ? undefined : 'db-rise var(--dur-slow) var(--ease-out)', ...style }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 20px 0' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          {title && <h2 style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-tight)', margin: 0 }}>{title}</h2>}
          {description && <p style={{ font: 'var(--type-body)', color: 'var(--text-secondary)', margin: 0 }}>{description}</p>}
        </div>
        {onClose && <IconButton icon="x" label="Close" onClick={onClose} style={{ margin: '-6px -6px 0 0' }} />}
      </header>
      <div style={{ padding: 20 }}>{children}</div>
      {footer && <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 20px' }}>{footer}</footer>}
    </div>
  );
  if (inline) return panel;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(var(--blur-overlay))', WebkitBackdropFilter: 'blur(var(--blur-overlay))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100, animation: 'db-fade var(--dur-slow) var(--ease-out)' }}>
      {panel}
    </div>
  );
}
