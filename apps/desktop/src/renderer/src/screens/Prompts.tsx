import { Button, CATEGORIES, Checkbox, Dialog, Field, Icon, IconButton, Input, MixBar, Radio, Select, Tag, Textarea, CategoryBadge, formatDuration } from '@dailybee/ui';
import type { TimelineSegment } from '@dailybee/tracker/types';
import { KIT_CURRENT_TASK, KIT_END_SUMMARY } from '@shared/fake';
import { MOODS, OUTCOMES, TASK_SIZES, type Checkin, type Entry, type Mood, type Outcome, type ReportDraft, type TaskSize } from '@shared/types';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../bridge';
import { selectElapsed, useStore } from '../store';

export function StartTaskDialog({ open, onClose, resume }: { open: boolean; onClose: () => void; resume: Entry | null }) {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const startTask = useStore((s) => s.startTask);
  const demo = api.demo;
  const [task, setTask] = useState('');
  const [goal, setGoal] = useState('');
  const [project, setProject] = useState('');
  const [ref, setRef] = useState('');
  const [size, setSize] = useState<TaskSize>('Medium');
  const [mood, setMood] = useState<Mood>('Focused');
  useEffect(() => {
    if (!open) return;
    if (resume) { setTask(resume.task); setGoal(resume.goal ?? ''); setProject(resume.project); setRef(resume.ref ?? ''); setSize(resume.size ?? 'Medium'); }
    else if (demo) { setTask(KIT_CURRENT_TASK.task); setGoal(KIT_CURRENT_TASK.goal); setProject(KIT_CURRENT_TASK.project); setRef(KIT_CURRENT_TASK.ref); setSize(KIT_CURRENT_TASK.size); }
    else { setTask(''); setGoal(''); setProject(projects[0]?.id ?? ''); setRef(''); setSize('Medium'); }
    setMood('Focused');
  }, [open, resume, demo, projects]);
  const pickTask = (id: string) => {
    setRef(id);
    const t = tasks.find((x) => x.id === id);
    if (t) { setTask(t.title); setProject(t.project); setSize(t.size); }
  };
  const canStart = task.trim().length > 0;
  return (
    <Dialog open={open} onClose={onClose} width={520} title="Starting a task" description="Three quick questions. DailyBee tracks apps and tabs from here."
      footer={<><Button variant="secondary" onClick={onClose}>Not now</Button><Button icon="play" disabled={!canStart} onClick={() => void startTask({ task: task.trim(), goal: goal.trim(), size, project: project || projects[0]?.id || 'api', ref: ref || null, mood })}>Start tracking</Button></>}>
      <div style={{ display: 'grid', gap: 18 }}>
        <Input label="What are you working on?" value={task} onChange={(e) => setTask(e.target.value)} icon="pencil-line" placeholder="e.g. Timer sync across devices" autoFocus />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select label="Project" value={project} onChange={(e) => setProject(e.target.value)} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
          <Select label="Task" value={ref} onChange={(e) => pickTask(e.target.value)} options={[{ value: '', label: 'No linked task' }, ...tasks.map((t) => ({ value: t.id, label: t.id + ' · ' + t.title }))]} />
        </div>
        <Input label="What does done look like?" value={goal} onChange={(e) => setGoal(e.target.value)} hint="Used to check in with you later" />
        <Field label="How big is it?"><Radio<TaskSize> name="s" direction="row" value={size} onChange={setSize} options={TASK_SIZES} /></Field>
        <Field label="How are you starting?"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{MOODS.map((m) => <Tag key={m} selected={mood === m} onClick={() => setMood(m)}>{m}</Tag>)}</div></Field>
      </div>
    </Dialog>
  );
}

