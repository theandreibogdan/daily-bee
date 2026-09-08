import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../core/Icon';

export type TabItem<V extends string = string> = V | { value: V; label: ReactNode; icon?: string; count?: number };

export interface TabsProps<V extends string = string> {
  tabs: TabItem<V>[];
  value: V;
  onChange?: (value: V) => void;
  variant?: 'underline' | 'pill';
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

export function Tabs<V extends string = string>({ tabs = [], value, onChange, variant = 'underline', size = 'md', style }: TabsProps<V>) {
  const [hover, setHover] = useState<string | null>(null);
  const pill = variant === 'pill';
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: pill ? 4 : 0, padding: pill ? 4 : 0, background: pill ? 'var(--bg-sunken)' : 'transparent', borderRadius: pill ? 'var(--radius-md)' : 0, borderBottom: pill ? 'none' : '1px solid var(--border-subtle)', ...style }}>
      {tabs.map((t) => {
        const tab = typeof t === 'string' ? { value: t as V, label: t as ReactNode, icon: undefined as string | undefined, count: undefined as number | undefined } : t;
        const on = tab.value === value;
        return (
          <button key={tab.value} role="tab" aria-selected={on} type="button" onClick={() => onChange?.(tab.value)} onMouseEnter={() => setHover(tab.value)} onMouseLeave={() => setHover(null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: size === 'sm' ? 28 : 36, padding: '0 12px', border: 0, cursor: 'pointer', font: 'var(--type-label)', fontSize: size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)',
              borderRadius: pill ? 'var(--radius-sm)' : 0, background: pill ? (on ? 'var(--hive-0)' : hover === tab.value ? 'var(--hive-200)' : 'transparent') : 'transparent', boxShadow: pill && on ? 'var(--shadow-xs)' : 'none',
              color: on ? 'var(--text-primary)' : hover === tab.value ? 'var(--text-primary)' : 'var(--text-secondary)', position: 'relative', marginBottom: pill ? 0 : -1, whiteSpace: 'nowrap',
              borderBottom: pill ? 'none' : '2px solid ' + (on ? 'var(--honey-500)' : 'transparent'), transition: 'color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)' }}>
            {tab.icon && <Icon name={tab.icon} size={16} />}{tab.label}
            {tab.count !== undefined && <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', background: 'var(--hive-100)', padding: '0 6px', borderRadius: 'var(--radius-full)' }}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
