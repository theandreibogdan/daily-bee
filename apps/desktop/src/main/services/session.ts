import { EventEmitter } from 'node:events';
import type { EndTaskResult, Entry, PauseReason, Session, SessionTask } from '../../shared/types';
import { IDLE_SESSION, elapsedSeconds } from '../../shared/session';
import { dayKey, uid } from '../../shared/time';
import type { Repo } from '../repo';
import type { SettingsService } from './settings';

const SEEN_KEY = 'session-seen';
const HEARTBEAT_MS = 15_000;

/** A run that was still open when the app last stopped, closed into an entry at this launch. */
export interface RecoveredRun { task: string; seconds: number; day: string }

export interface SessionOptions {
  /** What to do with a run found open at launch: close it into an entry (live) or drop it (demo re-seeds its own). */
  recover: 'stop' | 'discard';
}

/**
 * Owns the running task. Lives in the main process so it survives renderer reloads and keeps
 * going while the window is hidden in the tray. The timer counts *active* time only: `banked`
 * seconds from earlier stretches plus the stretch since `activeSince`. Idle, screen lock and sleep
 * pause it (PresenceService). Quitting the app stops the run and saves its entry; a run found open
 * at launch (crash, kill, shutdown) is closed the same way, counted only up to the last heartbeat.
 */
