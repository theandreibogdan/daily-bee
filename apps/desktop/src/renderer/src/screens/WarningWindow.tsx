import { Button, Icon } from '@dailybee/ui';
import type { Checkin } from '@shared/types';
import { useEffect, useState } from 'react';
import { api } from '../bridge';

/**
 * Full-screen distraction warning. Rendered in its own transparent always-on-top window
 * (renderer?view=warning) that covers the display, so it shows over whatever is in front.
 * The answers are the drift check-in's: they go into the daily report.
 */
export function WarningCard({ checkin, onAnswer }: { checkin: Checkin; onAnswer: (a: string) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onAnswer('dismiss'); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onAnswer]);
  return (
    <div role="alertdialog" aria-modal="true" aria-label="Distraction warning"
      style={{ width: 520, maxWidth: 'calc(100% - 48px)', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', padding: 24, display: 'grid', gap: 16, animation: 'db-rise var(--dur-slow) var(--ease-out)', font: 'var(--type-body)', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ display: 'inline-flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--danger-bg)', color: 'var(--danger-text)', flexShrink: 0 }}><Icon name="eye-off" size={20} /></span>
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <h2 style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-tight)', margin: 0 }}>Drifting?</h2>
          <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-secondary)', textWrap: 'pretty' }}>{checkin.text}</p>
          {checkin.domain && <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{checkin.domain} is categorised as distraction. “This is work” recategorises it and stops these warnings for it.</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={() => onAnswer('relevant')}>This is work</Button>
        <Button variant="secondary" onClick={() => onAnswer('break')}>Taking a break</Button>
        <Button icon="play" onClick={() => onAnswer('back')}>Back to it</Button>
      </div>
      <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{checkin.at} · answers go into your daily report · Esc to dismiss</div>
    </div>
  );
}

/** Content of the full-screen overlay window: dim scrim + centred warning card. */
export function WarningWindow() {
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return api.checkins.onPrompt((c) => setCheckin(c && c.kind === 'warning' ? c : null));
  }, []);
  if (!checkin) return null;
  const answer = (a: string) => { void api.checkins.answer(checkin.id, a); setCheckin(null); };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'db-fade var(--dur-slow) var(--ease-out)' }}>
      <WarningCard checkin={checkin} onAnswer={answer} />
    </div>
  );
}
