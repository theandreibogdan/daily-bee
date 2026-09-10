import { Button, StatusDot, Tag, Tooltip, formatDuration } from '@dailybee/ui';
import { api } from '../bridge';
import { useStore } from '../store';

const PLATFORM: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

/**
 * Today's one-line answer to "what is DailyBee recording right now?": what is captured, whether the
 * system permission is in place, how many private apps are excluded, and the switch to pause it.
 * Pausing stops the app and tab capture only; the task timer keeps counting.
 */
export function TrackingStatus() {
  const activity = useStore((s) => s.activity);
  const settings = useStore((s) => s.settings);
  const permissions = useStore((s) => s.permissions);
  const { updateSettings, nav } = useStore.getState();
  if (!settings) return null;
  const t = settings.tracking;
  const paused = !api.demo && !t.enabled;
  const missing = permissions.filter((p) => p.state === 'denied' || p.state === 'unknown');
  const builtIn = permissions.length > 0 && permissions.every((p) => p.state === 'not-required');
  const privateApps = t.excludedApps.length;
  let headline: string;
  let detail: string;
  if (api.demo) {
    headline = 'Sample day from the design kit';
    detail = 'tracking is simulated; nothing on this computer is read';
  } else if (paused) {
    headline = 'Tracking paused';
    detail = 'apps and tabs are not recorded; the task timer keeps counting';
  } else {
    headline = t.captureBrowser ? 'Recording apps and browser tabs' : 'Recording app names and window titles';
    const permission = missing.length ? `${missing[0]!.name} permission missing, so only app names are read`
      : builtIn ? `read through ${PLATFORM[api.platform] ?? api.platform}, nothing to grant`
      : permissions.length ? 'system permissions granted' : 'checking system permissions';
    detail = (activity?.live ? '' : 'waiting for the first capture · ') + permission + (t.captureBrowser ? '' : ' · browser pages are off in Settings');
  }
  const warn = !paused && !api.demo && missing.length > 0;
  return (
    <div role="status" data-tour="tracking" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', border: '1px solid ' + (warn ? 'var(--warning)' : 'var(--border-subtle)'), borderRadius: 'var(--radius-lg)', background: paused ? 'var(--bg-sunken)' : 'var(--surface-card)', boxShadow: 'var(--shadow-xs)' }}>
      <StatusDot status={paused || api.demo ? 'idle' : activity?.live ? 'tracking' : 'idle'} pulse={false} />
      <span style={{ flex: 1, minWidth: 240, font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>
        <span style={{ font: 'var(--type-label)', color: warn ? 'var(--warning-text)' : 'var(--text-primary)' }}>{headline}</span> · {detail}
      </span>
      {privateApps > 0 && (
        <Tooltip content={t.excludedApps.join(', ')} side="bottom">
          <Tag onClick={() => nav('settings')}>{privateApps} private {privateApps === 1 ? 'app' : 'apps'} never recorded{activity?.privateSeconds ? ` · ${formatDuration(activity.privateSeconds, 'short')} today` : ''}</Tag>
        </Tooltip>
      )}
      {warn && <Button size="sm" variant="secondary" icon="shield-alert" onClick={() => nav('settings')}>Grant permission</Button>}
      {!api.demo && <Button size="sm" variant={paused ? 'primary' : 'secondary'} icon={paused ? 'eye' : 'eye-off'} onClick={() => void updateSettings({ tracking: { enabled: paused } })}>{paused ? 'Resume tracking' : 'Pause tracking'}</Button>}
    </div>
  );
}
