import { EventEmitter } from 'node:events';
import { aggregateActivity, buildTimeline, categorise, categoryMix, createSampler, DEFAULT_RULES, iconForApp, mergeRules, stripAppSuffix, displayUrl, type CategorisedSample, type Category, type Rule, type Sampler, type WindowSample } from '@dailybee/tracker';
import type { ActivitySummary, RecategoriseTarget } from '../../shared/types';
import { atTime, dayKey } from '../../shared/time';
import type { Repo } from '../repo';
import type { SessionService } from './session';
import type { SettingsService } from './settings';

export interface TrackerOptions {
  demo: boolean;
  getIdleSeconds: () => number;
  log: (m: string) => void;
}

/**
 * Runs the OS sampler, categorises each sample against default + user rules, stores it locally and
 * publishes the aggregated Today view (activity rows, mix, timeline, current app).
 */
export class TrackerService extends EventEmitter {
  private samples: CategorisedSample[] = [];
  private day = dayKey();
  private rules: Rule[] = DEFAULT_RULES;
  private sampler: Sampler | null = null;
  private live = false;

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, private readonly session: SessionService, private readonly opts: TrackerOptions) {
    super();
    this.reloadRules();
    this.samples = repo.samplesForDay(this.day);
    settings.on('change', () => this.applySettings());
  }

  get intervalSec(): number { return this.settings.get().tracking.intervalSec || 3; }
  get sampler_(): Sampler | null { return this.sampler; }

  start(): void {
    if (this.opts.demo) { this.live = false; this.emitSummary(); return; }
    this.applySettings();
  }

  stop(): void {
    this.sampler?.stop();
    this.sampler = null;
    this.live = false;
  }

  private applySettings(): void {
    if (this.opts.demo) return;
    const t = this.settings.get().tracking;
    this.stop();
    if (!t.enabled) { this.emitSummary(); return; }
    this.sampler = createSampler({
      intervalMs: (t.intervalSec || 3) * 1000,
      idleThresholdSec: t.idleDetection ? Math.max(60, t.idleMinutes * 60) : Number.MAX_SAFE_INTEGER,
      captureBrowser: t.captureBrowser,
      getIdleSeconds: this.opts.getIdleSeconds,
      selfPid: process.pid,
      selfAppName: 'DailyBee',
      log: this.opts.log,
    });
    this.sampler.start((s) => this.onSample(s));
    this.live = true;
    this.emitSummary();
  }

  /**
   * Store one sample. Samples taken while no task is running are kept (and shown gray) but flagged
   * untracked; `tracked` overrides that for seeded data.
   */
  ingest(raw: WindowSample, tracked?: boolean): CategorisedSample {
    const day = dayKey(raw.ts);
    if (day !== this.day) { this.day = day; this.samples = []; }
    const s = categorise(raw, this.rules);
    const current = this.session.get().current;
    s.tracked = tracked ?? !!current;
    this.samples.push(s);
    this.repo.insertSample(s, s.tracked ? (current?.task ?? '') : null);
    return s;
  }

  private onSample(raw: WindowSample): void {
    const s = this.ingest(raw);
    this.emit('sample', s);
    this.emitSummary();
  }

  reloadRules(): void {
    this.rules = mergeRules(DEFAULT_RULES, this.repo.rules());
  }

  userRules(): Rule[] { return this.repo.rules(); }

  removeRule(id: number): Rule[] {
    this.repo.removeRule(id);
    this.reloadRules();
    return this.repo.rules();
  }

  /** "Recategorise": remember a rule and rewrite today's samples so the mix updates immediately. */
  recategorise(target: RecategoriseTarget, cat: Category): ActivitySummary {
    this.repo.upsertRule(target.kind, target.value, cat);
    this.reloadRules();
    this.repo.recategoriseSamples(this.day, target, cat);
    for (const s of this.samples) {
      if (target.kind === 'domain' ? s.domain === target.value || s.domain?.endsWith('.' + target.value) : s.app === target.value && !s.domain) { s.category = cat; s.matched = true; }
    }
    const sum = this.summary();
    this.emit('summary', sum);
    return sum;
  }

  todaySamples(): CategorisedSample[] { return this.samples; }

  summary(now = Date.now()): ActivitySummary {
    const interval = this.intervalSec;
    const active = this.samples.filter((s) => !s.idle);
    const firstTs = active[0]?.ts ?? null;
    const from = Math.min(atTime('09:00', this.day), firstTs ?? Number.MAX_SAFE_INTEGER);
    const last = active[active.length - 1];
    const current = last && now - last.ts < interval * 1000 * 4
      ? { app: last.app, detail: last.url ? displayUrl(last.url, 60) : last.pageTitle || stripAppSuffix(last.title, [last.app, last.process || '']), icon: iconForApp(last.app), cat: last.category }
      : null;
    return {
      rows: aggregateActivity(this.samples, interval),
      // Focus / category mix counts time inside tasks only; untracked time is shown gray instead.
      mix: categoryMix(this.samples.filter((s) => s.tracked !== false), interval),
      timeline: buildTimeline(this.samples, { intervalSec: interval, from, to: now }),
      current,
      sampleCount: this.samples.length,
      intervalSec: interval,
      firstTs,
      live: this.live,
    };
  }

  private emitTimer: NodeJS.Timeout | null = null;
  emitSummary(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => { this.emitTimer = null; this.emit('summary', this.summary()); }, 250);
  }

  async permissions() {
    return this.sampler ? this.sampler.permissions() : createSampler({ log: this.opts.log }).permissions();
  }

  async testCapture(): Promise<WindowSample> {
    const s = this.sampler ?? createSampler({ captureBrowser: true, log: this.opts.log });
    return s.sampleOnce();
  }
}
