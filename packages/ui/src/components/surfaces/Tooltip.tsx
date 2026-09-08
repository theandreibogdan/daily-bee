import { useState, type CSSProperties, type ReactNode } from 'react';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Force visible (specimens) */
  open?: boolean;
  /** Wrap long content (full URLs, paths) instead of one unbroken line */
  maxWidth?: number;
  /** Anchor the bubble to the start edge instead of centring it (for wide content near a card edge) */
  align?: 'center' | 'start';
  style?: CSSProperties;
}

export function Tooltip({ content, children, side = 'top', open, maxWidth, align = 'center', style }: TooltipProps) {
  const [hover, setHover] = useState(false);
  const show = open !== undefined ? open : hover;
  const centred = align === 'center';
  const pos: CSSProperties = side === 'bottom' ? (centred ? { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' } : { top: 'calc(100% + 6px)', left: 0 })
    : side === 'right' ? { left: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }
    : side === 'left' ? { right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)' }
    : (centred ? { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' } : { bottom: 'calc(100% + 6px)', left: 0 });
  const wrap: CSSProperties = maxWidth ? { whiteSpace: 'normal', maxWidth, wordBreak: 'break-all', textAlign: 'left' } : { whiteSpace: 'nowrap' };
  return (
    <span style={{ position: 'relative', display: 'inline-flex', ...style }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {children}
      {show && <span role="tooltip" style={{ position: 'absolute', ...pos, background: 'var(--hive-900)', color: 'var(--hive-50)', font: 'var(--type-caption)', padding: '5px 8px', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)', zIndex: 50, pointerEvents: 'none', ...wrap }}>{content}</span>}
    </span>
  );
}
