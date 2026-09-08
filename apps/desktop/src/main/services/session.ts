import { EventEmitter } from 'node:events';
import type { EndTaskResult, Entry, Session, SessionTask } from '../../shared/types';
import { dayKey, uid } from '../../shared/time';
import type { Repo } from '../repo';
import type { SettingsService } from './settings';

/**
 * Owns the running task. Lives in the main process so it survives renderer reloads and
 * keeps ticking while the window is closed. Time is derived from `startedAt`, never counted.
 */
export class SessionService extends EventEmitter {
  private state: Session;

  constructor(private readonly repo: Repo, private readonly settings: SettingsService) {
    super();
    this.state = repo.getKv<Session>('session', { running: false, startedAt: null, current: null });
    if (this.state.running && (!this.state.startedAt || !this.state.current)) this.state = { running: false, startedAt: null, current: null };
  }

  get(): Session { return this.state; }

  elapsedSeconds(now = Date.now()): number {
    if (!this.state.running || !this.state.startedAt) return 0;
    return Math.max(0, Math.floor((now - this.state.startedAt) / 1000));
  }

  /** Seconds this run would add to an entry (rounded per settings). */
  private billable(now = Date.now()): number {
    const raw = this.elapsedSeconds(now);
    if (!this.settings.get().tracking.roundTo5) return raw;
    return Math.max(raw > 0 ? 300 : 0, Math.round(raw / 300) * 300);
  }

  start(task: SessionTask, now = Date.now()): Session {
    if (this.state.running && this.state.current) this.finalize({ summary: '', outcome: 'Partly done', sizeCheck: this.state.current.size, blocker: false }, now, true);
    this.state = { running: true, startedAt: now, current: task };
    this.persist();
    return this.state;
  }

  stop(result: EndTaskResult, now = Date.now()): { session: Session; entry: Entry } {
    const entry = this.finalize(result, now, false);
    this.state = { running: false, startedAt: null, current: null };
    this.persist();
    return { session: this.state, entry };
  }

  /** Save (or merge into) today's entry for the current task. Mirrors the kit's onFinish merge. */
  private finalize(result: EndTaskResult, now: number, silent: boolean): Entry {
    const cur = this.state.current!;
    const seconds = this.billable(now);
    const day = dayKey(now);
    const existing = this.repo.entriesForDay(day).find((e) => e.task === cur.task && !e.done);
    const entry: Entry = existing
      ? { ...existing, seconds: existing.seconds + seconds, done: result.outcome === 'Done', outcome: result.outcome, summary: result.summary || existing.summary, blocker: result.blocker || existing.blocker, sizeCheck: result.sizeCheck, size: cur.size, goal: cur.goal }
      : { id: uid(), day, task: cur.task, ref: cur.ref, project: cur.project, startTs: this.state.startedAt ?? now, start: '', seconds, done: result.outcome === 'Done', outcome: result.outcome, summary: result.summary, blocker: result.blocker, sizeCheck: result.sizeCheck, size: cur.size, goal: cur.goal };
    this.repo.upsertEntry(entry);
    if (!silent) this.emit('entries');
    return this.repo.entry(entry.id) ?? entry;
  }

  private persist(): void {
    this.repo.setKv('session', this.state);
    this.emit('change', this.state);
  }
}
