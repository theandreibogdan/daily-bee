import { useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Icon } from '../core/Icon';
import { Label } from './Field';

export type SelectOption = string | { value: string; label: string };

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'style'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: SelectOption[];
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  id?: string;
  style?: CSSProperties;
}

export function Select({ label, hint, error, options = [], size = 'md', disabled, style, id, onFocus, onBlur, ...rest }: SelectProps) {
  const [focus, setFocus] = useState(false);
  const h = size === 'sm' ? 'var(--control-h-sm)' : size === 'lg' ? 'var(--control-h-lg)' : 'var(--control-h-md)';
  return (
    <Label label={label} hint={hint} error={error} id={id} style={style}>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <select id={id} disabled={disabled}
          onFocus={(e) => { setFocus(true); onFocus?.(e); }} onBlur={(e) => { setFocus(false); onBlur?.(e); }}
          style={{ width: '100%', height: h, padding: '0 34px 0 12px', borderRadius: 'var(--radius-md)', appearance: 'none', WebkitAppearance: 'none', background: disabled ? 'var(--bg-sunken)' : 'var(--hive-0)',
            border: '1px solid ' + (error ? 'var(--danger)' : focus ? 'var(--border-focus)' : 'var(--border-default)'), boxShadow: focus ? 'var(--shadow-focus)' : 'none', outline: 'none', cursor: 'pointer',
            font: 'var(--type-body)', fontSize: size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)', color: 'var(--text-primary)', opacity: disabled ? 'var(--opacity-disabled)' : 1 }}
          {...rest}>
          {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ position: 'absolute', right: 10, pointerEvents: 'none', color: 'var(--text-tertiary)', display: 'flex' }}><Icon name="chevron-down" size={16} /></span>
      </span>
    </Label>
  );
}
