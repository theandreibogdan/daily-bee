import { EventEmitter } from 'node:events';
import type { AwayChoice, AwayPrompt, Entry, EntryChange, EntryInput, EntryLog, EntryPatch } from '../../shared/types';
import { clock, dayKey, formatDurationShort, uid } from '../../shared/time';
import type { Repo } from '../repo';

/** An entry needs at least a minute and fits in a day. */
const MIN_SECONDS = 60;
const MAX_SECONDS = 24 * 3600;

export interface EntriesHost {
  log(m: string): void;
  now?: () => number;
}

export interface EntriesChanged { days: string[] }

/**
 * Hand corrections to the history: edit, split, delete and add entries. Every change is appended
 * to the change log (repo.appendLog), which the app can only add to, and the entry carries an edit
 * count so lists show it was touched. Linked tasks keep their logged hours in step. Emits
 * 'change' ({ days }) so the day's report can be rebuilt from the corrected data.
 */
export class EntryService extends EventEmitter {
  constructor(private readonly repo: Repo, private readonly host: EntriesHost) {
    super();
  }

  private now(): number { return this.host.now?.() ?? Date.now(); }

  private find(id: string): Entry {
    const e = this.repo.entry(id);
    if (!e) throw new Error('That entry no longer exists');
    return e;
  }

  /** Something the timer missed. */
  add(input: EntryInput, reason = ''): Entry {
    const task = check(input.task, input.seconds, input.startTs);
    const e: Entry = {
      id: uid(), day: dayKey(input.startTs), task, ref: input.ref ?? null, project: input.project ?? '', startTs: input.startTs, start: clock(input.startTs),
      seconds: Math.round(input.seconds), done: input.outcome === 'Done', outcome: input.outcome, summary: (input.summary ?? '').trim() || undefined, blocker: !!input.blocker,
      origin: 'manual', edits: 0, editedAt: this.now(),
    };
    this.repo.upsertEntry(e);
    this.adjustLogged(e.ref, e.seconds);
    const saved = this.repo.entry(e.id) ?? e;
    this.repo.appendLog({ ts: this.now(), action: 'add', entryId: e.id, day: e.day, summary: `Added “${task}” · ${formatDurationShort(e.seconds)} from ${e.start}`, before: null, after: snapshot(saved), reason: reason.trim() });
    this.changed([e.day]);
    return saved;
  }

  /** Correct an entry; only the fields in the patch move. */
  update(id: string, patch: EntryPatch, reason = ''): Entry {
    const before = this.find(id);
    const next: Entry = { ...before };
    if (patch.task !== undefined) next.task = patch.task.trim();
    if (patch.project !== undefined) next.project = patch.project;
    // Start times are edited to the minute; the seconds the timer recorded are not a difference.
    if (patch.startTs !== undefined && minuteOf(patch.startTs) !== minuteOf(before.startTs)) { next.startTs = patch.startTs; next.start = clock(patch.startTs); next.day = dayKey(patch.startTs); }
    if (patch.seconds !== undefined) next.seconds = Math.round(patch.seconds);
    if (patch.outcome !== undefined) { next.outcome = patch.outcome; next.done = patch.outcome === 'Done'; }
    if (patch.summary !== undefined) next.summary = patch.summary.trim() || undefined;
    if (patch.blocker !== undefined) next.blocker = patch.blocker;
    check(next.task, next.seconds, next.startTs);
    const changes = describe(before, next, this.projectName.bind(this));
    if (!changes.length) return before;
    next.edits = (before.edits ?? 0) + 1;
    next.editedAt = this.now();
    this.repo.upsertEntry(next);
    this.adjustLogged(before.ref, next.seconds - before.seconds);
    const saved = this.repo.entry(id) ?? next;
    this.repo.appendLog({ ts: this.now(), action: 'edit', entryId: id, day: next.day, summary: changes.join(' · '), before: snapshot(before), after: snapshot(saved), reason: reason.trim() });
    this.changed(before.day === next.day ? [next.day] : [before.day, next.day]);
    return saved;
  }

  /**
   * Cut an entry in two after `atSeconds` of its duration: the first part keeps its wrap-up, the
   * second starts where the first ends and gets the new title (or the same one), partly done.
   */
  split(id: string, atSeconds: number, opts: { task?: string; project?: string; reason?: string } = {}): { first: Entry; second: Entry } {
    const before = this.find(id);
    const at = Math.round(atSeconds);
    if (!(at >= MIN_SECONDS && before.seconds - at >= MIN_SECONDS)) throw new Error('Both parts need at least a minute');
    const title = (opts.task ?? '').trim() || before.task;
    const first: Entry = { ...before, seconds: at, edits: (before.edits ?? 0) + 1, editedAt: this.now() };
    const second: Entry = {
      id: uid(), day: before.day, task: title, ref: title === before.task ? before.ref : null, project: opts.project ?? before.project, startTs: before.startTs + at * 1000, start: clock(before.startTs + at * 1000),
      seconds: before.seconds - at, done: false, outcome: 'Partly done', summary: undefined, blocker: false, size: before.size, origin: 'split', edits: 0, editedAt: this.now(),
    };
    // Part two belongs to the day it starts on (a split across midnight moves the tail to the next day).
    second.day = dayKey(second.startTs);
    this.repo.upsertEntry(first);
    this.repo.upsertEntry(second);
    // The original task loses the tail; the new title (unlinked) gains nothing; the same title keeps the total.
    if (second.ref !== before.ref) this.adjustLogged(before.ref, -second.seconds);
    const a = this.repo.entry(first.id) ?? first;
    const b = this.repo.entry(second.id) ?? second;
    this.repo.appendLog({ ts: this.now(), action: 'split', entryId: id, day: before.day, summary: `Split “${before.task}” after ${formatDurationShort(at)} · “${title}” continues for ${formatDurationShort(second.seconds)} from ${second.start}`, before: snapshot(before), after: snapshot(a), reason: (opts.reason ?? '').trim() });
    this.repo.appendLog({ ts: this.now(), action: 'add', entryId: b.id, day: b.day, summary: `“${title}” split off “${before.task}” · ${formatDurationShort(b.seconds)} from ${b.start}`, before: null, after: snapshot(b), reason: '' });
    this.changed(a.day === b.day ? [a.day] : [a.day, b.day]);
    return { first: a, second: b };
  }

