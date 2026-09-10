import { EventEmitter } from 'node:events';
import type { AwayChoice, AwayPrompt, EndTaskResult, Entry, Session } from '../../shared/types';
import { uid } from '../../shared/time';
import type { Away } from './presence';
import type { SessionService } from './session';
import type { SettingsService } from './settings';

/** Time away shorter than this is not worth a question. */
export const MIN_AWAY_SECONDS = 120;
/** "Stop when I left" with less than this on the clock drops the run instead of saving a sliver. */
export const MIN_ENTRY_SECONDS = 60;

export interface AwayDecision { prompt: AwayPrompt; choice: AwayChoice; /** For 'stop': the saved entry, or null when there was nothing worth saving */ entry?: Entry | null }

/**
 * The question asked when you come back after time away while a task was running. Presence pauses
 * the timer when you leave and resumes it when you are back; the away stretch is already left out.
 * The prompt lets you count it as work after all, or end the task at the moment you left. One
 * prompt at a time, tied to the run it concerns; a stop or a new task makes it moot.
 */
export class AwayService extends EventEmitter {
  pending: AwayPrompt | null = null;
  private left: { away: Away; startedAt: number; activeSeconds: number } | null = null;

  constructor(private readonly session: SessionService, private readonly settings: SettingsService, private readonly now: () => number = Date.now) {
    super();
    session.on('change', (s: Session) => {
      if (this.pending && (!s.running || s.startedAt !== this.pending.startedAt)) this.clear();
      if (this.left && (!s.running || s.startedAt !== this.left.startedAt)) this.left = null;
    });
  }

  /** Presence says you left; called after the session paused, so its reading is the one you left at. */
  onAway(a: Away): void {
    const s = this.session.get();
    if (!s.running || !s.current || s.startedAt === null) { this.left = null; return; }
    // Idle is backdated to the last input, which can lie before the task started: the stretch begins with the task at the earliest.
    this.left = { away: { ...a, since: Math.max(a.since, s.startedAt) }, startedAt: s.startedAt, activeSeconds: Math.floor(s.banked) };
  }

  /** Presence says you are back; called after the session resumed. The prompt, when the stretch deserves one. */
  onBack(at: number): AwayPrompt | null {
    const left = this.left;
    this.left = null;
    if (!left) return null;
    const s = this.session.get();
    if (!s.running || !s.current || s.startedAt !== left.startedAt) return null;
    if (!this.settings.get().tracking.awayPrompt) return null;
    const seconds = Math.round((at - left.away.since) / 1000);
    if (seconds < MIN_AWAY_SECONDS) return null;
    if (this.pending) this.clear();
    this.pending = { id: uid(), task: s.current.task, startedAt: left.startedAt, reason: left.away.reason, since: left.away.since, until: at, seconds, activeSeconds: left.activeSeconds };
    this.emit('prompt', this.pending);
    return this.pending;
  }

  get(): AwayPrompt | null { return this.pending; }

  /** discard = leave the away time out (already the case); keep = count it as work after all. */
  choose(id: string, choice: 'discard' | 'keep'): AwayPrompt | null {
    const p = this.take(id);
    if (!p) return null;
    if (choice === 'keep') this.session.bank(p.seconds);
    this.emit('decided', { prompt: p, choice } satisfies AwayDecision);
    return p;
  }

  /**
   * stop = end the task at the moment you left, with the reading the timer showed then; the wrap-up
   * comes from the End dialog. Under a minute on the clock means there is nothing worth an entry:
   * the run is dropped and `entry` is null.
   */
  stop(id: string, result: EndTaskResult): { session: Session; entry: Entry | null } | null {
    const p = this.take(id);
    if (!p) return null;
    let entry: Entry | null = null;
    if (p.activeSeconds < MIN_ENTRY_SECONDS) this.session.discard();
    else entry = this.session.stop(result, this.now(), { endedAt: p.since, seconds: p.activeSeconds }).entry;
    this.emit('decided', { prompt: p, choice: 'stop', entry } satisfies AwayDecision);
    return { session: this.session.get(), entry };
  }

  /** The profile is closing, or the question no longer applies. */
  dismiss(): void { this.clear(); }

  private take(id: string): AwayPrompt | null {
    const p = this.pending;
    if (!p || p.id !== id) return null;
    this.pending = null;
    this.emit('prompt', null);
    return p;
  }

  private clear(): void {
    if (!this.pending) return;
    this.pending = null;
    this.emit('prompt', null);
  }
}
