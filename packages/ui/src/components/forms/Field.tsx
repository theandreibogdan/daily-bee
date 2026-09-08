import type { CSSProperties, ReactNode } from 'react';

/** Label + control + hint/error stack shared by Input and Select. */
export interface LabelProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children?: ReactNode;
  id?: string;
  style?: CSSProperties;
}

export function Label({ label, hint, error, children, id, style }: LabelProps) {
  return (
    <label htmlFor={id} style={{ display: 'grid', gap: 6, font: 'var(--type-label)', color: 'var(--text-primary)', minWidth: 0, ...style }}>
      {label && <span>{label}</span>}
      {children}
      {(error || hint) && <span style={{ font: 'var(--type-caption)', color: error ? 'var(--danger-text)' : 'var(--text-tertiary)' }}>{error || hint}</span>}
    </label>
  );
}

/** Non-label field wrapper used by the prompt dialogs (radio groups, chip rows). */
export interface FieldProps {
  label: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Field({ label, children, style }: FieldProps) {
  return (
    <div style={{ display: 'grid', gap: 8, ...style }}>
      <div style={{ font: 'var(--type-label)' }}>{label}</div>
      {children}
    </div>
  );
}
