import { EventEmitter } from 'node:events';
import type { EndTaskResult, Entry, PauseReason, Session, SessionTask } from '../../shared/types';
import { IDLE_SESSION, elapsedSeconds } from '../../shared/session';
import { dayKey, uid } from '../../shared/time';
import type { Repo } from '../repo';
import type { SettingsService } from './settings';

const SEEN_KEY = 'session-seen';
const HEARTBEAT_MS = 15_000;

/**
 * Owns the running task. Lives in the main process so it survives renderer reloads and keeps
 * going while the window is closed. The timer counts *active* time only: `banked` seconds from
 * earlier stretches plus the stretch since `activeSince`. Idle, screen lock, sleep and quitting
 * pause it (PresenceService drives the first three). A heartbeat records the last moment the app
 * was alive, so a killed process does not count the time it was gone.
 */
export class SessionService extends EventEmitter {
  private state: Session;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, now = Date.now()) {
    super();
    const lastSeen = Math.max(repo.getKv<number>(SEEN_KEY, 0), repo.lastSampleTs() ?? 0);
    this.state = restoreSession(repo.getKv<Partial<Session>>('session', IDLE_SESSION), lastSeen, now);
    if (this.state.running) this.repo.setKv('session', this.state);
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
    if (this.state.running && this.state.current) this.finalize({ summary: '', outcome: 'Partly done', sizeCheck: this.state.current.size, blocker: false }, now, true);
    this.state = { running: true, startedAt: now, current: task, banked: 0, activeSince: now, paused: null };
    // A linked task that was still in the backlog is now in progress.
    const linked = task.ref ? this.repo.tasks().find((t) => t.id === task.ref) : undefined;
    if (linked && linked.status === 'Backlog') this.repo.saveTask({ ...linked, status: 'In progress' });
    this.persist();
    return this.state;
  }

  stop(result: EndTaskResult, now = Date.now()): { session: Session; entry: Entry } {
    const entry = this.finalize(result, now, false);
    this.state = { ...IDLE_SESSION };
    this.persist();
    return { session: this.state, entry };
  }

  /** Drop the running task without writing an entry (demo re-seed on a new day). */
  discard(): void {
    this.state = { ...IDLE_SESSION };
    this.persist();
  }

  /** Save (or merge into) today's entry for the current task. Mirrors the kit's onFinish merge. */
  private finalize(result: EndTaskResult, now: number, silent: boolean): Entry {
    const cur = this.state.current!;
    // Exact active seconds. "Round entries to 5 min" is applied when the report is built.
    const seconds = this.elapsedSeconds(now);
    const day = dayKey(now);
    const existing = this.repo.entriesForDay(day).find((e) => e.task === cur.task && !e.done);
    const entry: Entry = existing
      ? { ...existing, seconds: existing.seconds + seconds, done: result.outcome === 'Done', outcome: result.outcome, summary: result.summary || existing.summary, blocker: result.blocker || existing.blocker, sizeCheck: result.sizeCheck, size: cur.size, goal: cur.goal }
      : { id: uid(), day, task: cur.task, ref: cur.ref, project: cur.project, startTs: this.state.startedAt ?? now, start: '', seconds, done: result.outcome === 'Done', outcome: result.outcome, summary: result.summary, blocker: result.blocker, sizeCheck: result.sizeCheck, size: cur.size, goal: cur.goal };
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
 * Rebuild the persisted session at launch. A stretch that was active when the app stopped is
 * banked only up to the last moment the app was known to be alive (heartbeat or last sample);
 * the run then resumes now. Sessions saved before active-time accounting existed get their
 * `startedAt` as the stretch start.
 */
export function restoreSession(raw: Partial<Session>, lastSeen: number, now: number): Session {
  if (!raw.running || !raw.startedAt || !raw.current) return { ...IDLE_SESSION };
  const activeSince = raw.activeSince === undefined ? raw.startedAt : raw.activeSince;
  let banked = raw.banked ?? 0;
  if (activeSince) {
    const until = Math.min(now, Math.max(activeSince, lastSeen));
    banked += Math.max(0, until - activeSince) / 1000;
  }
  return { running: true, startedAt: raw.startedAt, current: raw.current, banked, activeSince: now, paused: null };
}
