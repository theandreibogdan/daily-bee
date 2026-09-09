import { browserByProcess, browserByAppName } from './browsers';
import { displayUrl, fullUrl, shortUrl } from './categorise';
import { stripAppSuffix } from './title';
import { CATEGORIES, type ActivityRow, type CategorisedSample, type Category, type CategoryMix, type TabRow, type TimelineSegment } from './types';

const ICONS: Array<[RegExp, string]> = [
  [/^dailybee$/i, 'timer'],
  [/chrome|edge|brave|arc|vivaldi|opera|chromium|firefox|safari|zen|orion/i, 'globe'],
  [/code|cursor|zed|intellij|idea|webstorm|pycharm|rider|goland|clion|xcode|android studio|visual studio|sublime|vim|emacs/i, 'code-2'],
  [/terminal|iterm|cmd|powershell|pwsh|ghostty|warp|alacritty|wezterm|kitty|konsole/i, 'terminal'],
  [/slack|discord|teams|zoom|messages|whatsapp|telegram|signal|skype|meet|webex/i, 'message-square'],
  [/mail|outlook|thunderbird/i, 'mail'],
  [/figma|sketch/i, 'pen-tool'],
  [/notion|obsidian|notes|textedit|notepad|word|pages/i, 'file-text'],
  [/finder|explorer/i, 'folder'],
  [/spotify|music|podcasts/i, 'music'],
  [/netflix|vlc|iina|quicktime|tv/i, 'play'],
  [/docker|postman|insomnia|bruno|tableplus|dbeaver|datagrip/i, 'server'],
  [/linear|jira|asana|trello/i, 'list-checks'],
];

export function iconForApp(app: string): string {
  for (const [re, icon] of ICONS) if (re.test(app)) return icon;
  return 'app-window';
}

const isBrowserSample = (s: CategorisedSample): boolean => !!s.browser || !!browserByProcess(s.process) || !!browserByAppName(s.app);

/** Integer percentages that sum to 100 (largest-remainder rounding). */
export function toPercentages(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const floors = raw.map(Math.floor);
  let rem = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - floors[i]! })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) { if (rem <= 0) break; floors[i]!++; rem--; }
  return floors;
}

/**
 * Seconds each sample stands for: the real gap to the next sample, so a slow or skipped tick still
 * counts its time, capped at 3 × interval (a longer gap means the app was not sampling — sleep,
 * a crash — and the sample is worth one interval). The last sample is worth one interval.
 * Samples must be in time order.
 */
export function sampleSeconds(samples: CategorisedSample[], intervalSec: number): number[] {
  const cap = intervalSec * 3;
  return samples.map((s, i) => {
    const next = samples[i + 1];
    if (!next) return intervalSec;
    const gap = (next.ts - s.ts) / 1000;
    return gap > 0 && gap <= cap ? gap : intervalSec;
  });
}

export interface MixOptions {
  /** Per-sample seconds aligned with `samples` (default: sampleSeconds) */
  weights?: number[];
  /** Count only these samples; weights still come from the full list so neighbours are unaffected */
  include?: (s: CategorisedSample) => boolean;
}

export function categoryMix(samples: CategorisedSample[], intervalSec: number, opts: MixOptions = {}): CategoryMix {
  const seconds = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  const w = opts.weights ?? sampleSeconds(samples, intervalSec);
  samples.forEach((s, i) => { if (!s.idle && (!opts.include || opts.include(s))) seconds[s.category] += w[i] ?? intervalSec; });
  const pct = toPercentages(CATEGORIES.map((c) => seconds[c]));
  const percent = Object.fromEntries(CATEGORIES.map((c, i) => [c, pct[i]])) as Record<Category, number>;
  const total = CATEGORIES.reduce((a, c) => a + seconds[c], 0);
  return { seconds, percent, focus: percent.work + percent.research + percent.learning, total };
}

/**
 * Today › Activity rows. Native apps group by app; browsers group by (browser, category)
 * and expand into per-page tab rows. Sorted by time descending.
 */
