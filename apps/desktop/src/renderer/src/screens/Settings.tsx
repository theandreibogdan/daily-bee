import { Badge, Button, Card, Dialog, Icon, Input, Select, Switch, Tag } from '@dailybee/ui';
import type { BackupInfo, BackupStatus, Settings, StartupStatus } from '@shared/types';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';
import { describeServer } from '../cloud';
import { reducesMotion, systemReducesMotion } from '../motion';
import { ProfilePictureRow } from '../components/AvatarPicker';
import { SecurityQuestionsFields, emptyRecovery, recoveryComplete, recoveryPayload, type RecoveryDraft } from '../components/SecurityQuestions';
import { ScrollArea, Topbar } from './Shell';

const TIMEZONES = ['Europe/Stockholm', 'Europe/London', 'Europe/Berlin', 'Europe/Bucharest', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
const PLATFORM_LABEL: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

export function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const permissions = useStore((s) => s.permissions);
  const sync = useStore((s) => s.sync);
  const account = useStore((s) => s.account);
  const activity = useStore((s) => s.activity);
  const { updateSettings, requestPermission, refreshPermissions, showToast, triggerCheckin } = useStore.getState();
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [capture, setCapture] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // What the operating system says about the login item, refreshed when the saved startup settings change.
  const [startup, setStartup] = useState<StartupStatus | null>(null);
  const launchAtLogin = settings?.startup.launchAtLogin, startInTray = settings?.startup.startInTray;
  useEffect(() => { void api.settings.startup().then(setStartup).catch(() => setStartup(null)); }, [launchAtLogin, startInTray]);
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
        <AccountCard />
        <Card title="Profile" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            {/* The picture saves on its own; the draft only follows so a later Save changes does not undo it. */}
            <ProfilePictureRow avatar={draft.profile.avatar} initials={draft.profile.initials} onSaved={(avatar) => setDraft((d) => (d ? { ...d, profile: { ...d.profile, avatar } } : d))} />
            <Input label="Name" value={draft.profile.name} onChange={(e) => set('profile', { name: e.target.value, initials: initialsOf(e.target.value) })} />
            <Input label="Email" value={draft.profile.email} onChange={(e) => set('profile', { email: e.target.value })} />
            <Select label="Timezone" value={draft.profile.timezone} onChange={(e) => set('profile', { timezone: e.target.value })} options={tz} />
          </div>
        </Card>
        <Card title="Tracking" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Switch checked={draft.tracking.enabled} onChange={(v) => set('tracking', { enabled: v })} label="Record apps and browser tabs" description="Pause it from Today or the tray whenever you need privacy; the task timer keeps counting" />
            <PrivateApps value={draft.tracking.excludedApps} onChange={(list) => set('tracking', { excludedApps: list })} suggestions={activity?.rows.map((r) => r.app) ?? []} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, alignItems: 'start' }}>
              <Switch checked={draft.tracking.idleDetection} onChange={(v) => set('tracking', { idleDetection: v })} label="Idle detection" description={`Pause the timer after ${draft.tracking.idleMinutes} min without input; lock and sleep always pause`} />
              <Input label="Pause after" type="number" min={1} max={120} mono value={String(draft.tracking.idleMinutes)} onChange={(e) => set('tracking', { idleMinutes: Math.min(120, Math.max(1, Number(e.target.value) || 10)) })} hint="minutes" disabled={!draft.tracking.idleDetection} />
            </div>
            <Switch checked={draft.tracking.awayPrompt} onChange={(v) => set('tracking', { awayPrompt: v })} label="Ask about time away" description="When you come back after idle, lock or sleep while a task runs: leave the time out, count it as work, or stop the task when you left" />
            <Switch checked={draft.tracking.roundTo5} onChange={(v) => set('tracking', { roundTo5: v })} label="Round entries to 5 min" description="In the daily report only; the live view keeps exact time" />
            <Switch checked={draft.tracking.captureBrowser} onChange={(v) => set('tracking', { captureBrowser: v })} label="Capture browser tabs & pages" description="Read from the browser via system accessibility — no extension needed" />
            <Switch checked={draft.tracking.startOnCommit} onChange={(v) => set('tracking', { startOnCommit: v })} label="Start timer on git commit" description="Requires the CLI: run “node scripts/dailybee.mjs hook install” inside a repository. A commit while no task runs starts one named after the commit" />
            <Switch checked={draft.widget.enabled} onChange={(v) => set('widget', { enabled: v })} label="Floating widget" description="Small always-on-top window with the timer, task and current tab. Drag it anywhere; double-click opens DailyBee" />
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Closing the window keeps DailyBee tracking in the background. Quit from the tray icon.</div>
          </div>
        </Card>
        <Card title="Startup" meta="with the system" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Switch checked={draft.startup.launchAtLogin} onChange={(v) => set('startup', { launchAtLogin: v })} label="Launch at login" description="DailyBee starts when you sign in, so tracking is on from the first minute of the day" />
            <Switch checked={draft.startup.startInTray} disabled={!draft.startup.launchAtLogin} onChange={(v) => set('startup', { startInTray: v })} label="Start in the tray" description="A login launch opens no window; open DailyBee from the tray icon when you need it" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
              <Icon name={startup?.supported ? (startup.openAtLogin ? 'check-circle-2' : 'circle') : 'info'} size={14} style={{ color: startup?.openAtLogin ? 'var(--success)' : 'var(--text-tertiary)' }} />
              <span>{startup === null ? 'Checking the system…' : startup.supported ? (startup.openAtLogin ? `Registered with ${PLATFORM_LABEL[api.platform] ?? 'the system'} for your user account, whichever profile is open.` : `Not registered with ${PLATFORM_LABEL[api.platform] ?? 'the system'}. Save with “Launch at login” on to register.`) : 'This is a development build: the switches are saved and take effect in the installed app.'}</span>
            </div>
          </div>
        </Card>
        <Card title="Appearance" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Switch checked={reducesMotion(draft.appearance.reduceMotion)} onChange={(v) => set('appearance', { reduceMotion: v })} label="Reduce animations" description="Cuts the pulsing start button, dialog motion and the tour's gliding spotlight to a single frame" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
              <span style={{ flex: 1 }}>{draft.appearance.reduceMotion === null ? `Following the system setting: ${systemReducesMotion() ? 'reduce motion is on' : 'animations are on'} in ${PLATFORM_LABEL[api.platform] ?? api.platform}.` : 'Set here; the system setting is ignored.'}</span>
              {draft.appearance.reduceMotion !== null && <Button size="sm" variant="ghost" onClick={() => set('appearance', { reduceMotion: null })}>Use the system setting</Button>}
            </div>
          </div>
        </Card>
        <Card title="Check-ins" meta="while a task is running" padding={20} actions={<Button size="sm" variant="ghost" icon="bell-ring" onClick={() => void triggerCheckin()}>Send a test check-in</Button>}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>A check-in appears as a popup while DailyBee is in front, as a small floating window when another app is, and as a full-screen warning when that is switched on. Every check-in is also kept under the bell.</div>
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
        <Card title="Notifications" meta="the bell, and your desktop" padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Switch checked={draft.notifications.desktop} onChange={(v) => set('notifications', { desktop: v })} label="Desktop notifications" description="A report sent or not sent, a drafted report and sync problems also show as system notifications while DailyBee is in the background" />
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>The bell in the top bar keeps task starts and stops, timer pauses, check-ins, reports and sync for 30 days.</div>
          </div>
        </Card>
        <BackupCard />
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
        {account?.mode !== 'solo' && <Card title="Workspace" meta="team sync" padding={20} actions={sync?.configured || draft.workspace.apiUrl ? <Button size="sm" variant="ghost" icon="refresh-cw" onClick={() => void syncNow()}>Sync now</Button> : undefined}>
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
        </Card>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Button onClick={() => void save()}>Save changes</Button>{dirty && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Unsaved changes</span>}</div>
        <TourRow />
        <SignOutRow />
      </div>
      </ScrollArea>
    </>
  );
}

