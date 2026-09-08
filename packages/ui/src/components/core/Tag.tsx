import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface TagProps {
  children: ReactNode;
  /** Leading colour swatch (project colour) */
  color?: string;
  onRemove?: () => void;
  selected?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

export function Tag({ children, color, onRemove, selected, onClick, style }: TagProps) {
  const [hover, setHover] = useState(false);
  return (
    <span onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 'var(--radius-full)',
        border: '1px solid ' + (selected ? 'var(--honey-500)' : 'var(--border-default)'), background: selected ? 'var(--honey-50)' : hover && onClick ? 'var(--hive-100)' : 'var(--hive-0)',
        color: 'var(--text-primary)', font: 'var(--type-caption)', cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'background var(--dur-fast) var(--ease-out)', ...style }}>
      {color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />}
      {children}
      {onRemove && <span onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ display: 'inline-flex', color: 'var(--text-tertiary)', cursor: 'pointer', marginRight: -4 }}><Icon name="x" size={12} /></span>}
    </span>
  );
}
