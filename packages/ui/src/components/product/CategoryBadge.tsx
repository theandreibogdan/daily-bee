import type { CSSProperties } from 'react';
import { Badge } from '../core/Badge';
import { CAT_LABEL, catBg, catColor, catText, type TimelineCategory } from './categories';

export interface CategoryBadgeProps {
  cat: TimelineCategory;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

export function CategoryBadge({ cat, size, style }: CategoryBadgeProps) {
  return (
    <Badge size={size} style={{ background: catBg(cat), color: catText(cat), ...style }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: catColor(cat) }} />
      {CAT_LABEL[cat]}
    </Badge>
  );
}
