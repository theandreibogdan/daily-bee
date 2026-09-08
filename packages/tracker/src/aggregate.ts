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

export function categoryMix(samples: CategorisedSample[], intervalSec: number): CategoryMix {
  const seconds = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const s of samples) if (!s.idle) seconds[s.category] += intervalSec;
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
  for (const s of samples) {
    if (s.idle) continue;
    const browser = isBrowserSample(s);
    const key = browser ? `${s.app}|${s.category}` : s.app;
    let a = acc.get(key);
    if (!a) {
      a = { row: { key, app: s.app, icon: iconForApp(s.app), detail: '', cat: s.category, seconds: 0, tabs: browser ? [] : null }, titles: new Map(), tabs: new Map(), domains: new Map() };
      acc.set(key, a);
    }
    a.row.seconds += intervalSec;
    if (browser) {
      const url = s.url ? displayUrl(s.url) : null;
      const label = url ?? (s.pageTitle || s.title || 'Unknown page');
      const t = a.tabs.get(label) ?? { seconds: 0, title: s.pageTitle, cat: s.category, fullUrl: '' };
      t.seconds += intervalSec;
      if (s.pageTitle) t.title = s.pageTitle;
      if (s.url) t.fullUrl = fullUrl(s.url);
      a.tabs.set(label, t);
      if (s.domain) a.domains.set(s.domain, (a.domains.get(s.domain) ?? 0) + intervalSec);
    } else {
      const t = stripAppSuffix(s.title, [s.app, s.process || '']);
      if (t) a.titles.set(t, (a.titles.get(t) ?? 0) + intervalSec);
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
  return rows.sort((x, y) => y.seconds - x.seconds);
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
  const segs: TimelineSegment[] = [];
  let prevTs = -1;
  for (const s of sorted) {
    const cat = s.idle ? 'break' : s.category;
    const end = s.ts + opts.intervalSec * 1000;
    const last = segs[segs.length - 1];
    if (last && prevTs >= 0 && s.ts - prevTs > gapMs) {
      segs.push({ start: last.end, end: s.ts, cat: 'break' });
    }
    const cur = segs[segs.length - 1];
    if (cur && cur.cat === cat && s.ts - cur.end <= gapMs) cur.end = end;
    else segs.push({ start: s.ts, end, cat });
    prevTs = s.ts;
  }
  if (opts.to !== undefined && segs.length) segs[segs.length - 1]!.end = Math.max(segs[segs.length - 1]!.end, Math.min(opts.to, segs[segs.length - 1]!.end + gapMs));
  // Merge tiny segments into their predecessor so the bar stays readable.
  const merged: TimelineSegment[] = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && s.end - s.start < minMs) { prev.end = s.end; continue; }
    if (prev && prev.cat === s.cat && s.start <= prev.end) { prev.end = Math.max(prev.end, s.end); continue; }
    merged.push({ ...s });
  }
  return merged;
}

/** Seconds spent on a category in the last `windowSec` seconds (drift detection). */
export function recentSeconds(samples: CategorisedSample[], cat: Category, windowSec: number, intervalSec: number, now = Date.now()): number {
  const from = now - windowSec * 1000;
  return samples.filter((s) => s.ts >= from && !s.idle && s.category === cat).length * intervalSec;
}

/** Longest current run (in seconds) of consecutive non-idle samples on `cat`, ending now. */
export function currentStreak(samples: CategorisedSample[], cat: Category, intervalSec: number): number {
  let n = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]!;
    if (s.idle || s.category !== cat) break;
    n++;
  }
  return n * intervalSec;
}
