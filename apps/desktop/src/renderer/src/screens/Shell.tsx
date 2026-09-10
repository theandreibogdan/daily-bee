import { Avatar, Icon, IconButton, StatusDot, Tooltip, formatDay } from '@dailybee/ui';
import type { AccountStatus, ScreenId } from '@shared/types';
import { Fragment, useState, type ReactNode } from 'react';
import { NotificationsButton } from '../components/Notifications';
import { useStore } from '../store';

export const NAV: Array<{ id: ScreenId; label: string; icon: string; section?: string }> = [
  { id: 'today', label: 'Today', icon: 'timer' },
  { id: 'reports', label: 'Reports', icon: 'file-text' },
  { id: 'team', label: 'Team', icon: 'users' },
  { id: 'tasks', label: 'Tasks', icon: 'list-checks' },
  { id: 'projects', label: 'Projects', icon: 'folder', section: 'Manage' },
  { id: 'admin', label: 'Admin', icon: 'shield', section: 'Manage' },
];

/** The screens this install shows: Solo keeps everything local (no Team/Admin, its own Projects); Team members get no Admin. */
export function navFor(account: AccountStatus | null): typeof NAV {
  const mode = account?.mode ?? 'team';
  const role = account?.role ?? 'admin';
  return NAV.filter((n) => {
    if (n.id === 'projects') return mode === 'solo';
    if (n.id === 'team') return mode === 'team';
    if (n.id === 'admin') return mode === 'team' && role === 'admin';
    return true;
  });
}

export function Sidebar({ active, onNav, running }: { active: ScreenId; onNav: (s: ScreenId) => void; running: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const profile = useStore((s) => s.settings?.profile);
  const teamName = useStore((s) => s.settings?.workspace.teamName);
  const sync = useStore((s) => s.sync);
  const account = useStore((s) => s.account);
  const items = navFor(account);
  // Real plan line: a solo profile on this device, or the workspace and its sync state.
  const role = account?.role === 'member' ? 'member' : 'admin';
  const plan = account?.mode === 'solo' ? 'Solo · on this device'
    : sync?.configured ? `${account?.workspace?.name || teamName || 'Workspace'} · ${role} · ${sync.lastError ? 'sync failed' : sync.connected ? 'synced' : 'not synced yet'}`
    : account?.workspace ? `${account.workspace.name} · ${role} · demo`
    : 'Team · not signed in';
  return (
    <aside style={{ width: 'var(--sidebar-w)', flexShrink: 0, background: 'var(--bg-app)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', padding: '16px 12px', gap: 4, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 20px' }}>
        <span style={{ width: 20, height: 20, background: 'var(--honey-500)', borderRadius: 'var(--radius-xs)' }} />
        <span style={{ font: '800 20px/1 var(--font-display)', letterSpacing: '-0.03em' }}>DailyBee</span>
      </div>
      {items.map((n) => {
        const on = n.id === active;
        return (
          <Fragment key={n.id}>
            {n.section && <div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '16px 10px 6px' }}>{n.section}</div>}
            <button type="button" data-tour={'nav-' + n.id} onClick={() => onNav(n.id)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', border: 0, borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left', font: 'var(--type-label)', position: 'relative',
                background: on ? 'var(--surface-accent-soft)' : hover === n.id ? 'var(--hive-100)' : 'transparent', color: on ? 'var(--hive-900)' : 'var(--text-secondary)', transition: 'background var(--dur-fast) var(--ease-out)' }}>
              {on && <span style={{ position: 'absolute', left: -12, top: 8, bottom: 8, width: 2, background: 'var(--honey-500)', borderRadius: 1 }} />}
              <Icon name={n.icon} size={20} />{n.label}
              {n.id === 'today' && running && <StatusDot status="tracking" style={{ marginLeft: 'auto' }} />}
            </button>
          </Fragment>
        );
      })}
      <div style={{ flex: 1 }} />
      <button type="button" data-tour="nav-settings" onClick={() => onNav('settings')} onMouseEnter={() => setHover('s')} onMouseLeave={() => setHover(null)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', border: 0, borderRadius: 'var(--radius-md)', cursor: 'pointer', font: 'var(--type-label)', position: 'relative', background: active === 'settings' ? 'var(--surface-accent-soft)' : hover === 's' ? 'var(--hive-100)' : 'transparent', color: active === 'settings' ? 'var(--hive-900)' : 'var(--text-secondary)' }}>
        {active === 'settings' && <span style={{ position: 'absolute', left: -12, top: 8, bottom: 8, width: 2, background: 'var(--honey-500)', borderRadius: 1 }} />}
        <Icon name="settings" size={20} />Settings
      </button>
      <button type="button" onClick={() => onNav('settings')} title="Profile and workspace settings"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px 0', borderTop: '1px solid var(--border-subtle)', marginTop: 8, background: 'transparent', border: 0, borderRadius: 0, cursor: 'pointer', textAlign: 'left', width: '100%', color: 'inherit', font: 'inherit' }}>
        <Avatar initials={profile?.initials ?? '··'} src={profile?.avatar} tracking={running} />
        <div style={{ minWidth: 0 }}>
          <div style={{ font: 'var(--type-label)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.name ?? '—'}</div>
          <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan}</div>
        </div>
      </button>
    </aside>
  );
}

/** The screen's scrolling region: everything below the top bar. Title bar, sidebar and top bar never scroll. */
export function ScrollArea({ children }: { children: ReactNode }) {
  return (
    <div className="db-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      {children}
    </div>
  );
}

export function Topbar({ title, children }: { title: string; children?: ReactNode }) {
  const setPalette = useStore((s) => s.setPalette);
  return (
    <header style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 24px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-app)', position: 'relative', zIndex: 5, flexShrink: 0 }}>
      <h1 style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-tight)', whiteSpace: 'nowrap' }}>{title}</h1>
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginLeft: 4, whiteSpace: 'nowrap' }}>{formatDay()}</span>
      <div style={{ flex: 1 }} />
      {children}
      {/* Top-bar tooltips open downwards: above them is only the window edge / title bar. */}
      <Tooltip content={`Search  ${navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'}K`} side="bottom"><IconButton icon="search" label="Search" onClick={() => setPalette(true)} /></Tooltip>
      <NotificationsButton />
    </header>
  );
}