export class SessionService extends EventEmitter {
  private state: Session;
  private heartbeat: NodeJS.Timeout | null = null;
  /** Set when a run left open by the previous process was closed at this launch. */
  recovered: RecoveredRun | null = null;

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, opts: SessionOptions = { recover: 'stop' }, now = Date.now()) {
    super();
    const lastSeen = Math.max(repo.getKv<number>(SEEN_KEY, 0), repo.lastSampleTs() ?? 0);
    const found = settleSession(repo.getKv<Partial<Session>>('session', IDLE_SESSION), lastSeen, now);
    this.state = { ...IDLE_SESSION };
    if (found.running && found.current) {
      if (opts.recover === 'stop') {
        this.state = found;
        const entry = this.finalize({ summary: '', outcome: 'Partly done', sizeCheck: found.current.size, blocker: false }, found.startedAt ?? now, found.paused?.since ?? now, true);
        this.recovered = { task: found.current.task, seconds: entry.seconds, day: entry.day };
        this.state = { ...IDLE_SESSION };
      }
      this.repo.setKv('session', this.state);
    }
  }

  get(): Session { return this.state; }

  elapsedSeconds(now = Date.now()): number { return elapsedSeconds(this.state, now); }

  /** Keep "last seen" fresh so a crash or kill loses at most one heartbeat of timer. */
  startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => { if (this.state.running && this.state.activeSince) this.repo.setKv(SEEN_KEY, Date.now(), 'low'); }, HEARTBEAT_MS);
  }

  stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  /**
   * Pause the timer. `since` may lie in the past: idle is only known once the threshold has passed,
   * so the idle stretch is taken off the clock retroactively. No-op when not running or already paused.
   */
  pause(reason: PauseReason, since = Date.now()): void {
    if (!this.state.running || !this.state.activeSince) return;
    const at = Math.max(this.state.activeSince, since);
    this.state = { ...this.state, banked: this.state.banked + (at - this.state.activeSince) / 1000, activeSince: null, paused: { reason, since: at } };
    this.persist();
  }

  resume(now = Date.now()): void {
    if (!this.state.running || this.state.activeSince) return;
    this.state = { ...this.state, activeSince: now, paused: null };
    this.persist();
  }

  start(task: SessionTask, now = Date.now()): Session {
    if (this.state.running && this.state.current) this.finalize({ summary: '', outcome: 'Partly done', sizeCheck: this.state.current.size, blocker: false }, now, now, true);
    this.state = { running: true, startedAt: now, current: task, banked: 0, activeSince: now, paused: null };
    // A linked task that was still in the backlog is now in progress.
    const linked = task.ref ? this.repo.tasks().find((t) => t.id === task.ref) : undefined;
    if (linked && linked.status === 'Backlog') this.repo.saveTask({ ...linked, status: 'In progress' });
    this.persist();
    return this.state;
  }

  /**
   * Stop the run. `opts.endedAt` ends it at an earlier moment (the time-away prompt's "stop when I
   * left") and `opts.seconds` fixes the saved reading to what the timer showed then.
   */
  stop(result: EndTaskResult, now = Date.now(), opts: { endedAt?: number; seconds?: number } = {}): { session: Session; entry: Entry } {
    const at = opts.endedAt ?? now;
    const entry = this.finalize(result, at, at, false, opts.seconds);
    this.state = { ...IDLE_SESSION };
    this.persist();
    return { session: this.state, entry };
  }

  /** "Count it as work": a stretch the timer left out (time away) is put back on the clock. */
  bank(seconds: number): void {
    if (!this.state.running || seconds <= 0) return;
    this.state = { ...this.state, banked: this.state.banked + seconds };
    this.persist();
  }

  /** Quitting the app ends the run: the entry is saved as "Partly done" with the exact active time. */
  stopOnQuit(now = Date.now()): Entry | null {
    if (!this.state.running || !this.state.current) return null;
    return this.stop({ summary: '', outcome: 'Partly done', sizeCheck: this.state.current.size, blocker: false }, now).entry;
  }

  /** Drop the running task without writing an entry (demo re-seed). */
  discard(): void {
    this.state = { ...IDLE_SESSION };
    this.persist();
  }

  /**
   * Save (or merge into) the entry for the current task. Mirrors the kit's onFinish merge. The entry
   * belongs to the day the run started on (`dayTs`); `now` is when the run ended.
   */
  private finalize(result: EndTaskResult, dayTs: number, now: number, silent: boolean, secondsOverride?: number): Entry {
    const cur = this.state.current!;
    // Exact active seconds. "Round entries to 5 min" is applied when the report is built.
    const seconds = secondsOverride ?? this.elapsedSeconds(now);
    const day = dayKey(dayTs);
    const existing = this.repo.entriesForDay(day).find((e) => e.task === cur.task && !e.done);
    const entry: Entry = existing
      ? { ...existing, seconds: existing.seconds + seconds, done: result.outcome === 'Done', outcome: result.outcome, summary: result.summary || existing.summary, blocker: result.blocker || existing.blocker, sizeCheck: result.sizeCheck, size: cur.size, goal: cur.goal }
      : { id: uid(), day, task: cur.task, ref: cur.ref, project: cur.project, startTs: this.state.startedAt ?? now, start: '', seconds, done: result.outcome === 'Done', outcome: result.outcome, summary: result.summary, blocker: result.blocker, sizeCheck: result.sizeCheck, size: cur.size, goal: cur.goal, origin: 'timer' };
    this.repo.upsertEntry(entry);
    // Keep the linked task's logged hours and status in step with the entry.
    const linked = cur.ref ? this.repo.tasks().find((t) => t.id === cur.ref) : undefined;
    if (linked) {
      const logged = Math.round((linked.logged + seconds / 3600) * 100) / 100;
      const status = result.outcome === 'Done' ? 'Done' : linked.status === 'Done' ? 'Done' : 'In progress';
      this.repo.saveTask({ ...linked, logged, status, size: result.sizeCheck ?? linked.size });
    }
    if (!silent) this.emit('entries');
    return this.repo.entry(entry.id) ?? entry;
  }

  private persist(): void {
    this.repo.setKv('session', this.state);
    this.emit('change', this.state);
  }
}

/**
 * Settle a persisted session at launch: an active stretch counts only up to the last moment the app
 * was known alive (heartbeat or last sample), and the run comes back paused at that moment so the
 * caller can close it. Sessions saved before active-time accounting existed use `startedAt`.
 */
export function settleSession(raw: Partial<Session>, lastSeen: number, now: number): Session {
  if (!raw.running || !raw.startedAt || !raw.current) return { ...IDLE_SESSION };
  const activeSince = raw.activeSince === undefined ? raw.startedAt : raw.activeSince;
  let banked = raw.banked ?? 0;
  let until = raw.paused?.since ?? raw.startedAt;
  if (activeSince) {
    until = Math.min(now, Math.max(activeSince, lastSeen));
    banked += Math.max(0, until - activeSince) / 1000;
  }
  return { running: true, startedAt: raw.startedAt, current: raw.current, banked, activeSince: null, paused: { reason: 'sleep', since: until } };
}