export function CheckinPopup({ checkin, onAnswer, fixed = true }: { checkin: Checkin | null; onAnswer: (a: string) => void; fixed?: boolean }) {
  if (!checkin) return null;
  const drift = checkin.kind === 'drift';
  const pos = fixed ? { position: 'fixed' as const, right: 24, top: 'calc(72px + var(--titlebar-h, 0px))', width: 360, zIndex: 150 } : { width: 360 };
  return (
    <div style={{ ...pos, background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', padding: 16, display: 'grid', gap: 12, animation: 'db-rise var(--dur-slow) var(--ease-out)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ display: 'inline-flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: drift ? 'var(--cat-distraction-bg)' : 'var(--honey-50)', color: drift ? 'var(--red-700)' : 'var(--honey-800)', flexShrink: 0 }}><Icon name={drift ? 'eye-off' : 'message-circle-question'} size={18} /></span>
        <div style={{ display: 'grid', gap: 4, flex: 1 }}>
          <div style={{ font: 'var(--type-label)' }}>{drift ? 'Drifting?' : 'Quick check-in'}</div>
          <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', textWrap: 'pretty' }}>{checkin.text}</div>
        </div>
        <IconButton icon="x" label="Dismiss" size="sm" onClick={() => onAnswer('dismiss')} />
      </div>
      {drift
        ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button size="sm" onClick={() => onAnswer('back')}>Back to it</Button><Button size="sm" variant="secondary" onClick={() => onAnswer('break')}>Taking a break</Button><Button size="sm" variant="ghost" onClick={() => onAnswer('relevant')}>This is work</Button></div>
        : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{['On track', 'Slower than planned', 'Blocked', 'Scope grew'].map((a) => <Tag key={a} onClick={() => onAnswer(a)}>{a}</Tag>)}</div>}
      <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{checkin.at} · answers go into your daily report</div>
    </div>
  );
}

/** Category mix of the timeline segments since `from` (the current run). */
function mixSince(segments: TimelineSegment[], from: number | null): number[] {
  const sec = CATEGORIES.map(() => 0);
  for (const s of segments) {
    if (s.cat === 'break') continue;
    const start = Math.max(s.start, from ?? s.start);
    if (s.end <= start) continue;
    sec[CATEGORIES.indexOf(s.cat)] += (s.end - start) / 1000;
  }
  const total = sec.reduce((a, b) => a + b, 0);
  if (!total) return [0, 0, 0, 0, 0];
  const raw = sec.map((v) => (v / total) * 100);
  const floors = raw.map(Math.floor);
  let rem = 100 - floors.reduce((a, b) => a + b, 0);
  raw.map((v, i) => ({ i, f: v - floors[i]! })).sort((a, b) => b.f - a.f).forEach(({ i }) => { if (rem > 0) { floors[i]!++; rem--; } });
  return floors;
}

export function EndTaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useStore((s) => s.session);
  const seconds = useStore(selectElapsed);
  const activity = useStore((s) => s.activity);
  const stopTask = useStore((s) => s.stopTask);
  const [done, setDone] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('Partly done');
  const [blocker, setBlocker] = useState(false);
  const [size, setSize] = useState<TaskSize>('Medium');
  useEffect(() => {
    if (!open) return;
    setDone(api.demo ? KIT_END_SUMMARY : '');
    setOutcome('Partly done');
    setBlocker(false);
    setSize(session.current?.size ?? 'Medium');
  }, [open, session.current]);
  // Mix of this run; when the run has no samples yet fall back to the whole day's mix.
  const mix = useMemo(() => {
    const run = mixSince(activity?.timeline ?? [], session.startedAt);
    if (run.some((v) => v > 0) || !activity) return run;
    return CATEGORIES.map((c) => activity.mix.percent[c]);
  }, [activity, session.startedAt]);
  const task = session.current?.task ?? '';
  return (
    <Dialog open={open} onClose={onClose} width={560} title="Wrapping up" description={task + ' · ' + formatDuration(seconds, 'short') + ' tracked'}
      footer={<><Button variant="secondary" onClick={onClose}>Keep going</Button><Button icon="check" onClick={() => void stopTask({ summary: done.trim(), outcome, sizeCheck: size, blocker })}>Save & stop</Button></>}>
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-caption)', color: 'var(--text-secondary)' }}><span>Where the time went</span><span style={{ font: 'var(--type-mono)' }}>{mix[0]}% work · {mix[4]}% distraction</span></div>
          <MixBar mix={mix} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{CATEGORIES.map((c) => <CategoryBadge key={c} cat={c} size="sm" />)}</div>
        </div>
        <Field label="What did you get done?"><Textarea value={done} onChange={(e) => setDone(e.target.value)} rows={3} placeholder="One or two sentences for your report" /></Field>
        <Field label="Outcome"><Radio<Outcome> name="o" direction="row" value={outcome} onChange={setOutcome} options={OUTCOMES} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Field label="Was the size right?"><Select options={TASK_SIZES} value={size} onChange={(e) => setSize(e.target.value as TaskSize)} /></Field>
          <Checkbox checked={blocker} onChange={setBlocker} label="I hit a blocker" description="Adds a blockers section to today's report" />
        </div>
      </div>
    </Dialog>
  );
}

