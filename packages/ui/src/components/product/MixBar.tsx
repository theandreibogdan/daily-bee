import type { CSSProperties } from 'react';
import { CATEGORIES, CAT_LABEL, catColor, type TimelineCategory } from './categories';

export interface MixBarProps {
  /** Percentages per category, in `cats` order */
  mix: number[];
  height?: number;
  cats?: readonly TimelineCategory[];
  style?: CSSProperties;
}

/** Stacked category share bar: 100% width, 8–14px, rounded. One per view. */
export function MixBar({ mix, height = 8, cats = CATEGORIES, style }: MixBarProps) {
  return (
    <div style={{ display: 'flex', height, borderRadius: height / 2, overflow: 'hidden', background: 'var(--hive-100)', width: '100%', ...style }}>
      {mix.map((v, i) => v ? <div key={i} title={CAT_LABEL[cats[i] ?? 'work'] + ' ' + v + '%'} style={{ width: v + '%', background: catColor(cats[i] ?? 'work') }} /> : null)}
    </div>
  );
}
