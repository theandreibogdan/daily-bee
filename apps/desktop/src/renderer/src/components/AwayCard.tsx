import { Button, Icon, IconButton, formatClock, formatDuration } from '@dailybee/ui';
import type { AwayChoice, AwayPrompt } from '@shared/types';

const REASON: Record<AwayPrompt['reason'], string> = { idle: 'idle', lock: 'away with the screen locked', sleep: 'away while the machine slept' };

/**
 * The question after time away while a task was running (main/services/away.ts). The timer already
 * left the stretch out and is running again; this offers to count it after all, or to end the task
 * at the moment you left. Shown in the app when it is in front, in the floating window otherwise.
 */
export function AwayCard({ prompt, onChoose, fixed = true, offset = 0 }: { prompt: AwayPrompt; onChoose: (c: AwayChoice) => void; fixed?: boolean; offset?: number }) {
  const pos = fixed ? { position: 'fixed' as const, right: 24, top: `calc(${72 + offset}px + var(--titlebar-h, 0px))`, width: 360, zIndex: 150 } : { width: 360 };
  return (
    <div role="dialog" aria-label="Time away" data-away-card style={{ ...pos, background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', padding: 16, display: 'grid', gap: 12, animation: 'db-rise var(--dur-slow) var(--ease-out)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ display: 'inline-flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--honey-50)', color: 'var(--honey-800)', flexShrink: 0 }}><Icon name="coffee" size={18} /></span>
        <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 0 }}>
          <div style={{ font: 'var(--type-label)' }}>Welcome back</div>
          <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', textWrap: 'pretty' }}>
            You were {REASON[prompt.reason]} for {formatDuration(prompt.seconds, 'short')} ({formatClock(prompt.since)}–{formatClock(prompt.until)}) while “{prompt.task}” was running. The timer left that stretch out and is running again.
          </div>
        </div>
        <IconButton icon="x" label="Leave it out" size="sm" onClick={() => onChoose('discard')} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => onChoose('discard')}>Leave it out</Button>
        <Button size="sm" variant="secondary" icon="plus" onClick={() => onChoose('keep')}>Count it as work</Button>
        <Button size="sm" variant="ghost" icon="circle-stop" onClick={() => onChoose('stop')}>Stop at {formatClock(prompt.since)}</Button>
      </div>
      <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Your choice goes into the change log and the bell</div>
    </div>
  );
}