/** Who is signed in on this install: the Solo profile (lock, change password) or the workspace account (join code, sign out). */
function AccountCard() {
  const account = useStore((s) => s.account);
  const showToast = useStore((s) => s.showToast);
  const setConverting = useStore((s) => s.setConverting);
  if (!account?.setupDone) return null;
  const solo = account.mode === 'solo';
  return (
    <Card title="Account" meta={solo ? 'solo · stored on this device' : `team · ${account.role === 'admin' ? 'admin' : 'member'}`} padding={20}
      actions={<div style={{ display: 'flex', gap: 8 }}>{solo && account.hasPassword && <Button size="sm" variant="secondary" icon="lock" onClick={() => void api.account.lock()}>Lock now</Button>}<Button size="sm" variant="ghost" icon="repeat" onClick={() => setConverting(true)}>Solo or Team…</Button></div>}>
      <div style={{ display: 'grid', gap: 14 }}>
        {solo
          ? <>
            <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{account.name} · your data never leaves this device and everything works offline.</div>
            <PasswordBlock />
            <SecurityBlock questions={account.securityQuestions} />
          </>
          : <>
            <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{account.email} · {account.role === 'admin' ? 'admin' : 'member'} in {account.workspace?.name} · {describeServer(account.workspace?.apiUrl) === 'DailyBee Cloud' ? 'DailyBee Cloud' : `server ${account.workspace?.apiUrl}`}</div>
            {account.workspace?.inviteCode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-body-sm)', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Join code for teammates</span>
                <span style={{ font: 'var(--type-mono)' }}>{account.workspace.inviteCode}</span>
                <Button size="sm" variant="ghost" icon="copy" onClick={() => { void api.ui.copyText(`Join the ${account.workspace!.name} workspace on DailyBee\nServer: ${describeServer(account.workspace!.apiUrl)}\nJoin code: ${account.workspace!.inviteCode}\nIn DailyBee: Team use → Team member → Join with a code.`); showToast('Join code copied with the server address'); }}>Copy</Button>
              </div>
            )}
          </>}
      </div>
    </Card>
  );
}

