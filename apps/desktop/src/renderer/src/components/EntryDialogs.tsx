import { Badge, Button, Checkbox, Dialog, Field, Icon, Input, Radio, Select, Textarea, formatClock, formatDuration } from '@dailybee/ui';
import { atTime, dayKey, dayLabel } from '@shared/time';
import { OUTCOMES, type Entry, type EntryChange, type EntryLog, type Outcome } from '@shared/types';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../bridge';
import { useStore } from '../store';

const ACTION: Record<EntryChange['action'], { label: string; tone: 'neutral' | 'honey' | 'success' | 'warning' | 'danger' | 'info' }> = {
  add: { label: 'Added', tone: 'info' }, edit: { label: 'Edited', tone: 'honey' }, split: { label: 'Split', tone: 'neutral' }, delete: { label: 'Deleted', tone: 'danger' }, away: { label: 'Time away', tone: 'neutral' },
};
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const NOTE = 'Hand corrections are marked in the list and written to the change log, which the app can add to but never alter.';

/**
 * The dialogs behind the Entries card's corrections (store.entryDialog): edit or add an entry,
 * split one in two, delete one, or read the day's change log. Every save goes through
 * main/services/entries.ts, so it lands in the log and the day's report is rebuilt.
 */
export function EntryDialogs() {
  const d = useStore((s) => s.entryDialog);
  const { closeEntryDialog, entriesChanged, showToast } = useStore.getState();
  if (!d) return null;
  const finish = (msg: string) => { entriesChanged(); closeEntryDialog(); showToast(msg); };
  const fail = (e: unknown) => showToast(errorMessage(e), 'danger');
  if (d.mode === 'log') return <ChangeLogDialog day={d.day} onClose={closeEntryDialog} />;
  if (d.mode === 'delete' && d.entry) return <DeleteEntryDialog entry={d.entry} onClose={closeEntryDialog} onDone={finish} onFail={fail} />;
  if (d.mode === 'split' && d.entry) return <SplitDialog entry={d.entry} onClose={closeEntryDialog} onDone={finish} onFail={fail} />;
  return <EntryFormDialog key={d.entry?.id ?? 'add'} entry={d.mode === 'edit' ? d.entry ?? null : null} day={d.day} onClose={closeEntryDialog} onDone={finish} onFail={fail} />;
}

interface DialogProps { onClose: () => void; onDone: (msg: string) => void; onFail: (e: unknown) => void }

