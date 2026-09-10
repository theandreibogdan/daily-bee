import { Button, Dialog, Icon } from '@dailybee/ui';
import { api } from '../bridge';
import { useStore } from '../store';

/** Shown once after DailyBee comes back in a new version: the release notes saved when the update downloaded. */
export function WhatsNewDialog() {
  const updates = useStore((s) => s.updates);
  const w = updates?.whatsNew;
  if (!w) return null;
  const close = () => { void api.updates.whatsNewSeen(); };
  return (
    <Dialog open onClose={close} width={520} title={`What's new in DailyBee ${w.version}`} description="You are running the update that was downloaded last time."
      footer={<Button icon="check" onClick={close}>Got it</Button>}>
      {w.notes.trim()
        ? <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{w.notes.trim()}</div>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}><Icon name="info" size={16} />This release came without notes.</div>}
    </Dialog>
  );
}
