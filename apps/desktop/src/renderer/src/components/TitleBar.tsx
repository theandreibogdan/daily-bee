import { Icon, StatusDot } from '@dailybee/ui';
import type { WindowState } from '@shared/api';
import { useEffect, useState, type CSSProperties } from 'react';
import { api, isElectron } from '../bridge';
import { useStore } from '../store';

/** Height in px; must match TITLEBAR_HEIGHT in the main process. */
export const TITLEBAR_HEIGHT = 40;

/** Custom title bar in Electron on Windows and macOS; Linux keeps its native frame. `?titlebar` previews it in a browser. */
export const hasCustomTitleBar = (isElectron && api.platform !== 'linux') || new URLSearchParams(window.location.search).has('titlebar');

const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/** One caption button: 46px wide, hover fills like a ghost button, close uses the danger tint. */
function CaptionButton({ label, icon, onClick, danger }: { label: string; icon: string; onClick: () => void; danger?: boolean }) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const bg = press ? (danger ? 'var(--red-500)' : 'var(--hive-200)') : hover ? (danger ? 'var(--danger-bg)' : 'var(--hive-100)') : 'transparent';
  const fg = press && danger ? '#fff' : hover ? (danger ? 'var(--danger-text)' : 'var(--text-primary)') : 'var(--text-secondary)';
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)}
      style={{ ...noDrag, width: 46, height: '100%', border: 0, padding: 0, background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)', outline: 'none' }}>
      <Icon name={icon} size={14} strokeWidth={1.5} />
    </button>
  );
}

function WindowControls() {
  const [state, setState] = useState<WindowState>({ maximized: false, focused: true });
  useEffect(() => {
    void api.window.state().then(setState);
    return api.window.onState(setState);
  }, []);
  return (
    <div style={{ ...noDrag, display: 'flex', alignSelf: 'stretch', marginLeft: 'auto', marginRight: -12 }}>
      <CaptionButton label="Minimise" icon="minus" onClick={() => void api.window.minimize()} />
      <CaptionButton label={state.maximized ? 'Restore' : 'Maximise'} icon={state.maximized ? 'copy' : 'square'} onClick={() => void api.window.toggleMaximize()} />
      <CaptionButton label="Close" icon="x" danger onClick={() => void api.window.close()} />
    </div>
  );
}

/**
 * Custom window title bar: paper background, honey mark, app name and the running task.
 * The bar is a drag region (double-click maximises). Windows gets our own minimise / maximise /
 * close buttons; macOS keeps its traffic lights on the left.
 */
export function TitleBar() {
  const running = useStore((s) => s.session.running);
  const task = useStore((s) => s.session.current?.task ?? null);
  if (!hasCustomTitleBar) return null;
  // macOS keeps its traffic lights; the in-browser preview always shows our buttons.
  const mac = isElectron && api.platform === 'darwin';
  const style = {
    position: 'relative', zIndex: 20, height: TITLEBAR_HEIGHT, flexShrink: 0,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: mac ? '0 12px 0 80px' : '0 12px',
    background: 'var(--bg-app)', borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none', WebkitAppRegion: 'drag',
  } as CSSProperties;
  return (
    <header style={style}>
      <span aria-hidden="true" style={{ width: 12, height: 12, background: 'var(--honey-500)', borderRadius: 3, flexShrink: 0 }} />
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}>DailyBee</span>
      {running && task && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
          <span aria-hidden="true">·</span>
          <StatusDot status="tracking" size={6} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task}</span>
        </span>
      )}
      {!mac && <WindowControls />}
    </header>
  );
}