  /** Delete an entry; the log keeps what it was. */
  remove(id: string, reason = ''): Entry {
    const before = this.find(id);
    this.repo.deleteEntry(id);
    this.adjustLogged(before.ref, -before.seconds);
    this.repo.appendLog({ ts: this.now(), action: 'delete', entryId: id, day: before.day, summary: `Deleted “${before.task}” · ${formatDurationShort(before.seconds)} from ${before.start}`, before: snapshot(before), after: null, reason: reason.trim() });
    this.changed([before.day]);
    return before;
  }

  /** The done checkbox is a correction too: it goes through the log like any other. */
  toggleDone(id: string): Entry {
    const e = this.find(id);
    return this.update(id, { outcome: e.done ? 'Partly done' : 'Done' });
  }

  /** What was decided about time away while a task ran (main/services/away.ts). */
  recordAway(p: AwayPrompt, choice: AwayChoice): EntryChange {
    const span = `${formatDurationShort(p.seconds)} ${p.reason === 'idle' ? 'idle' : p.reason === 'lock' ? 'with the screen locked' : 'asleep'} (${clock(p.since)}–${clock(p.until)})`;
    const summary = choice === 'keep' ? `Counted ${span} as work on “${p.task}”` : choice === 'stop' ? `Stopped “${p.task}” at ${clock(p.since)}, when you left · ${span} and the time since are not counted` : `Left ${span} out of “${p.task}”`;
    return this.repo.appendLog({ ts: this.now(), action: 'away', entryId: null, day: dayKey(p.since), summary, before: null, after: { task: p.task, seconds: p.seconds } as Partial<Entry>, reason: '' });
  }

  /** The log for one day (or the whole thing), plus whether the chain still checks out. */
  log(day?: string): EntryLog {
    return { items: day ? this.repo.logForDay(day) : this.repo.logAll(), intact: this.repo.verifyLog(), total: this.repo.logCount() };
  }

  private projectName(id: string): string {
    return this.repo.projects().find((p) => p.id === id)?.name ?? (id || 'no project');
  }

  /** Keep a linked task's logged hours in step with its entries. */
  private adjustLogged(ref: string | null | undefined, deltaSeconds: number): void {
    if (!ref || !deltaSeconds) return;
    const t = this.repo.tasks().find((x) => x.id === ref);
    if (!t) return;
    this.repo.saveTask({ ...t, logged: Math.max(0, Math.round((t.logged + deltaSeconds / 3600) * 100) / 100) });
  }

  private changed(days: string[]): void {
    this.emit('change', { days } satisfies EntriesChanged);
  }
}

const minuteOf = (ts: number): number => Math.floor(ts / 60_000);

function check(task: string, seconds: number, startTs: number): string {
  const title = task.trim();
  if (!title) throw new Error('Give the entry a name');
  if (!Number.isFinite(startTs) || startTs <= 0) throw new Error('The start time is not valid');
  if (!Number.isFinite(seconds) || seconds < MIN_SECONDS) throw new Error('An entry needs at least a minute');
  if (seconds > MAX_SECONDS) throw new Error('An entry cannot be longer than 24 hours');
  return title;
}

/** The fields worth keeping in the log (no derived clock strings). */
function snapshot(e: Entry): Partial<Entry> {
  const s: Partial<Entry> = { id: e.id, day: e.day, task: e.task, project: e.project, startTs: e.startTs, seconds: e.seconds, done: e.done, origin: e.origin ?? 'timer' };
  if (e.ref) s.ref = e.ref;
  if (e.outcome) s.outcome = e.outcome;
  if (e.summary) s.summary = e.summary;
  if (e.blocker) s.blocker = true;
  return s;
}

/** The edit in words, one phrase per field that moved. */
export function describe(a: Entry, b: Entry, projectName: (id: string) => string): string[] {
  const out: string[] = [];
  if (a.task !== b.task) out.push(`Task “${a.task}” → “${b.task}”`);
  if (a.project !== b.project) out.push(`Project ${projectName(a.project)} → ${projectName(b.project)}`);
  if (minuteOf(a.startTs) !== minuteOf(b.startTs)) out.push(`Started ${clock(a.startTs)} → ${clock(b.startTs)}${a.day !== b.day ? ` (${b.day})` : ''}`);
  if (a.seconds !== b.seconds) out.push(`Duration ${formatDurationShort(a.seconds)} → ${formatDurationShort(b.seconds)}`);
  if ((a.outcome ?? '') !== (b.outcome ?? '') || a.done !== b.done) out.push(`Outcome ${a.outcome ?? (a.done ? 'Done' : 'not set')} → ${b.outcome ?? (b.done ? 'Done' : 'not set')}`);
  if ((a.summary ?? '') !== (b.summary ?? '')) out.push(a.summary ? 'Summary changed' : 'Summary added');
  if (!!a.blocker !== !!b.blocker) out.push(b.blocker ? 'Blocker flagged' : 'Blocker cleared');
  return out;
}
