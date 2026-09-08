import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../core/Icon';
import { IconButton } from '../core/IconButton';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ToastProps {
  children: ReactNode;
  tone?: ToastTone;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  style?: CSSProperties;
}

const I: Record<ToastTone, string> = { neutral: 'info', success: 'check-circle-2', warning: 'alert-triangle', danger: 'alert-circle' };
const C: Record<ToastTone, string> = { neutral: 'var(--honey-500)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' };

export function Toast({ children, tone = 'neutral', action, onAction, onDismiss, style }: ToastProps) {
  return (
    <div role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 280, maxWidth: 440, padding: '10px 10px 10px 14px', background: 'var(--hive-900)', color: 'var(--hive-50)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', font: 'var(--type-body-sm)', animation: 'db-rise var(--dur-slow) var(--ease-out)', ...style }}>
      <span style={{ color: C[tone], display: 'flex' }}><Icon name={I[tone]} size={18} /></span>
      <span style={{ flex: 1 }}>{children}</span>
      {action && <button type="button" onClick={onAction} style={{ border: 0, background: 'transparent', color: 'var(--honey-400)', font: 'var(--type-label)', cursor: 'pointer', padding: '0 4px' }}>{action}</button>}
      {onDismiss && <IconButton icon="x" label="Dismiss" size="sm" onClick={onDismiss} style={{ color: 'var(--hive-400)' }} />}
    </div>
  );
}