export function aggregateActivity(samples: CategorisedSample[], intervalSec: number, maxTabs = 8): ActivityRow[] {
  type Acc = { row: ActivityRow; titles: Map<string, number>; tabs: Map<string, { seconds: number; title: string | null; cat: Category; fullUrl: string }>; domains: Map<string, number> };
  const acc = new Map<string, Acc>();
  const weights = sampleSeconds(samples, intervalSec);
  for (const [i, s] of samples.entries()) {
    if (s.idle) continue;
    const seconds = weights[i] ?? intervalSec;
    const browser = isBrowserSample(s);
    const tracked = s.tracked !== false;
    // Time captured while no task was running is grouped apart so it can be shown gray.
    const key = (tracked ? 't|' : 'u|') + (browser ? `${s.app}|${s.category}` : s.app);
    let a = acc.get(key);
    if (!a) {
      a = { row: { key, app: s.app, icon: iconForApp(s.app), detail: '', cat: s.category, seconds: 0, tabs: browser ? [] : null, tracked }, titles: new Map(), tabs: new Map(), domains: new Map() };
      acc.set(key, a);
    }
    a.row.seconds += seconds;
    if (browser) {
      const url = s.url ? displayUrl(s.url) : null;
      const label = url ?? (s.pageTitle || s.title || 'Unknown page');
      const t = a.tabs.get(label) ?? { seconds: 0, title: s.pageTitle, cat: s.category, fullUrl: '' };
      t.seconds += seconds;
      if (s.pageTitle) t.title = s.pageTitle;
      if (s.url) t.fullUrl = fullUrl(s.url);
      a.tabs.set(label, t);
      if (s.domain) a.domains.set(s.domain, (a.domains.get(s.domain) ?? 0) + seconds);
    } else {
      const t = stripAppSuffix(s.title, [s.app, s.process || '']);
      if (t) a.titles.set(t, (a.titles.get(t) ?? 0) + seconds);
    }
  }
  const top = <K,>(m: Map<K, number>): K | undefined => [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const rows: ActivityRow[] = [];
  for (const a of acc.values()) {
    if (a.row.tabs) {
      const tabs: TabRow[] = [...a.tabs.entries()].map(([url, t]) => ({ url, label: shortUrl(url), fullUrl: t.fullUrl, title: t.title, seconds: t.seconds, cat: t.cat })).sort((x, y) => y.seconds - x.seconds);
      a.row.tabs = tabs.slice(0, maxTabs);
      const dom = top(a.domains);
      const first = tabs[0];
      const pages = tabs.length;
      a.row.detail = dom ? `${dom} · ${first?.title ? first.title : pages > 1 ? pages + ' pages' : first?.url ?? ''}` : first?.title || first?.url || 'Pages';
      if (a.row.detail.length > 90) a.row.detail = a.row.detail.slice(0, 89) + '…';
    } else {
      a.row.detail = top(a.titles) ?? '';
    }
    rows.push(a.row);
  }
  // Tracked rows first, then untracked ("no task") rows; longest first within each group.
  return rows.sort((x, y) => Number(y.tracked) - Number(x.tracked) || y.seconds - x.seconds);
}

export interface TimelineOptions {
  /** epoch ms; segments before this are dropped */
  from?: number;
  /** epoch ms; defaults to the last sample */
  to?: number;
  /** A gap between samples longer than this becomes a break (default 3 × interval + 5s) */
  gapSec?: number;
  /** Segments shorter than this merge into the previous one (default 60s) */
  minSegmentSec?: number;
  intervalSec: number;
}

/** Stacked category segments from 09:00 → now. Idle samples and sampling gaps become breaks. */
export function buildTimeline(samples: CategorisedSample[], opts: TimelineOptions): TimelineSegment[] {
  const gapMs = (opts.gapSec ?? opts.intervalSec * 3 + 5) * 1000;
  const minMs = (opts.minSegmentSec ?? 60) * 1000;
  const sorted = [...samples].filter((s) => opts.from === undefined || s.ts >= opts.from).sort((a, b) => a.ts - b.ts);
  const weights = sampleSeconds(sorted, opts.intervalSec);
  const segs: TimelineSegment[] = [];
  let prevTs = -1;
  for (const [i, s] of sorted.entries()) {
    const cat = s.idle ? 'break' : s.category;
    const tracked = s.idle ? true : s.tracked !== false;
    const end = s.ts + (weights[i] ?? opts.intervalSec) * 1000;
    const last = segs[segs.length - 1];
    if (last && prevTs >= 0 && s.ts - prevTs > gapMs) {
      segs.push({ start: last.end, end: s.ts, cat: 'break', tracked: true });
    }
    const cur = segs[segs.length - 1];
    if (cur && cur.cat === cat && cur.tracked === tracked && s.ts - cur.end <= gapMs) cur.end = end;
    else segs.push({ start: s.ts, end, cat, tracked });
    prevTs = s.ts;
  }
  if (opts.to !== undefined && segs.length) segs[segs.length - 1]!.end = Math.max(segs[segs.length - 1]!.end, Math.min(opts.to, segs[segs.length - 1]!.end + gapMs));
  // Merge tiny segments into their predecessor so the bar stays readable.
  const merged: TimelineSegment[] = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && s.end - s.start < minMs) { prev.end = s.end; continue; }
    if (prev && prev.cat === s.cat && prev.tracked === s.tracked && s.start <= prev.end) { prev.end = Math.max(prev.end, s.end); continue; }
    merged.push({ ...s });
  }
  return merged;
}

/** Seconds spent on a category in the last `windowSec` seconds (drift detection). */
export function recentSeconds(samples: CategorisedSample[], cat: Category, windowSec: number, intervalSec: number, now = Date.now()): number {
  const from = now - windowSec * 1000;
  const w = sampleSeconds(samples, intervalSec);
  return samples.reduce((a, s, i) => (s.ts >= from && !s.idle && s.category === cat ? a + (w[i] ?? intervalSec) : a), 0);
}

/** Longest current run (in seconds) of consecutive non-idle samples on `cat`, ending now. */
export function currentStreak(samples: CategorisedSample[], cat: Category, intervalSec: number): number {
  const w = sampleSeconds(samples, intervalSec);
  let total = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]!;
    if (s.idle || s.category !== cat) break;
    total += w[i] ?? intervalSec;
  }
  return total;
}
