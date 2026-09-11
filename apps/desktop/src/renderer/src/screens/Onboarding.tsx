import { Button, Card, Icon, Input, Logo, Radio, StatusDot, Tabs } from '@dailybee/ui';
import type { AccountRole, ServerInfo } from '@shared/types';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';
import { CLOUD_URL, cloudAvailable, type Hosting } from '../cloud';
import { ServerGuideDialog } from '../components/ServerGuide';
import { SecurityQuestionsFields, emptyRecovery, recoveryComplete, recoveryPayload, type RecoveryDraft } from '../components/SecurityQuestions';

/**
 * First-run wizard (not a kit screen; built from the kit's cards, inputs and buttons).
 *   1. Solo or Team
 *   2. Solo → local profile with a password · Team → admin or member
 *   3. Team → sign in / create a workspace (admin) · sign in / join with a code (member)
 */
type Step = 'mode' | 'solo' | 'role' | 'team';

export interface OnboardingProps {
  /** Open on a later step: 'team' shows the sign-in form for `role` (a team profile signed out on this device) */
  start?: Step;
  role?: AccountRole;
  email?: string;
  /** A way out of the wizard next to Back: "Back to profiles", "Cancel", "Switch profile" */
  escape?: { label: string; icon?: string; onClick: () => void };
}

const PASSWORD_MIN = 6;

