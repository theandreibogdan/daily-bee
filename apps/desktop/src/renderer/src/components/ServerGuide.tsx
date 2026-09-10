import { Badge, Button, Dialog, Icon, Input } from '@dailybee/ui';
import type { AccountResult } from '@shared/types';
import { useState, type ReactNode } from 'react';
import { api } from '../bridge';

const win = api.platform === 'win32';
const SHELL = win ? 'PowerShell' : 'Terminal';
const PG = 'docker run --name dailybee-pg -e POSTGRES_USER=dailybee -e POSTGRES_PASSWORD=dailybee -e POSTGRES_DB=dailybee -p 5432:5432 -d postgres:16';
const START = win
  ? '$env:DATABASE_URL = "postgres://dailybee:dailybee@localhost:5432/dailybee"; $env:PORT = "8787"; corepack pnpm --filter @dailybee/api start'
  : 'DATABASE_URL=postgres://dailybee:dailybee@localhost:5432/dailybee PORT=8787 pnpm --filter @dailybee/api start';

const STEPS = ['Before you start', 'Try it locally', 'Run it with Postgres', 'Make it reachable', 'Check the connection', 'Create the workspace'];

const overline: React.CSSProperties = { font: 'var(--type-overline)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' };

/** A command in a terminal-style block: shell label, copy button that confirms, wrapped text. */
function Command({ text, label = SHELL }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { void api.ui.copyText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 4px 12px', background: 'var(--bg-sunken)', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={overline}>{label}</span>
        <Button size="sm" variant="ghost" icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <code style={{ display: 'block', font: 'var(--type-mono)', fontSize: 12, lineHeight: '18px', padding: '10px 12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--surface-raised)' }}>{text}</code>
    </div>
  );
}

function Note({ icon = 'info', tone = 'neutral', children }: { icon?: string; tone?: 'neutral' | 'success' | 'danger'; children: ReactNode }) {
  const bg = tone === 'success' ? 'var(--success-bg)' : tone === 'danger' ? 'var(--danger-bg)' : 'var(--bg-sunken)';
  const color = tone === 'success' ? 'var(--success-text)' : tone === 'danger' ? 'var(--danger-text)' : 'var(--text-secondary)';
  return (
    <div role={tone === 'neutral' ? undefined : 'status'} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: bg, color, borderRadius: 'var(--radius-md)', font: 'var(--type-body-sm)' }}>
      <Icon name={icon} size={16} style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ textWrap: 'pretty' }}>{children}</span>
    </div>
  );
}

const P = ({ children }: { children: ReactNode }) => <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-secondary)', textWrap: 'pretty' }}>{children}</p>;

/**
 * "How to set up your own server": a stepper that walks through running the sync API from this
 * repository, with copyable commands and a live check that a DailyBee API answers at an address
 * (the main process does a GET on /trpc/health).
 */
