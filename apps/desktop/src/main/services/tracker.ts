import { EventEmitter } from 'node:events';
import { aggregateActivity, buildTimeline, categorise, categoryMix, createSampler, DEFAULT_RULES, iconForApp, mergeRules, sampleSeconds, stripAppSuffix, displayUrl, type CategorisedSample, type Category, type Rule, type Sampler, type WindowSample } from '@dailybee/tracker';
import type { ActivitySummary, DayDigest, DaySummary, RecategoriseTarget } from '../../shared/types';
import { atTime, dayKey, floorHour } from '../../shared/time';

/** Raw samples are kept for today and yesterday; older days live on as digests. */
const RAW_SAMPLE_DAYS = 1;
/** How the sampler reports DailyBee's own windows; never one of the "top apps". */
export const SELF_APP = 'DailyBee';

/** The breakdown Today shows, computed from a day's samples (in time order). */
export function digestFromSamples(samples: CategorisedSample[], intervalSec: number): DayDigest {
  const active = samples.filter((s) => !s.idle);
  const firstTs = active[0]?.ts ?? null;
  const lastTs = active.length ? active[active.length - 1]!.ts : null;
  const weights = sampleSeconds(samples, intervalSec);
  return {
    rows: aggregateActivity(samples, intervalSec),
    mix: categoryMix(samples, intervalSec, { weights, include: (s) => s.tracked !== false }),
    timeline: buildTimeline(samples, { intervalSec, from: firstTs !== null ? floorHour(firstTs) : undefined, to: lastTs !== null ? lastTs + intervalSec * 1000 : undefined }),
    firstTs, lastTs, sampleCount: samples.length, intervalSec,
  };
}

/** Trimmed, lower-cased, de-duplicated, ".exe" dropped. */
export function normaliseApps(list: string[] | undefined): string[] {
  return [...new Set((list ?? []).map((x) => x.trim().toLowerCase().replace(/\.exe$/, '')).filter(Boolean))];
}

