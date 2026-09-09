import { Badge, Button, Card, Icon, Input, Select, Switch } from '@dailybee/ui';
import type { Settings } from '@shared/types';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';
import { ScrollArea, Topbar } from './Shell';

const TIMEZONES = ['Europe/Stockholm', 'Europe/London', 'Europe/Berlin', 'Europe/Bucharest', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
const PLATFORM_LABEL: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

export function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const permissions = useStore((s) => s.permissions);
  const sync = useStore((s) => s.sync);
  const { updateSettings, requestPermission, refreshPermissions, showToast } = useStore.getState();
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [capture, setCapture] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Settings can change elsewhere (tray, widget, Reports); only refresh the form while it has no unsaved edits.
  useEffect(() => { if (!dirty) setDraft(settings); }, [settings, dirty]);
  useEffect(() => { void refreshPermissions(); }, [refreshPermissions]);
  if (!draft) return <><Topbar title="Settings" /></>;
  const tz = TIMEZONES.includes(draft.profile.timezone) ? TIMEZONES : [draft.profile.timezone, ...TIMEZONES];
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => { setDraft({ ...draft, [k]: { ...(draft[k] as object), ...v } as Settings[K] }); setDirty(true); };
  const save = async () => {
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(draft.policy.reportTime.trim())) { showToast('“Send at” must be a time like 18:00', 'danger'); return false; }
    await updateSettings({ ...draft, policy: { ...draft.policy, reportTime: draft.policy.reportTime.trim() } });
    setDirty(false);
    showToast('Settings saved');
    return true;
  };
  const syncNow = async () => {
    if (dirty && !(await save())) return;
    const s = await api.sync.pushNow();
    showToast(s.lastError ? 'Sync failed — ' + s.lastError : 'Synced', s.lastError ? 'danger' : 'success');
  };
  const testCapture = async () => {
    try {
      const r = await api.settings.testCapture();
      setCapture(`${r.app}${r.title ? ' · ' + r.title : ''}${r.url ? ' · ' + r.url : ''} (${r.urlSource === 'none' ? 'app only' : 'page via ' + r.urlSource})`);
    } catch (e) { setCapture('Capture failed: ' + (e instanceof Error ? e.message : String(e))); }
  };
  return (
    <>
      <Topbar title="Settings" />
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 640 }}>
        <Card title="Profile" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Name" value={draft.profile.name} onChange={(e) => set('profile', { name: e.target.value, initials: initialsOf(e.target.value) })} />
            <Input label="Email" value={draft.profile.email} onChange={(e) => set('profile', { email: e.target.value })} />
            <Select label="Timezone" value={draft.profile.timezone} onChange={(e) => set('profile', { timezone: e.target.value })} options={tz} />
          </div>
        </Card>
        <Card title="Tracking" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, alignItems: 'start' }}>
              <Switch checked={draft.tracking.idleDetection} onChange={(v) => set('tracking', { idleDetection: v })} label="Idle detection" description={`Pause the timer after ${draft.tracking.idleMinutes} min without input; lock and sleep always pause`} />
              <Input label="Pause after" type="number" min={1} max={120} mono value={String(draft.tracking.idleMinutes)} onChange={(e) => set('tracking', { idleMinutes: Math.min(120, Math.max(1, Number(e.target.value) || 10)) })} hint="minutes" disabled={!draft.tracking.idleDetection} />
            </div>
            <Switch checked={draft.tracking.roundTo5} onChange={(v) => set('tracking', { roundTo5: v })} label="Round entries to 5 min" description="In the daily report only; the live view keeps exact time" />
            <Switch checked={draft.tracking.captureBrowser} onChange={(v) => set('tracking', { captureBrowser: v })} label="Capture browser tabs & pages" description="Read from the browser via system accessibility — no extension needed" />
            <Switch checked={draft.tracking.startOnCommit} onChange={(v) => set('tracking', { startOnCommit: v })} label="Start timer on git commit" description="Requires the CLI: run “node scripts/dailybee.mjs hook install” inside a repository. A commit while no task runs starts one named after the commit" />
            <Switch checked={draft.widget.enabled} onChange={(v) => set('widget', { enabled: v })} label="Floating widget" description="Small always-on-top window with the timer, task and current tab. Drag it anywhere; double-click opens DailyBee" />
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Closing the window keeps DailyBee tracking in the background. Quit from the tray icon.</div>
          </div>
        </Card>
        <Card title="Check-ins" meta="while a task is running" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Switch checked={draft.policy.fullscreenWarning} onChange={(v) => set('policy', { fullscreenWarning: v })} label="Full-screen warning on distraction sites" description="Covers the screen with a check-in when a site or app categorised as distraction is in front" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Warn after" type="number" min={3} max={600} mono value={String(draft.policy.warningSeconds)} onChange={(e) => set('policy', { warningSeconds: Math.max(3, Number(e.target.value) || 20) })} hint="seconds on the site" disabled={!draft.policy.fullscreenWarning} />
              <Input label="Quiet after “Taking a break”" type="number" min={1} max={180} mono value={String(draft.policy.snoozeMinutes)} onChange={(e) => set('policy', { snoozeMinutes: Math.max(1, Number(e.target.value) || 15) })} hint="minutes without warnings" disabled={!draft.policy.fullscreenWarning} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Drift popup after" type="number" min={1} max={120} mono value={String(draft.policy.driftMinutes)} onChange={(e) => set('policy', { driftMinutes: Math.max(1, Number(e.target.value) || 8) })} hint={draft.policy.fullscreenWarning ? 'minutes · used when the full-screen warning is off' : 'minutes on a distraction site'} />
            </div>
            <Switch checked={draft.policy.halfwayCheckin} onChange={(v) => set('policy', { halfwayCheckin: v })} label="Halfway check-in" description="At 50% of the task's size estimate" />
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>What counts as distraction follows the category of the site or app. Use the tag button on a page row, or “This is work” on a warning, to change it.</div>
          </div>
        </Card>
        <Card title="System permissions" meta={PLATFORM_LABEL[api.platform] ?? api.platform} padding={20} actions={<Button size="sm" variant="ghost" icon="scan-eye" onClick={() => void testCapture()}>Test capture</Button>}>
          <div style={{ display: 'grid', gap: 12 }}>
            {permissions.map((p) => {
              const ok = p.state === 'granted' || p.state === 'not-required';
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon name={ok ? 'check-circle-2' : 'alert-circle'} size={18} style={{ color: ok ? 'var(--success)' : 'var(--warning)' }} />
                  <div style={{ flex: 1, display: 'grid', gap: 2 }}>
                    <span style={{ font: 'var(--type-label)' }}>{p.name}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{p.description}</span>
                  </div>
                  {p.state === 'granted' ? <Badge tone="success" size="sm">Granted</Badge>
                    : p.state === 'not-required' ? <Badge tone="neutral" size="sm">Built in</Badge>
                    : p.requestable ? <Button size="sm" variant="secondary" onClick={() => void requestPermission(p.id)}>Grant</Button>
                    : <Badge tone="warning" size="sm">{p.state === 'denied' ? 'Unavailable' : 'Unknown'}</Badge>}
                </div>
              );
            })}
            {capture && <div style={{ font: 'var(--type-caption)', color: 'var(--text-secondary)', padding: '8px 10px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)' }}>{capture}</div>}
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Without a permission, DailyBee falls back to app names only. URLs never leave this device.</div>
          </div>
        </Card>
        <Card title="Delivery" meta="daily report" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Send at" value={draft.policy.reportTime} mono onChange={(e) => set('policy', { reportTime: e.target.value })} hint="Weekdays, local time" />
              <Input label="Slack channel" value={draft.delivery.slackChannel} onChange={(e) => set('delivery', { slackChannel: e.target.value })} />
            </div>
            <Input label="Slack incoming webhook" value={draft.delivery.slackWebhookUrl} mono placeholder="https://hooks.slack.com/services/…" onChange={(e) => set('delivery', { slackWebhookUrl: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Email to" value={draft.delivery.emailTo} placeholder="team@example.com" onChange={(e) => set('delivery', { emailTo: e.target.value })} />
              <Input label="SMTP URL" value={draft.delivery.smtpUrl} mono placeholder="smtp://user:pass@host:587" onChange={(e) => set('delivery', { smtpUrl: e.target.value })} />
            </div>
            <Switch checked={draft.delivery.llmPolish} onChange={(v) => set('delivery', { llmPolish: v })} label="Polish wording with Claude" description="Template first; the model only tightens prose. Off by default." />
            {draft.delivery.llmPolish && <Input label="Anthropic API key" type="password" mono value={draft.delivery.anthropicApiKey} onChange={(e) => set('delivery', { anthropicApiKey: e.target.value })} />}
          </div>
        </Card>
        <Card title="Workspace" meta="team sync" padding={20} actions={sync?.configured || draft.workspace.apiUrl ? <Button size="sm" variant="ghost" icon="refresh-cw" onClick={() => void syncNow()}>Sync now</Button> : undefined}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <Input label="API URL" value={draft.workspace.apiUrl} mono placeholder="https://api.dailybee.dev" onChange={(e) => set('workspace', { apiUrl: e.target.value })} />
              <Input label="Team" value={draft.workspace.teamName} onChange={(e) => set('workspace', { teamName: e.target.value })} />
            </div>
            <Input label="Access token" type="password" mono value={draft.workspace.token} onChange={(e) => set('workspace', { token: e.target.value })} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
              <Icon name="lock" size={14} />
              <span style={{ flex: 1 }}>{sync?.shares ?? 'Entries, outcomes, check-in answers, app names and category mix. Never URLs or window titles.'}</span>
              {sync?.configured && <Badge size="sm" tone={sync.lastError ? 'danger' : sync.connected ? 'success' : 'neutral'}>{sync.lastError ? 'Error' : sync.connected ? 'Connected' : 'Not synced yet'}</Badge>}
            </div>
          </div>
        </Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Button onClick={() => void save()}>Save changes</Button>{dirty && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Unsaved changes</span>}</div>
      </div>
      </ScrollArea>
    </>
  );
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '··';
}