export function ServerGuideDialog({ open, onClose, apiUrl, onUseAddress }: { open: boolean; onClose: () => void; apiUrl: string; onUseAddress: (url: string) => void }) {
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState(apiUrl || 'http://localhost:8787');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<AccountResult | null>(null);
  const [applied, setApplied] = useState(false);
  const last = step === STEPS.length - 1;
  const check = async () => {
    setChecking(true); setResult(null); setApplied(false);
    try { setResult(await api.account.checkServer(address.trim())); } finally { setChecking(false); }
  };
  const useAddress = () => { onUseAddress(address.trim()); setApplied(true); };

  const bodies: ReactNode[] = [
    <>
      <P>The workspace server is the <code style={{ font: 'var(--type-mono)', fontSize: 12 }}>apps/api</code> package of the DailyBee source: a small Node.js service with no build step. You need a machine that stays on, Node.js 20 or newer, and the source folder on it.</P>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Badge tone="neutral" size="sm">Node.js 20+</Badge><Badge tone="neutral" size="sm">pnpm via corepack</Badge><Badge tone="neutral" size="sm">DailyBee source</Badge><Badge tone="neutral" size="sm">Postgres for real use</Badge>
      </div>
      <P>Install the dependencies once, in the source folder:</P>
      <Command text="corepack pnpm install" />
    </>,
    <>
      <P>Start the API with everything kept in memory. It listens on port 8787, so the address to enter in DailyBee is <code style={{ font: 'var(--type-mono)', fontSize: 12 }}>http://localhost:8787</code>.</P>
      <Command text="corepack pnpm dev:api" />
      <Note>Good for a first look on your own PC. The data is gone when the server stops, so this is not the setup for a team.</Note>
    </>,
    <>
      <P>Start a Postgres database (Docker is the quickest way), then start the API pointed at it. The tables are created on first start.</P>
      <Command text={PG} label="Terminal" />
      <Command text={START} />
      <Note><b>DATABASE_URL</b> is the connection string of any Postgres 14+ database, Docker or not; <b>PORT</b> changes the port. Both can also live in an <code style={{ font: 'var(--type-mono)', fontSize: 12 }}>apps/api/.env</code> file.</Note>
    </>,
    <>
      <P>Run the server on a machine everyone can reach, keep it running as a service, and put it behind HTTPS with a reverse proxy such as Caddy or nginx.</P>
      <Note icon="globe">DailyBee only needs the origin, for example <b>https://dailybee.yourcompany.com</b>. The <code style={{ font: 'var(--type-mono)', fontSize: 12 }}>/trpc</code> part is added automatically.</Note>
      <Note icon="lock">Only aggregates travel to the server: entries, outcomes, check-in answers, app names and category mix. Pages and URLs never leave each device.</Note>
    </>,
    <>
      <P>Enter the address your team will use and check that a DailyBee API answers there.</P>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
        <Input label="Server address" value={address} mono onChange={(e) => { setAddress(e.target.value); setResult(null); setApplied(false); }} onKeyDown={(e) => { if (e.key === 'Enter') void check(); }} />
        <Button variant="secondary" icon="activity" disabled={checking || !address.trim()} onClick={() => void check()}>{checking ? 'Checking…' : 'Check server'}</Button>
      </div>
      {result && <Note tone={result.ok ? 'success' : 'danger'} icon={result.ok ? 'check-circle-2' : 'alert-circle'}>{result.message}</Note>}
      {result?.ok && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button size="sm" icon="check" disabled={applied} onClick={useAddress}>{applied ? 'Address filled in' : 'Use this address'}</Button>
          {applied && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>The sign-in form now points at it.</span>}
        </div>
      )}
    </>,
    <>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>
        <li>Keep <b>Your own workspace server</b> selected and enter the address.</li>
        <li>Use <b>Create a workspace</b>: you become its admin.</li>
        <li>Share the join code shown under <b>Settings › Account</b> (<b>Team › Invite</b> copies it together with the address).</li>
        <li>Teammates pick <b>Team → Team member → Join with a code</b>.</li>
      </ol>
      <Note icon="key-round">Accounts live on the server. Everyone signs in later with their email and password; a signed-out profile reopens on its sign-in form.</Note>
    </>,
  ];

  return (
    <Dialog open={open} onClose={onClose} width={780} title="Run your own workspace server"
      description="A small Node.js service your team hosts. Six steps from a local try-out to a workspace your team can join."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" icon="arrow-left" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        {last ? <Button icon="check" onClick={onClose}>Done</Button> : <Button icon="arrow-right" onClick={() => setStep(step + 1)}>Next</Button>}
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '212px minmax(0, 1fr)', gap: 24, minHeight: 344 }}>
        <nav aria-label="Steps" style={{ display: 'grid', gap: 2, alignContent: 'start', paddingRight: 20, borderRight: '1px solid var(--border-subtle)' }}>
          {STEPS.map((label, i) => {
            const current = i === step, done = i < step;
            return (
              <button key={label} type="button" onClick={() => setStep(i)} aria-current={current ? 'step' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: 0, borderRadius: 'var(--radius-md)', background: current ? 'var(--surface-accent-soft)' : 'transparent', color: current ? 'var(--text-primary)' : 'var(--text-secondary)', font: 'var(--type-body-sm)', fontWeight: current ? 600 : 500, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: current ? 'var(--honey-500)' : done ? 'var(--success-bg)' : 'var(--bg-sunken)', color: current ? 'var(--text-on-accent)' : done ? 'var(--success-text)' : 'var(--text-tertiary)', font: 'var(--type-caption)' }}>
                  {done ? <Icon name="check" size={12} strokeWidth={2.5} /> : i + 1}
                </span>
                {label}
              </button>
            );
          })}
        </nav>
        <section aria-live="polite" style={{ display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
          <div style={overline}>Step {step + 1} of {STEPS.length}</div>
          <h3 style={{ margin: 0, font: 'var(--type-h4)', letterSpacing: 'var(--tracking-tight)' }}>{STEPS[step]}</h3>
          {bodies[step]}
        </section>
      </div>
    </Dialog>
  );
}
