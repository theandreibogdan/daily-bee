import type { CSSProperties, ReactNode } from 'react';

export interface ThProps {
  children?: ReactNode;
  right?: boolean;
  w?: number | string;
  style?: CSSProperties;
}

export function Th({ children, right, w, style }: ThProps) {
  return (
    <th style={{ textAlign: right ? 'right' : 'left', font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', width: w, whiteSpace: 'nowrap', ...style }}>{children}</th>
  );
}

export interface TdProps {
  children?: ReactNode;
  right?: boolean;
  mono?: boolean;
  colSpan?: number;
  style?: CSSProperties;
}

export function Td({ children, right, mono, colSpan, style }: TdProps) {
  return (
    <td colSpan={colSpan} style={{ textAlign: right ? 'right' : 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', font: mono ? 'var(--type-mono)' : 'var(--type-body)', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle', ...style }}>{children}</td>
  );
}

/** Table wrapper: tables scroll horizontally inside cards. */
export function TableScroll({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ overflowX: 'auto', ...style }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table></div>;
}
