import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

export interface CardProps {
  children?: ReactNode;
  title?: ReactNode;
  /** Small tertiary text next to the title (date, count) */
  meta?: ReactNode;
  actions?: ReactNode;
  padding?: number;
  interactive?: boolean;
  selected?: boolean;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  style?: CSSProperties;
}

export function Card({ children, title, meta, actions, padding = 16, interactive, selected, onClick, style }: CardProps) {
  const [hover, setHover] = useState(false);
  const lift = interactive && hover;
  // The header is always a 16px-padded row (design guide "Cards"), even when the body is
  // flush (padding={0}) so lists and tables can run edge to edge.
  const headerPad = padding > 0 ? padding : 16;
  return (
    <section onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: 'var(--surface-card)', border: '1px solid ' + (selected ? 'var(--honey-500)' : lift ? 'var(--border-default)' : 'var(--border-subtle)'), borderRadius: 'var(--radius-lg)',
        boxShadow: lift ? 'var(--shadow-sm)' : 'var(--shadow-xs)', cursor: interactive ? 'pointer' : 'default', transition: 'box-shadow var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out)', display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}>
      {(title || actions) && (
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: headerPad + 'px ' + headerPad + 'px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            {title && <h3 style={{ font: 'var(--type-h4)', letterSpacing: 'var(--tracking-tight)', margin: 0 }}>{title}</h3>}
            {meta && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{meta}</span>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding: padding + 'px', flex: 1, minWidth: 0 }}>{children}</div>
    </section>
  );
}
