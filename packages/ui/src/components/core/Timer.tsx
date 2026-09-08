import type { CSSProperties } from 'react';
import { formatDuration, type DurationMode } from '../../lib/format';

export interface TimerProps {
  seconds?: number;
  /** Primary text colour when running, secondary when idle */
  running?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** clock = 02:15:43, short = 2h 15m */
  mode?: DurationMode;
  style?: CSSProperties;
}

export function Timer({ seconds = 0, running, size = 'lg', mode = 'clock', style }: TimerProps) {
  const fs = size === 'sm' ? 'var(--text-md)' : size === 'md' ? 'var(--text-2xl)' : size === 'xl' ? 'var(--text-6xl)' : 'var(--text-4xl)';
  return (
    <span style={{ font: 'var(--type-timer)', fontSize: fs, fontVariantNumeric: 'tabular-nums', color: running ? 'var(--text-primary)' : 'var(--text-secondary)', letterSpacing: '-0.01em', ...style }}>
      {formatDuration(seconds, mode)}
    </span>
  );
}
