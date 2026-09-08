import type { CSSProperties } from 'react';
import { StatusDot } from '../core/StatusDot';

export interface AvatarProps {
  initials: string;
  size?: number;
  /** Shows a pulsing tracking dot on the bottom-right edge */
  tracking?: boolean;
  style?: CSSProperties;
}

export function Avatar({ initials, size = 28, tracking, style }: AvatarProps) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', ...style }}>
      <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--hive-200)', color: 'var(--hive-800)', font: 'var(--type-caption)', fontSize: size < 28 ? 10 : 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '.02em' }}>{initials}</span>
      {tracking && <StatusDot status="tracking" size={8} style={{ position: 'absolute', right: -1, bottom: -1, boxShadow: '0 0 0 2px var(--hive-0)' }} />}
    </span>
  );
}
