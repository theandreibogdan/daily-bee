import type { CSSProperties, ReactNode } from 'react';
import { StatusDot } from './StatusDot';

export type BadgeTone = 'neutral' | 'honey' | 'success' | 'warning' | 'danger' | 'info' | 'inverse';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Leading status dot */
  dot?: boolean;
  pulse?: boolean;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

const T: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--hive-100)', fg: 'var(--hive-700)' },
  honey: { bg: 'var(--honey-100)', fg: 'var(--honey-800)' },
  success: { bg: 'var(--success-bg)', fg: 'var(--success-text)' },
  warning: { bg: 'var(--warning-bg)', fg: 'var(--warning-text)' },
  danger: { bg: 'var(--danger-bg)', fg: 'var(--danger-text)' },
  info: { bg: 'var(--info-bg)', fg: 'var(--info-text)' },
  inverse: { bg: 'var(--hive-900)', fg: 'var(--hive-50)' },
};

export function Badge({ children, tone = 'neutral', dot, pulse, size = 'md', style }: BadgeProps) {
  const t = T[tone] || T.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: size === 'sm' ? 20 : 24, padding: size === 'sm' ? '0 8px' : '0 10px', borderRadius: 'var(--radius-full)',
      background: t.bg, color: t.fg, font: 'var(--type-caption)', fontSize: size === 'sm' ? 'var(--text-2xs)' : 'var(--text-xs)', whiteSpace: 'nowrap', ...style }}>
      {dot && <StatusDot color={t.fg} pulse={pulse} size={6} />}
      {children}
    </span>
  );
}
