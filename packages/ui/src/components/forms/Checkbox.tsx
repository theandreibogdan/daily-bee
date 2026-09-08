import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../core/Icon';

export interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Checkbox({ checked, indeterminate, onChange, label, description, disabled, style }: CheckboxProps) {
  const on = checked || indeterminate;
  return (
    <label style={{ display: 'inline-flex', gap: 10, alignItems: 'flex-start', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 'var(--opacity-disabled)' : 1, font: 'var(--type-body)', position: 'relative', ...style }}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span style={{ width: 18, height: 18, marginTop: 1, borderRadius: 'var(--radius-xs)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1.5px solid ' + (on ? 'var(--honey-500)' : 'var(--border-strong)'), background: on ? 'var(--honey-500)' : 'var(--hive-0)', color: 'var(--hive-950)', transition: 'all var(--dur-fast) var(--ease-out)' }}>
        {indeterminate ? <Icon name="minus" size={12} strokeWidth={3} /> : checked ? <Icon name="check" size={12} strokeWidth={3} /> : null}
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