const EMPTY_DIGEST = (intervalSec: number): DayDigest => ({ rows: [], mix: categoryMix([], intervalSec), timeline: [], firstTs: null, lastTs: null, sampleCount: 0, intervalSec });
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
  /** Settings › Tracking › Private apps, lower-cased; matching samples are dropped before they are stored */
  private excluded: string[] = [];
  /** Seconds today in private apps that were not recorded (one interval per dropped sample) */
  private privateSeconds = 0;

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, private readonly session: SessionService, private readonly opts: TrackerOptions) {
    super();
    this.reloadRules();
    this.samples = repo.samplesForDay(this.day);
    this.excluded = normaliseApps(settings.get().tracking.excludedApps);
    settings.on('change', () => this.applySettings());
  }

  /** Is this window one of the private apps? App name or process name, case-insensitive. */
  isPrivate(s: { app: string; process: string | null }): boolean {
    if (!this.excluded.length) return false;
    const app = s.app.trim().toLowerCase();
    const proc = (s.process ?? '').trim().toLowerCase().replace(/\.exe$/, '');
    return this.excluded.some((x) => x === app || (!!proc && x === proc));
  }

  get intervalSec(): number { return this.settings.get().tracking.intervalSec || 3; }
  get sampler_(): Sampler | null { return this.sampler; }

  start(): void {
    this.maintain();
    if (this.opts.demo) { this.live = false; this.emitSummary(); return; }
    this.applySettings();
  }

  /** Summarise finished days into digests and drop raw samples older than yesterday. */
  private maintain(): void {
    try {
      const interval = this.intervalSec;
      for (const day of this.repo.daysWithSamples()) {
        if (day === this.day || this.repo.digest(day)) continue;
        this.repo.saveDigest(day, digestFromSamples(this.repo.samplesForDay(day), interval));
      }
      this.repo.pruneSamplesBefore(dayKey(Date.now() - RAW_SAMPLE_DAYS * 86_400_000));
    } catch (e) {
      this.opts.log('[tracker] digest maintenance failed: ' + String(e));
    }
  }

  /**
   * A day's breakdown: today from the live tracker; a past day from its stored samples (digested on
   * first use) or the saved digest; empty when nothing was captured.
   */
  summaryForDay(day: string): DayDigest & { source: DaySummary['source'] } {
    const interval = this.intervalSec;
    if (day === this.day) return { ...digestFromSamples(this.samples, interval), source: 'live' };
    const stored = this.repo.digest(day);
    if (stored) return { ...stored, source: 'digest' };
    const samples = this.repo.samplesForDay(day);
    if (samples.length) {
      const d = digestFromSamples(samples, interval);
      this.repo.saveDigest(day, d);
      return { ...d, source: 'samples' };
    }
    return { ...EMPTY_DIGEST(interval), source: 'none' };
  }

  /** App names only (never titles or URLs), busiest first, DailyBee itself left out — from samples while they exist, else the digest. */
  topAppsForDay(day: string, limit = 3): string[] {
    const live = this.repo.appNamesForDay(day, limit, [SELF_APP]);
    if (live.length) return live;
    const rows = this.repo.digest(day)?.rows ?? [];
    return [...new Set(rows.map((r) => r.app).filter((a) => a !== SELF_APP))].slice(0, limit);
  }

  stop(): void {
    this.sampler?.stop();
    this.sampler = null;
    this.live = false;
  }

  private applySettings(): void {
    const t = this.settings.get().tracking;
    // An app declared private from now on: its captures for today go too, titles and pages included.
    const next = normaliseApps(t.excludedApps);
    for (const app of next.filter((x) => !this.excluded.includes(x))) {
      const gone = this.repo.deleteSamplesForApp(this.day, app);
      const kept = this.samples.filter((s) => !(s.app.trim().toLowerCase() === app || (s.process ?? '').trim().toLowerCase().replace(/\.exe$/, '') === app));
      if (gone || kept.length !== this.samples.length) this.opts.log(`[tracker] ${app} is private: removed ${Math.max(gone, this.samples.length - kept.length)} captures from today`);
      this.samples = kept;
    }
    this.excluded = next;
    if (this.opts.demo) { this.emitSummary(); return; }
    this.stop();
    if (!t.enabled) { this.emitSummary(); return; }
    this.sampler = createSampler({
      intervalMs: (t.intervalSec || 3) * 1000,
      idleThresholdSec: t.idleDetection ? Math.max(60, t.idleMinutes * 60) : Number.MAX_SAFE_INTEGER,
      captureBrowser: t.captureBrowser,
      getIdleSeconds: this.opts.getIdleSeconds,
      selfPid: process.pid,
      selfAppName: SELF_APP,
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
  ingest(raw: WindowSample, tracked?: boolean): CategorisedSample | null {
    const day = dayKey(raw.ts);
    if (day !== this.day) {
      // Midnight: freeze the finished day's breakdown, then start the new one.
      if (this.samples.length) this.repo.saveDigest(this.day, digestFromSamples(this.samples, this.intervalSec));
      this.day = day;
      this.samples = [];
      this.privateSeconds = 0;
      this.maintain();
    }
    // Private apps are never stored: the time shows as a gap, counted only as a total.
    if (this.isPrivate(raw)) { this.privateSeconds += this.intervalSec; return null; }
    const s = categorise(raw, this.rules);
    const current = this.session.get().current;
    s.tracked = tracked ?? !!current;
    this.samples.push(s);
    this.repo.insertSample(s, s.tracked ? (current?.task ?? '') : null);
    return s;
  }

  private onSample(raw: WindowSample): void {
    const s = this.ingest(raw);
    if (s) this.emit('sample', s);
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
    // The timeline runs from the top of the first sample's hour (09:00 on the kit's day) to now.
    const from = firstTs !== null ? floorHour(firstTs) : atTime('09:00', this.day);
    // Each sample is worth the real gap to the next one (capped), not a fixed interval.
    const weights = sampleSeconds(this.samples, interval);
    const last = active[active.length - 1];
    const current = last && now - last.ts < interval * 1000 * 4
      ? { app: last.app, detail: last.url ? displayUrl(last.url, 60) : last.pageTitle || stripAppSuffix(last.title, [last.app, last.process || '']), icon: iconForApp(last.app), cat: last.category, tracked: last.tracked !== false }
      : null;
    return {
      rows: aggregateActivity(this.samples, interval),
      // Focus / category mix counts time inside tasks only; untracked time is shown gray instead.
      mix: categoryMix(this.samples, interval, { weights, include: (s) => s.tracked !== false }),
      timeline: buildTimeline(this.samples, { intervalSec: interval, from, to: now }),
      current,
      sampleCount: this.samples.length,
      intervalSec: interval,
      firstTs,
      live: this.live,
      paused: !this.opts.demo && !this.settings.get().tracking.enabled,
      privateSeconds: this.privateSeconds,
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
