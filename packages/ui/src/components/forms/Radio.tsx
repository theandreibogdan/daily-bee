import type { CSSProperties, ReactNode } from 'react';

export type RadioOption<V extends string = string> = V | { value: V; label: ReactNode; description?: ReactNode };

export interface RadioProps<V extends string = string> {
  options: RadioOption<V>[];
  value?: V;
  onChange?: (value: V) => void;
  name?: string;
  direction?: 'row' | 'column';
  disabled?: boolean;
  style?: CSSProperties;
}

export function Radio<V extends string = string>({ options = [], value, onChange, name, direction = 'column', disabled, style }: RadioProps<V>) {
  return (
    <div role="radiogroup" style={{ display: 'flex', flexDirection: direction, gap: direction === 'row' ? 20 : 10, flexWrap: direction === 'row' ? 'wrap' : undefined, ...style }}>
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o as V, label: o as ReactNode, description: undefined as ReactNode } : o;
        const on = value === opt.value;
        return (
          <label key={opt.value} style={{ display: 'inline-flex', gap: 10, alignItems: 'flex-start', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 'var(--opacity-disabled)' : 1, position: 'relative' }}>
            <input type="radio" name={name} checked={on} disabled={disabled} onChange={() => onChange?.(opt.value)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
            <span style={{ width: 18, height: 18, marginTop: 1, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid ' + (on ? 'var(--honey-500)' : 'var(--border-strong)'), background: 'var(--hive-0)', transition: 'all var(--dur-fast) var(--ease-out)' }}>
              {on && <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--honey-500)' }} />}
            </span>
            <span style={{ display: 'grid', gap: 2 }}>
              <span style={{ font: 'var(--type-label)' }}>{opt.label}</span>
              {opt.description && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{opt.description}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
