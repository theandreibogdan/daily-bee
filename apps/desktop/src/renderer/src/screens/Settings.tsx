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
  useEffect(() => { setDraft(settings); }, [settings]);
  useEffect(() => { void refreshPermissions(); }, [refreshPermissions]);
  if (!draft) return <><Topbar title="Settings" /></>;
  const tz = TIMEZONES.includes(draft.profile.timezone) ? TIMEZONES : [draft.profile.timezone, ...TIMEZONES];
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => setDraft({ ...draft, [k]: { ...(draft[k] as object), ...v } as Settings[K] });
  const save = async () => { await updateSettings(draft); showToast('Settings saved'); };
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
            <Switch checked={draft.tracking.idleDetection} onChange={(v) => set('tracking', { idleDetection: v })} label="Idle detection" description={`Pause after ${draft.tracking.idleMinutes} min without input`} />
            <Switch checked={draft.tracking.roundTo5} onChange={(v) => set('tracking', { roundTo5: v })} label="Round entries to 5 min" />
            <Switch checked={draft.tracking.captureBrowser} onChange={(v) => set('tracking', { captureBrowser: v })} label="Capture browser tabs & pages" description="Read from the browser via system accessibility — no extension needed" />
            <Switch checked={draft.tracking.startOnCommit} onChange={(v) => set('tracking', { startOnCommit: v })} label="Start timer on git commit" description="Requires the CLI" />
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
        <Card title="Workspace" meta="team sync" padding={20} actions={sync?.configured ? <Button size="sm" variant="ghost" icon="refresh-cw" onClick={() => void api.sync.pushNow().then((s) => showToast(s.lastError ? 'Sync failed — ' + s.lastError : 'Synced', s.lastError ? 'danger' : 'success'))}>Sync now</Button> : undefined}>
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
        <div><Button onClick={() => void save()}>Save changes</Button></div>
      </div>
      </ScrollArea>
    </>
  );
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '··';
}