/** Edit an entry, or add one the timer missed (entry null). */
function EntryFormDialog({ entry, day, onClose, onDone, onFail }: DialogProps & { entry: Entry | null; day: string }) {
  const projects = useStore((s) => s.projects);
  const editing = !!entry;
  const today = day === dayKey();
  const defaultStart = () => (today ? formatClock(Math.floor((Date.now() - 3600_000) / 300_000) * 300_000) : '09:00');
  const [task, setTask] = useState(entry?.task ?? '');
  const [project, setProject] = useState(entry?.project ?? (projects.find((p) => !p.archived)?.id ?? ''));
  const [time, setTime] = useState(entry ? formatClock(entry.startTs) : defaultStart());
  const [hours, setHours] = useState(String(entry ? Math.floor(entry.seconds / 3600) : 1));
  const [minutes, setMinutes] = useState(String(entry ? Math.round((entry.seconds % 3600) / 60) : 0));
  const [outcome, setOutcome] = useState<Outcome>(entry?.outcome ?? (entry?.done ? 'Done' : 'Partly done'));
  const [summary, setSummary] = useState(entry?.summary ?? '');
  const [blocker, setBlocker] = useState(!!entry?.blocker);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const seconds = (Math.max(0, Number(hours) || 0) * 60 + Math.max(0, Number(minutes) || 0)) * 60;
  const timeOk = TIME.test(time.trim());
  const can = task.trim().length > 0 && seconds >= 60 && seconds <= 86_400 && timeOk && !busy;
  const options = [{ value: '', label: 'No project' }, ...projects.filter((p) => !p.archived || p.id === project).map((p) => ({ value: p.id, label: p.name }))];
  const save = async () => {
    setBusy(true);
    try {
      const startTs = atTime(time.trim(), entry ? dayKey(entry.startTs) : day);
      if (entry) {
        await api.entries.update(entry.id, { task: task.trim(), project, startTs, seconds, outcome, summary: summary.trim(), blocker }, reason);
        onDone('Entry updated · marked as edited');
      } else {
        await api.entries.add({ task: task.trim(), project, startTs, seconds, outcome, summary: summary.trim(), blocker }, reason);
        onDone('Entry added · marked as added by hand');
      }
    } catch (e) { onFail(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} width={560} title={editing ? 'Correct this entry' : `Add an entry · ${dayLabel(day)}`} description={editing ? `${entry.task} · ${formatDuration(entry.seconds, 'short')} from ${formatClock(entry.startTs)}` : 'Something the timer missed: a meeting, a call, work away from the keyboard.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="check" disabled={!can} onClick={() => void save()}>{editing ? 'Save correction' : 'Add entry'}</Button></>}>
      <div style={{ display: 'grid', gap: 16 }}>
        <Input label="Task" value={task} autoFocus onChange={(e) => setTask(e.target.value)} placeholder="What was the time spent on?" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select label="Project" value={project} onChange={(e) => setProject(e.target.value)} options={options} />
          <Input label="Started" type="time" mono value={time} error={timeOk ? null : 'Use HH:MM'} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Hours" type="number" min={0} max={24} mono value={hours} onChange={(e) => setHours(e.target.value)} />
          <Input label="Minutes" type="number" min={0} max={59} mono value={minutes} onChange={(e) => setMinutes(e.target.value)} hint={seconds >= 60 ? `Duration ${formatDuration(seconds, 'short')}` : 'At least a minute'} />
        </div>
        <Field label="Outcome"><Radio<Outcome> name="entry-outcome" direction="row" value={outcome} onChange={setOutcome} options={OUTCOMES} /></Field>
        <Field label="What got done"><Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One or two sentences for the report" /></Field>
        <Checkbox checked={blocker} onChange={setBlocker} label="I hit a blocker" description="Adds a blockers section to that day's report" />
        <Input label={editing ? 'Why the change? (optional)' : 'Note for the change log (optional)'} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={editing ? 'Forgot to stop the timer at lunch' : 'Client call, no laptop'} />
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{NOTE}</div>
      </div>
    </Dialog>
  );
}

/** Cut an entry in two: the first part keeps its wrap-up, the second continues from where it ends. */
function SplitDialog({ entry, onClose, onDone, onFail }: DialogProps & { entry: Entry }) {
  const totalMin = Math.floor(entry.seconds / 60);
  const [atMin, setAtMin] = useState(String(Math.max(1, Math.min(totalMin - 1, Math.round(totalMin / 2)))));
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const at = Math.round(Number(atMin) || 0);
  const ok = at >= 1 && totalMin - at >= 1;
  const secondStart = entry.startTs + at * 60_000;
  const save = async () => {
    setBusy(true);
    try { await api.entries.split(entry.id, at * 60, { task: title.trim() || undefined, reason }); onDone('Entry split in two · both marked'); }
    catch (e) { onFail(e); } finally { setBusy(false); }
  };
  const part = (label: string, name: string, secs: number, from: number) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', font: 'var(--type-body-sm)' }}>
      <span style={{ font: 'var(--type-overline)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: 14 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>from {formatClock(from)}</span>
      <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', minWidth: 52, textAlign: 'right' }}>{formatDuration(Math.max(0, secs), 'short')}</span>
    </div>
  );
  return (
    <Dialog open onClose={onClose} width={520} title="Split this entry" description={`${entry.task} · ${formatDuration(entry.seconds, 'short')} from ${formatClock(entry.startTs)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="scissors" disabled={!ok || busy} onClick={() => void save()}>Split entry</Button></>}>
      <div style={{ display: 'grid', gap: 16 }}>
        {totalMin < 2 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--danger-text)' }}>An entry needs at least two minutes to be split.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Input label="Split after" type="number" min={1} max={Math.max(1, totalMin - 1)} mono value={atMin} autoFocus onChange={(e) => setAtMin(e.target.value)} hint={`minutes, of ${totalMin} in total`} error={ok || totalMin < 2 ? null : `Between 1 and ${totalMin - 1}`} />
          <Input label="Second part is" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={entry.task} hint="Leave empty to keep the same task" />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {part('A', entry.task, at * 60, entry.startTs)}
          {part('B', title.trim() || entry.task, (totalMin - at) * 60, secondStart)}
        </div>
        <Input label="Why the change? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Switched tasks without restarting the timer" />
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Part A keeps the outcome and summary; part B starts as partly done. {NOTE}</div>
      </div>
    </Dialog>
  );
}

function DeleteEntryDialog({ entry, onClose, onDone, onFail }: DialogProps & { entry: Entry }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try { await api.entries.remove(entry.id, reason); onDone('Entry deleted · kept in the change log'); }
    catch (e) { onFail(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} width={460} title="Delete this entry?" description={`${entry.task} · ${formatDuration(entry.seconds, 'short')} from ${formatClock(entry.startTs)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Keep it</Button><Button variant="danger" icon="trash-2" disabled={busy} onClick={() => void remove()}>Delete entry</Button></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>The entry leaves the day and its report. The change log keeps what it was, so the deletion stays visible.</div>
        <Input label="Why? (optional)" value={reason} autoFocus onChange={(e) => setReason(e.target.value)} placeholder="Started by mistake" />
      </div>
    </Dialog>
  );
}

/** The day's lines of the append-only log, with the chain check over the whole log. */
function ChangeLogDialog({ day, onClose }: { day: string; onClose: () => void }) {
  const showToast = useStore((s) => s.showToast);
  const [log, setLog] = useState<EntryLog | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { void api.entries.log(day).then(setLog).catch((e: unknown) => setFailed(errorMessage(e))); }, [day]);
  const copy = () => {
    if (!log) return;
    const text = log.items.map((c) => `${new Date(c.ts).toISOString()}  ${ACTION[c.action].label.padEnd(9)}  ${c.summary}${c.reason ? `  — ${c.reason}` : ''}  [#${c.seq} ${c.hash.slice(0, 12)}]`).join('\n');
    void api.ui.copyText(text);
    showToast('Change log copied');
  };
  return (
    <Dialog open onClose={onClose} width={620} title={`Change log · ${dayLabel(day)}`} description="Every correction is appended here with a hash of the line before it. The app can add lines but never change or remove them, so any alteration shows up as a broken chain."
      footer={<><Button variant="secondary" icon="copy" disabled={!log?.items.length} onClick={copy}>Copy as text</Button><Button onClick={onClose}>Close</Button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {log && (log.intact
            ? <Badge tone="success" dot>Chain verified</Badge>
            : <Badge tone="danger" dot>Chain broken · a line was altered outside DailyBee</Badge>)}
          {log && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{log.total} {log.total === 1 ? 'line' : 'lines'} across all days · {log.items.length} on this day</span>}
          {failed && <span style={{ font: 'var(--type-caption)', color: 'var(--danger-text)' }}>{failed}</span>}
        </div>
        {log && log.items.length === 0 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>No corrections on this day. Every entry was written by the timer and left as it was.</div>}
        <div style={{ display: 'grid' }}>
          {log?.items.map((c) => (
            <div key={c.seq} style={{ display: 'grid', gridTemplateColumns: '44px auto minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 3 }}>{formatClock(c.ts)}</span>
              <Badge tone={ACTION[c.action].tone} size="sm">{ACTION[c.action].label}</Badge>
              <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                <div style={{ font: 'var(--type-body-sm)', textWrap: 'pretty' }}>{c.summary}</div>
                {c.reason && <div style={{ font: 'var(--type-caption)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>“{c.reason}”</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}><Icon name="link" size={11} />#{c.seq} · {c.hash.slice(0, 12)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