/** Replay the guided first run. */
function TourRow() {
  const setTour = useStore((s) => s.setTour);
  if (api.demo) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
      <Button size="sm" variant="ghost" icon="compass" onClick={() => setTour(true)}>Show the tour</Button>
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Two minutes through the basics, starting on Today.</span>
    </div>
  );
}

/** Last thing on the page: sign out closes the open profile and shows the profile list. */
function SignOutRow() {
  const account = useStore((s) => s.account);
  const [confirm, setConfirm] = useState(false);
  if (!account?.setupDone) return null;
  const solo = account.mode === 'solo';
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
      {!confirm
        ? <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button size="sm" variant="ghost" icon="log-out" onClick={() => setConfirm(true)}>Sign out</Button>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{solo ? `Closes ${account.name}'s profile and shows the profile list` : `Signs ${account.name} out of ${account.workspace?.name ?? 'the workspace'} on this device`}</span>
        </div>
        : <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', display: 'grid', gap: 8 }}>
          <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{solo ? 'Signing out closes this profile and shows the profile list; open it again with your password. Your tracked days, tasks and projects stay on this device.' : 'Signing out drops the workspace token on this device and shows the profile list; your local data stays and you sign in again from there.'}</div>
          <div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button size="sm" onClick={() => void api.profiles.close()}>Sign out</Button></div>
        </div>}
    </div>
  );
}

/** The solo profile's password: a row until you change it, then the three fields. */
function PasswordBlock() {
  const showToast = useStore((s) => s.showToast);
  const [editing, setEditing] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setEditing(false); setCur(''); setNext(''); setConfirm(''); };
  const change = async () => {
    setBusy(true);
    try { const r = await api.account.changePassword(cur, next); showToast(r.message, r.ok ? 'success' : 'danger'); if (r.ok) close(); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'grid', gap: 12, paddingTop: 12, borderTop: '1px solid var(--hive-100)' }}>
      {!editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ font: 'var(--type-label)' }}>Password</div>
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 2 }}>Asked at every launch and after Lock now. Stored only on this device.</div>
          </div>
          <Button size="sm" variant="secondary" icon="key-round" onClick={() => setEditing(true)}>Change</Button>
        </div>
      )}
      {editing && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Input label="Current password" type="password" value={cur} autoFocus onChange={(e) => setCur(e.target.value)} />
            <Input label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            <Input label="Confirm new password" type="password" value={confirm} error={confirm && confirm !== next ? 'Does not match' : null} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={close}>Cancel</Button>
            <Button size="sm" icon="check" disabled={busy || !cur || !next || next !== confirm} onClick={() => void change()}>Save password</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The solo profile's security questions: shown, and set or changed with the current password. */
function SecurityBlock({ questions }: { questions: string[] }) {
  const showToast = useStore((s) => s.showToast);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RecoveryDraft>(emptyRecovery);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setEditing(false); setPw(''); setDraft(emptyRecovery()); };
  const save = async () => {
    setBusy(true);
    try { const r = await api.account.setRecovery(pw, recoveryPayload(draft)); showToast(r.message, r.ok ? 'success' : 'danger'); if (r.ok) close(); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'grid', gap: 12, paddingTop: 12, borderTop: '1px solid var(--hive-100)' }}>
      {!editing && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ font: 'var(--type-label)' }}>Security questions</div>
          <div style={{ font: 'var(--type-caption)', color: questions.length ? 'var(--text-tertiary)' : 'var(--warning)', marginTop: 2 }}>{questions.length ? questions.join(' · ') : 'None set. Without them a forgotten password cannot be reset.'}</div>
        </div>
        <Button size="sm" variant="secondary" icon="shield" onClick={() => setEditing(true)}>{questions.length ? 'Change' : 'Set up'}</Button>
      </div>
      )}
      {editing && (
        <div style={{ display: 'grid', gap: 12 }}>
          <SecurityQuestionsFields value={draft} onChange={setDraft} hint="Pick two questions only you can answer. Answers are stored hashed, like the password." />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 12, alignItems: 'end' }}>
            <Input label="Your password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <Button size="sm" variant="secondary" onClick={close}>Cancel</Button>
            <Button size="sm" icon="check" disabled={busy || !pw || !recoveryComplete(draft)} onClick={() => void save()}>Save questions</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Settings › Tracking › Private apps: never recorded. Suggestions come from what was seen today. */