export function GenerateReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [sending, setSending] = useState(false);
  const showToast = useStore((s) => s.showToast);
  const settings = useStore((s) => s.settings);
  useEffect(() => {
    if (!open) { setStep(0); setDraft(null); return; }
    let alive = true;
    const started = Date.now();
    void api.reports.generate().then((d) => {
      const wait = Math.max(0, 1400 - (Date.now() - started));
      setTimeout(() => { if (alive) { setDraft(d); setStep(1); } }, wait);
    });
    return () => { alive = false; };
  }, [open]);
  const target = settings?.delivery.slackChannel || '#eng-daily';
  const line = (e: Entry, icon: string, color: string) => (
    <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <Icon name={icon} size={16} style={{ color }} />
      <span style={{ flex: 1 }}>{e.task}</span>
      <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{formatDuration(e.seconds, 'short')}</span>
    </div>
  );
  return (
    <Dialog open={open} onClose={onClose} width={620} title={step ? 'Your day, drafted' : 'Generating report…'} description={step ? `Edit anything, then send to ${target}.` : 'Reading entries, activity and check-ins'}
      footer={step && draft ? <>
        <Button variant="secondary" icon="copy" onClick={() => { void api.ui.copyText(draft.markdown); showToast('Markdown copied'); }}>Copy markdown</Button>
        <Button icon="send" disabled={sending} onClick={async () => { setSending(true); try { const r = await api.reports.send(); if (r.ok) onClose(); } finally { setSending(false); } }}>Send report</Button>
      </> : null}>
      {!step || !draft
        ? <div style={{ display: 'grid', gap: 10, padding: '8px 0' }}>{['Entries and durations', 'App & tab activity by category', 'Check-in answers', 'Task outcomes'].map((l) => <div key={l} style={{ display: 'flex', gap: 10, alignItems: 'center', font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}><Icon name="loader-2" size={16} style={{ color: 'var(--honey-600)', animation: 'db-spin 1s linear infinite' }} />{l}</div>)}</div>
        : <div style={{ display: 'grid', gap: 16, font: 'var(--type-body)' }}>
          <div style={{ display: 'flex', gap: 24, padding: '12px 16px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
            {([['Tracked', formatDuration(draft.summary.tracked, 'short')], ['Focus', draft.summary.focus + '%'], ['Tasks', `${draft.summary.done} of ${draft.summary.total} done`], ['Check-ins', `${draft.summary.checkins} answered`]] as Array<[string, string]>).map(([k, v]) => (
              <div key={k}><div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{k}</div><div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-lg)', fontWeight: 500, marginTop: 2 }}>{v}</div></div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6 }}><div style={{ font: 'var(--type-label)' }}>Shipped</div>{draft.shipped.length ? draft.shipped.map((e) => line(e, 'check-circle-2', 'var(--success)')) : <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>Nothing closed yet</div>}</div>
          <div style={{ display: 'grid', gap: 6 }}><div style={{ font: 'var(--type-label)' }}>In progress</div>{draft.inProgress.length ? draft.inProgress.map((e) => line(e, 'circle-dot', 'var(--honey-600)')) : <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>Nothing in progress</div>}</div>
          <div style={{ display: 'grid', gap: 6 }}><div style={{ font: 'var(--type-label)' }}>Where the time went</div><MixBar mix={draft.mix} />{draft.narrative && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{draft.narrative}</div>}</div>
          {draft.blockers && <div style={{ display: 'grid', gap: 6 }}><div style={{ font: 'var(--type-label)' }}>Blockers</div><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{draft.blockers}</div></div>}
        </div>}
    </Dialog>
  );
}
