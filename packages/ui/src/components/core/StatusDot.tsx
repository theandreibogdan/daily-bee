import type { CSSProperties } from 'react';

export type StatusDotStatus = 'tracking' | 'idle' | 'done' | 'danger';

export interface StatusDotProps {
  status?: StatusDotStatus;
  /** Override colour */
  color?: string;
  /** Defaults to true when status is tracking */
  pulse?: boolean;
  size?: number;
  style?: CSSProperties;
}

const STATUS_BG: Record<StatusDotStatus, string> = {
  tracking: 'var(--status-tracking)',
  done: 'var(--status-done)',
  danger: 'var(--danger)',
  idle: 'var(--status-idle)',
};

export function StatusDot({ status = 'idle', color, pulse, size = 8, style }: StatusDotProps) {
  const bg = color || STATUS_BG[status];
  const doPulse = pulse !== undefined ? pulse : status === 'tracking';
  return (
    <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: bg, flexShrink: 0, animation: doPulse ? 'db-pulse 1.6s ease-in-out infinite' : 'none', ...style }} />
  );
}
