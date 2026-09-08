import { useState, type CSSProperties, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> {
  style?: CSSProperties;
}

/** The kit's inline textarea (used by EndTaskDialog and the report composer) as a primitive. */
export function Textarea({ style, rows = 3, onFocus, onBlur, ...rest }: TextareaProps) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea rows={rows}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }} onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      style={{ width: '100%', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid ' + (focus ? 'var(--border-focus)' : 'var(--border-default)'), boxShadow: focus ? 'var(--shadow-focus)' : 'none', font: 'var(--type-body)', color: 'var(--text-primary)', resize: 'vertical', outline: 'none', background: 'var(--hive-0)', transition: 'box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)', ...style }}
      {...rest} />
  );
}
