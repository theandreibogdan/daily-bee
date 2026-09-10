import { Button, Icon } from '@dailybee/ui';
import type { ReactNode } from 'react';

/**
 * A screen or card with nothing in it yet: what this place is for, and the one action that fills it.
 * Built from the kit's tokens (dashed outline, soft accent circle for the icon).
 */
export function EmptyState({ icon, title, text, action, compact }: { icon: string; title: string; text?: ReactNode; action?: { label: string; icon?: string; onClick: () => void }; compact?: boolean }) {
  return (
    <div role="status" style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 10, padding: compact ? '28px 20px' : '48px 24px', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)' }}>
      <span style={{ width: 44, height: 44, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-accent-soft)', color: 'var(--honey-700)' }}>
        <Icon name={icon} size={20} />
      </span>
      <div style={{ font: 'var(--type-h4)', letterSpacing: 'var(--tracking-tight)' }}>{title}</div>
      {text && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', maxWidth: 440, textWrap: 'pretty' }}>{text}</div>}
      {action && <div style={{ marginTop: 4 }}><Button size="sm" icon={action.icon} onClick={action.onClick}>{action.label}</Button></div>}
    </div>
  );
}
