import { Input, Select } from '@dailybee/ui';
import { SECURITY_QUESTIONS, type SecurityAnswer } from '@shared/types';

/** Two questions with answers, as edited in the wizard and in Settings › Account. */
export type RecoveryDraft = [SecurityAnswer, SecurityAnswer];

export const emptyRecovery = (): RecoveryDraft => [{ question: SECURITY_QUESTIONS[0], answer: '' }, { question: SECURITY_QUESTIONS[1], answer: '' }];

/** Both answered, two different questions. */
export const recoveryComplete = (v: RecoveryDraft): boolean => v.every((x) => x.answer.trim().length > 0) && v[0].question !== v[1].question;

/** Trimmed copy for the bridge (the main process lower-cases and hashes the answers). */
export const recoveryPayload = (v: RecoveryDraft): SecurityAnswer[] => v.map((x) => ({ question: x.question, answer: x.answer.trim() }));

/**
 * Security questions: asked when a solo profile is created and again to reset a forgotten
 * password. Each question can be picked once; answers are compared case-insensitively.
 */
export function SecurityQuestionsFields({ value, onChange, hint }: { value: RecoveryDraft; onChange: (v: RecoveryDraft) => void; hint?: string }) {
  const patch = (i: number, p: Partial<SecurityAnswer>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)) as RecoveryDraft);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ font: 'var(--type-label)' }}>Security questions</div>
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 2, textWrap: 'pretty' }}>{hint ?? 'Asked if you forget the password: the only way to reset it. Answers are not case-sensitive.'}</div>
      </div>
      {value.map((qa, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 12 }}>
          <Select label={`Question ${i + 1}`} value={qa.question} options={SECURITY_QUESTIONS.filter((q) => q === qa.question || !value.some((o, j) => j !== i && o.question === q))} onChange={(e) => patch(i, { question: e.target.value })} />
          <Input label="Answer" value={qa.answer} onChange={(e) => patch(i, { answer: e.target.value })} />
        </div>
      ))}
    </div>
  );
}
