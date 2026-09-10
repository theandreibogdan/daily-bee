import { Avatar, Button, Card, Dialog, IconButton } from '@dailybee/ui';
import type { BackupInfo, ProfileSummary } from '@shared/types';
import { useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';

/** "Last used today" / "2 days ago" for the profile list. */
function lastUsed(ts: number, now = Date.now()): string {
  const days = Math.floor((now - ts) / 86_400_000);
  if (days <= 0) return 'Last used today';
  if (days === 1) return 'Last used yesterday';
  if (days < 30) return `Last used ${days} days ago`;
  return 'Last used ' + new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function subtitle(p: ProfileSummary): string {
  if (!p.setupDone) return 'Not set up yet';
  if (p.mode === 'solo') return 'Solo · on this device';
  return `${p.workspace ?? 'Team'} · ${p.role === 'admin' ? 'admin' : 'member'}`;
}

/**
 * Signed-out state: the profiles on this device (each with its own data), open one or create a new
 * one. Not a kit screen; built from the kit's cards, avatars and buttons like the wizard.
 */
export function ProfilesScreen() {
  const profiles = useStore((s) => s.profiles);
  const showToast = useStore((s) => s.showToast);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProfileSummary | null>(null);
  const [picked, setPicked] = useState<BackupInfo | null>(null);
  const list = profiles?.profiles ?? [];
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } catch (e) { showToast(e instanceof Error ? e.message : String(e), 'danger'); } finally { setBusy(null); }
  };
  const remove = async () => {
    const p = removing;
    if (!p) return;
    setRemoving(null);
    await run('remove', async () => { await api.profiles.remove(p.id); showToast(`Removed ${p.name || 'the profile'} and its data`); });
  };
  // A backup made on this or another machine becomes a profile here (Settings › Backup exports them).
  const pick = async () => {
    const r = await api.backup.pick();
    if (!r.file) return;
    if (!r.info) { showToast(r.message, 'danger'); return; }
    setPicked(r.info);
  };
  const restore = async () => {
    const p = picked;
    if (!p) return;
    setPicked(null);
    await run('restore', async () => { const r = await api.backup.restore(p.file, 'new'); showToast(r.message, r.ok ? 'success' : 'danger'); });
  };
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg-app)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '48px 24px' }}>
      <div style={{ width: 620, maxWidth: '100%', display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 24, height: 24, background: 'var(--honey-500)', borderRadius: 'var(--radius-xs)' }} />
          <span style={{ font: '800 22px/1 var(--font-display)', letterSpacing: '-0.03em' }}>DailyBee</span>
        </div>
        <div>
          <div style={{ font: 'var(--type-h2)', letterSpacing: 'var(--tracking-tight)' }}>Who is using DailyBee?</div>
          <div style={{ font: 'var(--type-body)', color: 'var(--text-secondary)', marginTop: 6, textWrap: 'pretty' }}>
            {list.length ? 'Pick your profile, or create a new one. Each profile keeps its own tracked days, tasks and reports on this device.' : 'No profiles on this device yet.'}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12 }} role="list" aria-label="Profiles">
          {list.map((p) => (
            <Card key={p.id} interactive padding={16} onClick={() => void run(p.id, () => api.profiles.open(p.id))}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar initials={p.initials || '··'} size={40} />
                <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
                  <div style={{ font: 'var(--type-h4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || 'New profile'}</div>
                  <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{subtitle(p)}{p.email ? ` · ${p.email}` : ''}</div>
                </div>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{busy === p.id ? 'Opening…' : lastUsed(p.lastUsedAt)}</span>
                <span onClick={(e) => e.stopPropagation()}>
                  <IconButton icon="trash-2" label={`Remove ${p.name || 'this profile'}`} size="sm" onClick={() => setRemoving(p)} />
                </span>
              </div>
            </Card>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant={list.length ? 'secondary' : 'primary'} icon="plus" disabled={busy !== null} onClick={() => void run('create', () => api.profiles.create())}>Create a new profile</Button>
          <Button variant="ghost" icon="upload" disabled={busy !== null} onClick={() => void pick()}>Restore from a backup…</Button>
        </div>
      </div>
      <Dialog open={!!picked} onClose={() => setPicked(null)} title="Restore this backup as a profile?" width={480}
        description={picked ? `${picked.name || 'A profile'}${picked.email ? ' · ' + picked.email : ''} · ${picked.entries} ${picked.entries === 1 ? 'entry' : 'entries'} across ${picked.days} ${picked.days === 1 ? 'day' : 'days'}${picked.lastDay ? ', last ' + picked.lastDay : ''}` : undefined}
        footer={<><Button variant="secondary" onClick={() => setPicked(null)}>Cancel</Button><Button icon="upload" onClick={() => void restore()}>Restore as a new profile</Button></>}>
        <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>The backup is copied in as its own profile with its password, settings and change log; nothing on this device is replaced. It opens right away.</div>
      </Dialog>
      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name || 'this profile'}?`} width={460}
        description="Its tracked days, tasks, reports and settings are deleted from this device. This cannot be undone."
        footer={<><Button variant="secondary" onClick={() => setRemoving(null)}>Keep it</Button><Button variant="danger" icon="trash-2" onClick={() => void remove()}>Remove profile</Button></>}>
        {removing?.mode === 'team' && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>The workspace account itself is not affected; only this device's copy goes.</div>}
      </Dialog>
    </div>
  );
}
