import { EventEmitter } from 'node:events';
import { currentStreak, type CategorisedSample } from '@dailybee/tracker';
import { SIZE_HOURS, type Checkin } from '../../shared/types';
import { clock, dayKey, uid } from '../../shared/time';
import type { Repo } from '../repo';
import type { SessionService } from './session';
import type { SettingsService } from './settings';
import type { TrackerService } from './tracker';

export interface CheckinHost {
  showPopup(c: Checkin): void;
  hidePopup(): void;
}

/**
 * Mid-task check-ins: a drift popup after N minutes on a distraction site (policy default 8) and a
 * halfway pulse at 50% of the size estimate. Answers land in the daily report.
 */
export class CheckinService extends EventEmitter {
  active: Checkin | null = null;
  private lastDriftAt = 0;
  private pulsedRun: number | null = null;

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, private readonly session: SessionService, private readonly tracker: TrackerService, private readonly host: CheckinHost) {
    super();
    tracker.on('sample', (s: CategorisedSample) => this.onSample(s));
    session.on('change', () => { this.pulsedRun = null; });
  }

  list(): Checkin[] { return this.repo.checkinsForDay(dayKey()); }

  private onSample(s: CategorisedSample): void {
    if (this.active) return;
    const sess = this.session.get();
    if (!sess.running || !sess.current) return;
    const now = s.ts;
    const policy = this.settings.get().policy;
    // Drift: N minutes on distraction sites, at most one prompt per 15 minutes.
    const streak = currentStreak(this.tracker.todaySamples(), 'distraction', this.tracker.intervalSec);
    if (streak >= policy.driftMinutes * 60 && now - this.lastDriftAt > 15 * 60 * 1000) {
      this.lastDriftAt = now;
      const where = s.domain || s.app;
      this.create('drift', `You have been on ${where} for ${Math.round(streak / 60)} minutes. Still on “${sess.current.task}”?`, s.domain ?? null, now);
      return;
    }
    // Halfway pulse: once per run, at 50% of the size estimate.
    if (policy.halfwayCheckin && this.pulsedRun !== sess.startedAt) {
      const half = (SIZE_HOURS[sess.current.size] * 3600) / 2;
      if (this.session.elapsedSeconds(now) >= half) {
        this.pulsedRun = sess.startedAt;
        this.create('pulse', 'Halfway through your estimate. How is it going?', null, now);
      }
    }
  }

  /** Simulated check-in (Today › "Check-in" button): alternates like the kit. */
  trigger(kind?: 'drift' | 'pulse'): Checkin {
    const k = kind ?? (Math.random() < 0.5 ? 'drift' : 'pulse');
    const task = this.session.get().current?.task ?? 'your task';
    return k === 'drift'
      ? this.create('drift', `You have been on youtube.com for 9 minutes. Still on “${task}”?`, 'youtube.com', Date.now())
      : this.create('pulse', 'Halfway through your estimate. How is it going?', null, Date.now());
  }

  private create(kind: Checkin['kind'], text: string, domain: string | null, ts: number): Checkin {
    const c: Checkin = { id: uid(), day: dayKey(ts), ts, at: clock(ts), kind, text, answer: null, task: this.session.get().current?.task ?? null, domain };
    this.repo.upsertCheckin(c);
    this.active = c;
    this.emit('prompt', c);
    this.emit('change', this.list());
    this.host.showPopup(c);
    return c;
  }

  answer(id: string, answer: string): Checkin[] {
    const c = this.repo.checkin(id);
    if (c) {
      c.answer = answer;
      this.repo.upsertCheckin(c);
      if (c.kind === 'drift' && answer === 'relevant' && c.domain) this.tracker.recategorise({ kind: 'domain', value: c.domain }, 'work');
    }
    if (this.active?.id === id) { this.active = null; this.emit('prompt', null); this.host.hidePopup(); }
    const list = this.list();
    this.emit('change', list);
    return list;
  }

  dismissActive(): void {
    if (!this.active) return;
    this.answer(this.active.id, 'dismiss');
  }
}