function PrivateApps({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('');
  const has = (name: string) => value.some((x) => x.toLowerCase() === name.toLowerCase());
  const add = (name: string) => { const v = name.trim(); if (!v) return; if (!has(v)) onChange([...value, v]); setText(''); };
  const pool = [...new Set(suggestions)].filter((s) => s && !has(s)).slice(0, 8);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ font: 'var(--type-label)' }}>Private apps</div>
      <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Never recorded: no titles, no pages, no time. Their minutes show as a gap in the timeline, and today's captures of a newly added app are removed.</div>
      {value.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{value.map((a) => <Tag key={a} onRemove={() => onChange(value.filter((x) => x !== a))}>{a}</Tag>)}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
        <Input aria-label="Private app name" list="db-private-apps" value={text} placeholder="App name, e.g. Signal or 1Password" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }} />
        <Button variant="secondary" icon="plus" disabled={!text.trim()} onClick={() => add(text)}>Add</Button>
        <datalist id="db-private-apps">{pool.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      {pool.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Seen today:</span>{pool.map((s) => <Tag key={s} onClick={() => add(s)}>{s}</Tag>)}</div>}
    </div>
  );
}

const fmtSize = (b: number): string => (b >= 1_048_576 ? (b / 1_048_576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

/** Settings › Backup: export the profile's database, or restore a copy into this profile. */
function BackupCard() {
  const account = useStore((s) => s.account);
  const showToast = useStore((s) => s.showToast);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [picked, setPicked] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => api.backup.status().then(setStatus).catch(() => setStatus(null));
  useEffect(() => { void refresh(); }, []);
  const exportNow = async () => {
    setBusy(true);
    try { const r = await api.backup.export(); if (!r.ok && r.message !== 'Backup cancelled') showToast(r.message, 'danger'); await refresh(); } finally { setBusy(false); }
  };
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
    setBusy(true);
    try { const r = await api.backup.restore(p.file, 'replace'); showToast(r.message, r.ok ? 'success' : 'danger'); } finally { setBusy(false); }
  };
  const last = status?.lastBackupAt ?? null;
  const ago = last ? Math.floor((Date.now() - last) / 86_400_000) : null;
  const solo = account?.mode === 'solo';
  return (
    <Card title="Backup" meta="this profile is one file" padding={20} actions={<div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="secondary" icon="download" disabled={busy} onClick={() => void exportNow()}>Export backup…</Button><Button size="sm" variant="ghost" icon="upload" disabled={busy} onClick={() => void pick()}>Restore…</Button></div>}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-body-sm)' }}>
          <Icon name={last ? 'check-circle-2' : 'alert-circle'} size={18} style={{ color: last && (ago ?? 0) <= 30 ? 'var(--success)' : 'var(--warning)', flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{last ? `Last backup ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago'}${status?.lastFile ? ' · ' + status.lastFile : ''}` : 'Never backed up'}</span>
        </div>
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
          {solo ? 'Solo data lives only on this device: tracked days, tasks, reports, settings, the change log and your password. ' : 'Your tracked days, tasks, reports and settings live on this device; the workspace only holds the aggregates you sync. '}
          Export copies the whole profile{status ? ` (${fmtSize(status.sizeBytes)})` : ''} to a .dailybee file; keep it somewhere else.{solo ? ' A reminder lands in the bell when a month passes without one.' : ''}
        </div>
      </div>
      <Dialog open={!!picked} onClose={() => setPicked(null)} title="Restore this backup?" width={480}
        description={picked ? `${picked.name || 'A profile'}${picked.email ? ' · ' + picked.email : ''} · ${picked.entries} ${picked.entries === 1 ? 'entry' : 'entries'} across ${picked.days} ${picked.days === 1 ? 'day' : 'days'}${picked.lastDay ? ', last ' + picked.lastDay : ''}` : undefined}
        footer={<><Button variant="secondary" onClick={() => setPicked(null)}>Cancel</Button><Button icon="upload" onClick={() => void restore()}>Replace my data</Button></>}>
        <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>Everything in this profile is replaced by the backup, including its password and settings. The current data is kept next to the profile as a .before-restore file, and a running task is saved first.</div>
      </Dialog>
    </Card>
  );
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '··';
}
