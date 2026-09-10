import { Avatar, Button, Card, Input } from '@dailybee/ui';
import { useState } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';

const PASSWORD_MIN = 6;
type Stage = 'unlock' | 'questions' | 'newPassword';

/**
 * Solo profiles open locked: the password only gates the window, tracking keeps running in the
 * tray. "Forgot your password?" asks the profile's security questions, then takes a new password.
 */
export function LockScreen() {
  const account = useStore((s) => s.account);
  const initials = useStore((s) => s.settings?.profile.initials ?? '··');
  const running = useStore((s) => s.session.running);
  const showToast = useStore((s) => s.showToast);
  const questions = account?.securityQuestions ?? [];
  const [stage, setStage] = useState<Stage>('unlock');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const unlock = async () => {
    if (!password) return;
    setBusy(true);
    try { const r = await api.account.unlock(password); if (!r.ok) { setProblem(r.message); setPassword(''); } } finally { setBusy(false); }
  };
  const back = () => { setStage('unlock'); setProblem(null); setAnswers(questions.map(() => '')); setNext(''); setConfirm(''); };
  const answered = answers.length === questions.length && answers.every((a) => a.trim());
  const checkAnswers = async () => {
    if (!answered) return;
    setBusy(true); setProblem(null);
    try { const r = await api.account.checkRecovery(answers); if (r.ok) setStage('newPassword'); else setProblem(r.message); } finally { setBusy(false); }
  };
  const nextError = next && next.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters` : null;
  const confirmError = confirm && confirm !== next ? 'Passwords do not match' : null;
  const reset = async () => {
    if (!next || nextError || confirmError || !confirm) return;
    setBusy(true); setProblem(null);
    try { const r = await api.account.resetPassword(next, answers); if (r.ok) showToast(r.message); else setProblem(r.message); } finally { setBusy(false); }
  };
  const lead = stage === 'unlock' ? 'Enter your password to open DailyBee.' : stage === 'questions' ? 'Answer your security questions to reset the password.' : 'Set a new password for this profile.';
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg-app)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Card padding={24} style={{ width: 440, maxWidth: '100%' }}>
        <div style={{ display: 'grid', gap: 16, justifyItems: 'center', textAlign: 'center' }}>
          <Avatar initials={initials} src={account?.avatar} size={48} tracking={running} />
          <div>
            <div style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-tight)' }}>{account?.name || 'DailyBee'}</div>
            <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>{lead}</div>
          </div>
          {stage === 'unlock' && (
            <div style={{ width: '100%', display: 'grid', gap: 12 }}>
              <Input label="Password" type="password" value={password} autoFocus error={problem} onChange={(e) => { setPassword(e.target.value); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }} />
              <Button icon="lock-open" disabled={busy || !password} onClick={() => void unlock()}>Unlock</Button>
            </div>
          )}
          {stage === 'questions' && (questions.length
            ? <div style={{ width: '100%', display: 'grid', gap: 12, textAlign: 'left' }}>
              {questions.map((q, i) => (
                <Input key={q} label={q} value={answers[i] ?? ''} autoFocus={i === 0} onChange={(e) => { setAnswers(answers.map((a, j) => (j === i ? e.target.value : a))); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') void checkAnswers(); }} />
              ))}
              {problem && <div role="alert" style={{ font: 'var(--type-body-sm)', color: 'var(--danger-text)', padding: '10px 12px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)' }}>{problem}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Button variant="secondary" onClick={back}>Back</Button>
                <Button icon="arrow-right" disabled={busy || !answered} onClick={() => void checkAnswers()}>Continue</Button>
              </div>
            </div>
            : <div style={{ width: '100%', display: 'grid', gap: 12 }}>
              <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', textAlign: 'left', padding: '10px 12px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}>
                This profile was created without security questions, so its password cannot be reset. Switch to another profile, or remove this one from the profile list.
              </div>
              <div><Button variant="secondary" onClick={back}>Back</Button></div>
            </div>)}
          {stage === 'newPassword' && (
            <div style={{ width: '100%', display: 'grid', gap: 12 }}>
              <Input label="New password" type="password" value={next} autoFocus error={nextError} onChange={(e) => setNext(e.target.value)} />
              <Input label="Confirm new password" type="password" value={confirm} error={confirmError ?? problem} onChange={(e) => { setConfirm(e.target.value); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') void reset(); }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Button variant="secondary" onClick={back}>Back</Button>
                <Button icon="key-round" disabled={busy || !next || !confirm || !!nextError || !!confirmError} onClick={() => void reset()}>Set password</Button>
              </div>
            </div>
          )}
          <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{running ? 'Your task keeps being tracked while locked.' : 'Tracking keeps running in the background while locked.'}</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            {stage === 'unlock' && <Button variant="ghost" size="sm" onClick={() => { setStage('questions'); setProblem(null); }}>Forgot your password?</Button>}
            <Button variant="ghost" size="sm" icon="users" onClick={() => void api.profiles.close()}>Switch profile</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
