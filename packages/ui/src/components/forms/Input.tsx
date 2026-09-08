import { useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../core/Icon';
import { Label } from './Field';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Leading Lucide icon */
  icon?: string;
  /** Mono font — durations, IDs */
  mono?: boolean;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  id?: string;
  style?: CSSProperties;
}

export function Input({ label, hint, error, icon, mono, size = 'md', disabled, style, id, onFocus, onBlur, ...rest }: InputProps) {
  const [focus, setFocus] = useState(false);
  const h = size === 'sm' ? 'var(--control-h-sm)' : size === 'lg' ? 'var(--control-h-lg)' : 'var(--control-h-md)';
  return (
    <Label label={label} hint={hint} error={error} id={id} style={style}>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && <span style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)', display: 'flex' }}><Icon name={icon} size={16} /></span>}
        <input id={id} disabled={disabled}
          onFocus={(e) => { setFocus(true); onFocus?.(e); }} onBlur={(e) => { setFocus(false); onBlur?.(e); }}
          style={{ width: '100%', height: h, padding: icon ? '0 12px 0 34px' : '0 12px', borderRadius: 'var(--radius-md)', background: disabled ? 'var(--bg-sunken)' : 'var(--hive-0)',
            border: '1px solid ' + (error ? 'var(--danger)' : focus ? 'var(--border-focus)' : 'var(--border-default)'), boxShadow: focus ? 'var(--shadow-focus)' : 'none', outline: 'none',
            font: mono ? 'var(--type-mono)' : 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--text-primary)', opacity: disabled ? 'var(--opacity-disabled)' : 1, transition: 'box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)' }}
          {...rest} />
      </span>
    </Label>
  );
}
