/** Activity categories (mirrors @dailybee/ui's list; kept dependency-free for the main process). */
export const CATEGORIES = ['work', 'research', 'learning', 'communication', 'distraction'] as const;
export type Category = (typeof CATEGORIES)[number];
export type TimelineCategory = Category | 'break';

export type BrowserId =
  | 'chrome' | 'edge' | 'brave' | 'arc' | 'vivaldi' | 'opera' | 'chromium' | 'zen' | 'orion'
  | 'safari' | 'firefox';

/** How the page URL was obtained. */
export type UrlSource = 'automation' | 'accessibility' | 'sessionstore' | 'title' | 'none';

/** One foreground-window observation (raw, uncategorised). Stored on-device only. */
export interface WindowSample {
  /** epoch ms */
  ts: number;
  /** Friendly app name: "Google Chrome", "VS Code", "Slack" */
  app: string;
  /** OS process name / bundle id when known */
  process: string | null;
  /** Raw window title */
  title: string;
  /** Browser page URL, when the OS let us read it */
  url: string | null;
  /** Browser page title (from automation, or parsed from the window title) */
  pageTitle: string | null;
  browser: BrowserId | null;
  urlSource: UrlSource;
  /** System idle beyond the configured threshold */
  idle: boolean;
}

export interface CategorisedSample extends WindowSample {
  category: Category;
  /** Registrable-ish domain ("github.com"), null for non-browser samples */
  domain: string | null;
  /** True when a rule matched (false = default category applied) */
  matched: boolean;
}

export type RuleMatch = 'domain' | 'app' | 'title';

export interface Rule {
  id?: number;
  match: RuleMatch;
  /** domain: suffix match ("github.com" matches gist.github.com); app: case-insensitive equal/contains; title: regex */
  pattern: string;
  category: Category;
  source: 'default' | 'user';
}

export interface TabRow {
  /** Page identity: host + path + identifying query, no tracking params (grouping key) */
  url: string;
  /** `url` cut to TAB_LABEL_MAX_CHARS characters */
  label: string;
  /** The complete address as the browser reported it, scheme included (hover / copy); "" when only a title was captured */
  fullUrl: string;
  /** Page title from the browser */
  title: string | null;
  seconds: number;
  cat: Category;
}

/** One row of the Today › Activity list (app, or browser × category). */
export interface ActivityRow {
  key: string;
  app: string;
  /** Lucide icon name */
  icon: string;
  detail: string;
  cat: Category;
  seconds: number;
  /** Browser rows expand into tab/page rows; null for native apps */
  tabs: TabRow[] | null;
}

export interface TimelineSegment {
  /** epoch ms */
  start: number;
  end: number;
  cat: TimelineCategory;
}

export interface CategoryMix {
  seconds: Record<Category, number>;
  /** Integer percentages that sum to 100 (0s when no samples) */
  percent: Record<Category, number>;
  /** work + research + learning share, integer % */
  focus: number;
  total: number;
}

export type PermissionState = 'granted' | 'denied' | 'unknown' | 'not-required';

export interface PermissionStatus {
  id: string;
  name: string;
  description: string;
  state: PermissionState;
  /** Can the app open the OS settings pane / trigger a prompt? */
  requestable: boolean;
}

export interface SamplerOptions {
  /** Poll interval, default 3000ms (2–5s per handoff) */
  intervalMs?: number;
  /** Seconds without input before samples are marked idle, default 600 */
  idleThresholdSec?: number;
  /** Read browser tab URL/title through OS automation / accessibility, default true */
  captureBrowser?: boolean;
  /** Injected by the host (Electron powerMonitor.getSystemIdleTime); returns seconds */
  getIdleSeconds?: () => number;
  /** Process id of the host app itself (default: process.pid); its windows are reported as `selfAppName` */
  selfPid?: number;
  /** Name to report for the host app's own windows (default "DailyBee") */
  selfAppName?: string;
  /** Optional logger */
  log?: (msg: string) => void;
}

export interface Sampler {
  start(onSample: (s: WindowSample) => void): void;
  stop(): void;
  /** Take a single sample now (used by tests and the Settings "test capture" action). */
  sampleOnce(): Promise<WindowSample>;
  /** Current OS permission checklist for this platform. */
  permissions(): Promise<PermissionStatus[]>;
  /** process.platform of the host ("darwin" | "win32" | "linux" | …) */
  readonly platform: string;
}