function Frame({ step, of, title, lead, children, back, escape }: { step: number; of: number; title: string; lead: string; children: ReactNode; back?: () => void; escape?: OnboardingProps['escape'] }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg-app)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '48px 24px' }}>
      <div style={{ width: 620, maxWidth: '100%', display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={26} />
          <span style={{ font: '800 22px/1 var(--font-display)', letterSpacing: '-0.03em' }}>DailyBee</span>
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Step {step} of {of}</span>
            <div aria-hidden="true" style={{ display: 'flex', gap: 4 }}>{Array.from({ length: of }, (_, i) => <span key={i} style={{ width: 28, height: 4, borderRadius: 'var(--radius-full)', background: i < step ? 'var(--honey-500)' : 'var(--hive-200)' }} />)}</div>
          </div>
        </div>
        <div>
          <div style={{ font: 'var(--type-h2)', letterSpacing: 'var(--tracking-tight)' }}>{title}</div>
          <div style={{ font: 'var(--type-body)', color: 'var(--text-secondary)', marginTop: 6, textWrap: 'pretty' }}>{lead}</div>
        </div>
        {children}
        {(back || escape) && (
          <div style={{ display: 'flex', gap: 8 }}>
            {back && <Button variant="ghost" size="sm" icon="arrow-left" onClick={back}>Back</Button>}
            {escape && <Button variant="ghost" size="sm" icon={escape.icon} onClick={escape.onClick}>{escape.label}</Button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Choice({ icon, title, text, selected, onClick }: { icon: string; title: string; text: string; selected: boolean; onClick: () => void }) {
  return (
    <Card interactive selected={selected} padding={20} onClick={onClick}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ display: 'inline-flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: selected ? 'var(--surface-accent-soft)' : 'var(--bg-sunken)', color: selected ? 'var(--honey-700)' : 'var(--text-secondary)', flexShrink: 0 }}><Icon name={icon} size={20} /></span>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ font: 'var(--type-h4)' }}>{title}</div>
          <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', textWrap: 'pretty' }}>{text}</div>
        </div>
      </div>
    </Card>
  );
}

/** DailyBee Cloud's health line: checking, reachable (store and version), or down with a retry. */
function CloudStatus({ cloud, onRetry }: { cloud: { state: 'checking' | 'ok' | 'down'; message: string; info?: ServerInfo } | null; onRetry: () => void }) {
  if (!cloud || cloud.state === 'checking') {
    return <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}><Icon name="loader-2" size={14} style={{ animation: 'db-spin 1s linear infinite' }} />Checking DailyBee Cloud at {CLOUD_URL}…</div>;
  }
  if (cloud.state === 'ok') {
    const store = cloud.info?.db === 'postgres' ? 'Postgres' : 'in-memory test store';
    return <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-caption)', color: 'var(--text-secondary)' }}><StatusDot status="done" pulse={false} />DailyBee Cloud is reachable · {store}{cloud.info?.version ? ` · v${cloud.info.version}` : ''} · {CLOUD_URL}</div>;
  }
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', font: 'var(--type-body-sm)', color: 'var(--warning-text)', padding: '10px 12px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)' }}>
      <Icon name="alert-triangle" size={16} />
      <span style={{ flex: 1, minWidth: 200 }}>DailyBee Cloud is not answering right now · {cloud.message.replace(/ Is the server running, and is the address right?$/, '')} Retry in a moment, or pick “Your own workspace server”.</span>
      <Button size="sm" variant="secondary" icon="refresh-cw" onClick={onRetry}>Retry</Button>
    </div>
  );
}

const Problem = ({ text }: { text: string | null }) => (text ? <div role="alert" style={{ font: 'var(--type-body-sm)', color: 'var(--danger-text)', padding: '10px 12px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)' }}>{text}</div> : null);

export function Onboarding({ start, role: startRole, email: startEmail, escape }: OnboardingProps = {}) {
  const savedUrl = useStore((s) => s.settings?.workspace.apiUrl ?? '');
  const showToast = useStore((s) => s.showToast);
  const [step, setStep] = useState<Step>(start ?? 'mode');
  const [mode, setMode] = useState<'solo' | 'team' | null>(start === 'team' || start === 'role' ? 'team' : start === 'solo' ? 'solo' : null);
  const [role, setRole] = useState<AccountRole | null>(startRole ?? null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Solo profile
  const [name, setName] = useState('');
  const [email, setEmail] = useState(startEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recovery, setRecovery] = useState<RecoveryDraft>(emptyRecovery);
  // Team sign-in
  const [teamTab, setTeamTab] = useState<'signin' | 'create' | 'join'>('signin');
  const [apiUrl, setApiUrl] = useState(savedUrl || '');
  // Where the workspace lives: our hosted service, or a server the team runs. Cloud is the default once it exists; a saved self-hosted address keeps its choice.
  const [hosting, setHosting] = useState<Hosting>(savedUrl && savedUrl !== CLOUD_URL ? 'self' : cloudAvailable() ? 'cloud' : 'self');
  const cloudMissing = hosting === 'cloud' && !cloudAvailable();
  // The hosted server is checked (GET /trpc/health from the main process) before sign-in is offered.
  const [cloud, setCloud] = useState<{ state: 'checking' | 'ok' | 'down'; message: string; info?: ServerInfo } | null>(null);
  const checkCloud = useCallback(async () => {
    if (!cloudAvailable()) return;
    setCloud({ state: 'checking', message: '' });
    const r = await api.account.checkServer(CLOUD_URL);
    setCloud({ state: r.ok ? 'ok' : 'down', message: r.message, info: r.info });
  }, []);
  useEffect(() => { if (mode === 'team' && hosting === 'cloud' && cloudAvailable()) void checkCloud(); }, [mode, hosting, checkCloud]);
  const cloudDown = hosting === 'cloud' && cloud?.state !== 'ok';
  const [guideOpen, setGuideOpen] = useState(false);
  const serverUrl = hosting === 'cloud' ? CLOUD_URL : apiUrl.trim();
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const go = (s: Step) => { setProblem(null); setStep(s); };
  const passwordError = password && password.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters` : null;
  const confirmError = confirm && confirm !== password ? 'Passwords do not match' : null;
  const creating = teamTab === 'create' || teamTab === 'join';

  const createSolo = async () => {
    if (!name.trim() || passwordError || confirmError || !password || !confirm) { setProblem('Fill in your name and matching passwords.'); return; }
    if (!recoveryComplete(recovery)) { setProblem('Pick two different security questions and answer both.'); return; }
    setBusy(true); setProblem(null);
    try { await api.account.setupSolo({ name: name.trim(), email: email.trim(), password, recovery: recoveryPayload(recovery) }); showToast(`Welcome, ${name.trim().split(' ')[0]}`); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const submitTeam = async () => {
    if (cloudMissing) { setProblem('DailyBee Cloud is not available in this build yet. Pick “Your own workspace server” for now.'); return; }
    if (hosting === 'cloud' && cloud?.state !== 'ok') { setProblem(cloud?.state === 'checking' ? 'Still checking DailyBee Cloud, one moment.' : 'DailyBee Cloud is not answering right now. Retry, or pick “Your own workspace server”.'); return; }
    if (!serverUrl || !email.trim() || !password) { setProblem(hosting === 'self' ? 'Fill in the server, your email and password.' : 'Fill in your email and password.'); return; }
    if (creating && (!name.trim() || passwordError || confirmError || !confirm)) { setProblem('Fill in your name and matching passwords.'); return; }
    if (teamTab === 'create' && !workspaceName.trim()) { setProblem('Give the workspace a name.'); return; }
    if (teamTab === 'join' && !inviteCode.trim()) { setProblem('Enter the join code from your admin.'); return; }
    setBusy(true); setProblem(null);
    try {
      const p = { apiUrl: serverUrl, email: email.trim(), password };
      const r = teamTab === 'create' ? await api.account.teamCreate({ ...p, workspaceName: workspaceName.trim(), name: name.trim() })
        : teamTab === 'join' ? await api.account.teamJoin({ ...p, inviteCode: inviteCode.trim(), name: name.trim() })
        : await api.account.teamLogin(p);
      if (!r.ok) setProblem(r.message); else showToast(r.message);
    } finally { setBusy(false); }
  };

  if (step === 'mode') {
    return (
      <Frame escape={escape} step={1} of={mode === 'team' ? 3 : 2} title="How will you use DailyBee?" lead="You can change this later from Settings › Account.">
        <div style={{ display: 'grid', gap: 12 }}>
          <Choice icon="user" title="Solo" selected={mode === 'solo'} onClick={() => setMode('solo')} text="Everything stays on this device and works offline: tracking, tasks, projects, daily reports. A local profile with a password, no account anywhere else." />
          <Choice icon="users" title="Team" selected={mode === 'team'} onClick={() => setMode('team')} text="Sign in to your team's workspace in the cloud. Reports go to the team, leads see the Team and Admin views, and your data syncs as aggregates only." />
        </div>
        <div><Button icon="arrow-right" disabled={!mode} onClick={() => go(mode === 'solo' ? 'solo' : 'role')}>Continue</Button></div>
      </Frame>
    );
  }

  if (step === 'solo') {
    return (
      <Frame escape={escape} step={2} of={2} title="Create your profile" lead="The password protects DailyBee on this device. It is stored only here and cannot be recovered, so keep it somewhere safe." back={() => go('mode')}>
        <Card padding={20}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Your name" value={name} autoFocus placeholder="e.g. Mia Lewis" onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" value={email} placeholder="optional · shown on your reports" onChange={(e) => setEmail(e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Password" type="password" value={password} error={passwordError} onChange={(e) => setPassword(e.target.value)} />
              <Input label="Confirm password" type="password" value={confirm} error={confirmError} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void createSolo(); }} />
            </div>
            <SecurityQuestionsFields value={recovery} onChange={setRecovery} />
            <Problem text={problem} />
            <div><Button icon="check" disabled={busy} onClick={() => void createSolo()}>Create profile</Button></div>
          </div>
        </Card>
      </Frame>
    );
  }

  if (step === 'role') {
    return (
      <Frame escape={escape} step={2} of={3} title="What is your role in the team?" lead="Admins set up the workspace and see everyone; members track their own work and share reports." back={() => go('mode')}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Choice icon="shield" title="Admin" selected={role === 'admin'} onClick={() => setRole('admin')} text="Create the workspace or sign in as its admin. You manage projects, budgets and policy, and get the Team and Admin views." />
          <Choice icon="user" title="Team member" selected={role === 'member'} onClick={() => setRole('member')} text="Join with the code your admin shares, or sign in. You get Today, Reports, Team and Tasks." />
        </div>
        <div><Button icon="arrow-right" disabled={!role} onClick={() => { setTeamTab('signin'); go('team'); }}>Continue</Button></div>
      </Frame>
    );
  }

  const admin = role === 'admin';
  return (
    <Frame escape={escape} step={3} of={3} title={admin ? 'Sign in as an admin' : 'Sign in as a team member'} lead={admin ? 'Use your workspace account, or create a new workspace for your team.' : 'Use your workspace account, or join a workspace with the code from your admin.'} back={() => go('role')}>
      <Card padding={20}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Tabs size="sm" variant="pill" value={teamTab} onChange={(v) => { setTeamTab(v); setProblem(null); }} tabs={admin ? [{ value: 'signin', label: 'Sign in' }, { value: 'create', label: 'Create a workspace' }] : [{ value: 'signin', label: 'Sign in' }, { value: 'join', label: 'Join with a code' }]} />
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ font: 'var(--type-label)' }}>Workspace location</div>
            <Radio<Hosting> name="hosting" direction="row" value={hosting} onChange={(v) => { setHosting(v); setProblem(null); }} options={[{ value: 'cloud', label: 'DailyBee Cloud', description: 'Hosted by us, nothing to run' }, { value: 'self', label: 'Your own workspace server', description: 'The DailyBee sync API your team runs' }]} />
          </div>
          {hosting === 'self'
            ? <div style={{ display: 'grid', gap: 8 }}>
              <Input label="Workspace server" value={apiUrl} mono placeholder="https://dailybee.yourcompany.com" hint="For a local test: http://localhost:8787" onChange={(e) => setApiUrl(e.target.value)} />
              <div><Button size="sm" variant="ghost" icon="book-open" onClick={() => setGuideOpen(true)}>How to set up your own server</Button></div>
            </div>
            : cloudMissing
              ? <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', padding: '10px 12px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}>DailyBee Cloud is not available in this build yet: the hosted service is still being set up. Pick “Your own workspace server” to sign in for now.</div>
              : <CloudStatus cloud={cloud} onRetry={() => void checkCloud()} />}
          {teamTab === 'create' && <Input label="Workspace name" value={workspaceName} placeholder="e.g. Acme Engineering" onChange={(e) => setWorkspaceName(e.target.value)} />}
          {teamTab === 'join' && <Input label="Join code" value={inviteCode} mono placeholder="K7Q2-M9XD" onChange={(e) => setInviteCode(e.target.value.toUpperCase())} />}
          {creating && <Input label="Your name" value={name} placeholder="e.g. Mia Lewis" onChange={(e) => setName(e.target.value)} />}
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div style={{ display: 'grid', gridTemplateColumns: creating ? '1fr 1fr' : '1fr', gap: 12 }}>
            <Input label="Password" type="password" value={password} error={creating ? passwordError : null} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !creating) void submitTeam(); }} />
            {creating && <Input label="Confirm password" type="password" value={confirm} error={confirmError} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submitTeam(); }} />}
          </div>
          <Problem text={problem} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button icon={teamTab === 'signin' ? 'log-in' : 'plus'} disabled={busy || cloudMissing || cloudDown} onClick={() => void submitTeam()}>{teamTab === 'create' ? 'Create workspace' : teamTab === 'join' ? 'Join workspace' : 'Sign in'}</Button>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Only entries, outcomes, check-in answers, app names and category mix are synced. Never pages or URLs.</span>
          </div>
        </div>
      </Card>
      {guideOpen && <ServerGuideDialog open onClose={() => setGuideOpen(false)} apiUrl={apiUrl} onUseAddress={(u) => { setApiUrl(u); setHosting('self'); }} />}
    </Frame>
  );
}
