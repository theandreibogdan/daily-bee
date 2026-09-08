import { useState, type CSSProperties, type MouseEvent } from 'react';
import { Icon } from './Icon';

export interface IconButtonProps {
  icon: string;
  /** Accessible label (required) */
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
}

const S = { sm: 28, md: 36, lg: 44 } as const;

export function IconButton({ icon, label, variant = 'ghost', size = 'md', active, disabled, onClick, style }: IconButtonProps) {
  const [hover, setHover] = useState(false);
  const bg = variant === 'primary' ? (hover ? 'var(--honey-400)' : 'var(--honey-500)')
    : variant === 'secondary' ? (hover ? 'var(--hive-100)' : 'var(--hive-0)')
    : active ? 'var(--surface-accent-soft)' : hover ? 'var(--hive-100)' : 'transparent';
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: S[size], height: S[size], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', flexShrink: 0,
        border: '1px solid ' + (variant === 'secondary' ? 'var(--border-default)' : 'transparent'), background: bg,
        color: variant === 'primary' ? 'var(--text-on-accent)' : active ? 'var(--hive-900)' : 'var(--text-secondary)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 'var(--opacity-disabled)' : 1, transition: 'background var(--dur-fast) var(--ease-out)', ...style }}>
      <Icon name={icon} size={size === 'sm' ? 16 : size === 'lg' ? 22 : 18} />
    </button>
  );
}
