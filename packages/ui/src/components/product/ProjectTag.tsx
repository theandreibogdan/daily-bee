import type { CSSProperties } from 'react';

export interface ProjectTagProps {
  name: string;
  /** Project colour (CSS colour or var()) */
  color: string;
  style?: CSSProperties;
}

/** Inline project reference: 8px colour dot + name in caption type. */
export function ProjectTag({ name, color, style }: ProjectTagProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', ...style }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{name}
    </span>
  );
}
