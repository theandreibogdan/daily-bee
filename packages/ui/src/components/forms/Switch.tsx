import type { CSSProperties, ReactNode } from 'react';

export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

export function Switch({ checked, onChange, label, description, disabled, size = 'md', style }: SwitchProps) {
  const w = size === 'sm' ? 32 : 40, h = size === 'sm' ? 18 : 22, k = h - 4;
  return (
    <label style={{ display: 'inline-flex', gap: 12, alignItems: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 'var(--opacity-disabled)' : 1, position: 'relative', ...style }}>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span style={{ width: w, height: h, borderRadius: 'var(--radius-full)', background: checked ? 'var(--honey-500)' : 'var(--hive-300)', position: 'relative', flexShrink: 0, transition: 'background var(--dur-base) var(--ease-out)' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? w - k - 2 : 2, width: k, height: k, borderRadius: '50%', background: 'var(--hive-0)', boxShadow: 'var(--shadow-xs)', transition: 'left var(--dur-base) var(--ease-out)' }} />
      </span>
      {(label || description) && (
        <span style={{ display: 'grid', gap: 2 }}>
          {label && <span style={{ font: 'var(--type-label)' }}>{label}</span>}
          {description && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{description}</span>}
        </span>
      )}
    </label>
  );
}
