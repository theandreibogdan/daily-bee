import { EventEmitter } from 'node:events';
import { currentStreak, type CategorisedSample } from '@dailybee/tracker';
import { SIZE_HOURS, type Checkin, type CheckinKind } from '../../shared/types';
import { clock, dayKey, uid } from '../../shared/time';
import type { Repo } from '../repo';
import type { SessionService } from './session';
import type { SettingsService } from './settings';
import type { TrackerService } from './tracker';

export interface CheckinHost {
  /** Small popup (drift / pulse): in-app when focused, floating window otherwise */
  showPopup(c: Checkin): void;
  hidePopup(): void;
  /** Full-screen warning overlay on the display in use */
  showOverlay(c: Checkin): void;
  hideOverlay(): void;
}

const fmtSeconds = (s: number): string => (s >= 90 ? `${Math.round(s / 60)} minutes` : `${Math.round(s)} seconds`);

/**
 * Mid-task check-ins:
 *  - warning: full-screen overlay after `warningSeconds` on a distraction site while a task runs
 *    (quiet for `snoozeMinutes` after "Taking a break"; a short cooldown after "Back to it")
 *  - drift: small popup after `driftMinutes` on a distraction site (when the overlay is off)
 *  - pulse: halfway through the size estimate
 * Answers land in the daily report.
 */
export class CheckinService extends EventEmitter {
  active: Checkin | null = null;
  private lastDriftAt = -Infinity;
  private lastWarningAt = -Infinity;
  private snoozedUntil = 0;
  private pulsedRun: number | null = null;
  private simulateIndex = 0;

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, private readonly session: SessionService, private readonly tracker: TrackerService, private readonly host: CheckinHost) {
    super();
    tracker.on('sample', (s: CategorisedSample) => this.onSample(s));
  }

  list(): Checkin[] { return this.repo.checkinsForDay(dayKey()); }

  private onSample(s: CategorisedSample): void {
    if (this.active) return;
    const sess = this.session.get();
    if (!sess.running || !sess.current) return;
    const now = s.ts;
    const policy = this.settings.get().policy;
    const streak = currentStreak(this.tracker.todaySamples(), 'distraction', this.tracker.intervalSec);
    const where = s.domain || s.app;
    // Full-screen warning: a distraction site in front while working.
    if (policy.fullscreenWarning) {
      const cooldown = 2 * 60 * 1000;
      if (streak >= policy.warningSeconds && now >= this.snoozedUntil && now - this.lastWarningAt > cooldown) {
        this.lastWarningAt = now;
        this.create('warning', `You have been on ${where} for ${fmtSeconds(streak)} while working on “${sess.current.task}”.`, s.domain ?? null, now);
        return;
      }
    } else if (streak >= policy.driftMinutes * 60 && now - this.lastDriftAt > 15 * 60 * 1000) {
      // Drift popup (small): at most one per 15 minutes.
      this.lastDriftAt = now;
      this.create('drift', `You have been on ${where} for ${Math.round(streak / 60)} minutes. Still on “${sess.current.task}”?`, s.domain ?? null, now);
      return;
    }
    // Halfway pulse: once per run (keyed by the run's start), at 50% of the size estimate.
    if (policy.halfwayCheckin && this.pulsedRun !== sess.startedAt) {
      const half = (SIZE_HOURS[sess.current.size] * 3600) / 2;
      if (this.session.elapsedSeconds(now) >= half) {
        this.pulsedRun = sess.startedAt;
        this.create('pulse', 'Halfway through your estimate. How is it going?', null, now);
      }
    }
  }

  /** Simulated check-in (Today › "Check-in" button): cycles drift → pulse → warning. */
  trigger(kind?: CheckinKind): Checkin {
    const kinds: CheckinKind[] = ['drift', 'pulse', 'warning'];
    const k = kind ?? kinds[this.simulateIndex++ % kinds.length]!;
    const task = this.session.get().current?.task ?? 'your task';
    if (k === 'pulse') return this.create('pulse', 'Halfway through your estimate. How is it going?', null, Date.now());
    if (k === 'warning') return this.create('warning', `You have been on tiktok.com for 45 seconds while working on “${task}”.`, 'tiktok.com', Date.now());
    return this.create('drift', `You have been on youtube.com for 9 minutes. Still on “${task}”?`, 'youtube.com', Date.now());
  }

  private create(kind: CheckinKind, text: string, domain: string | null, ts: number): Checkin {
    const c: Checkin = { id: uid(), day: dayKey(ts), ts, at: clock(ts), kind, text, answer: null, task: this.session.get().current?.task ?? null, domain };
    this.repo.upsertCheckin(c);
    this.active = c;
    this.emit('prompt', c);
    this.emit('change', this.list());
    if (kind === 'warning') this.host.showOverlay(c); else this.host.showPopup(c);
    return c;
  }

  answer(id: string, answer: string): Checkin[] {
    const c = this.repo.checkin(id);
    if (c) {
      c.answer = answer;
      this.repo.upsertCheckin(c);
      const policy = this.settings.get().policy;
      if ((c.kind === 'drift' || c.kind === 'warning') && answer === 'relevant' && c.domain) this.tracker.recategorise({ kind: 'domain', value: c.domain }, 'work');
      if (c.kind === 'warning' && answer === 'break') this.snoozedUntil = Date.now() + policy.snoozeMinutes * 60 * 1000;
      if (c.kind === 'warning' && (answer === 'back' || answer === 'dismiss')) this.lastWarningAt = Date.now();
    }
    if (this.active?.id === id) {
      this.active = null;
      this.emit('prompt', null);
      this.host.hidePopup();
      this.host.hideOverlay();
    }
    const list = this.list();
    this.emit('change', list);
    return list;
  }

  dismissActive(): void {
    if (!this.active) return;
    this.answer(this.active.id, 'dismiss');
  }
}
