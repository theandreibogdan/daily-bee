import type { BrowserId } from './types';

export interface BrowserInfo {
  id: BrowserId;
  label: string;
  /** Windows process names (without .exe), lower-case */
  processNames: string[];
  /** macOS bundle identifiers */
  bundleIds: string[];
  /** macOS app names as reported by NSWorkspace */
  appNames: string[];
  /** Scripting dictionary family used for AppleScript/JXA URL capture */
  automation: 'chrome' | 'safari' | 'none';
  /** Window-title suffixes to strip when parsing the page title */
  titleSuffixes: string[];
  /** UI Automation names of the address bar (Windows) */
  addressBarNames: string[];
}

const CHROME_BAR = ['Address and search bar', 'Address bar'];

export const BROWSERS: BrowserInfo[] = [
  { id: 'chrome', label: 'Google Chrome', processNames: ['chrome'], bundleIds: ['com.google.Chrome', 'com.google.Chrome.canary', 'com.google.Chrome.beta'], appNames: ['Google Chrome', 'Google Chrome Canary'], automation: 'chrome', titleSuffixes: [' - Google Chrome'], addressBarNames: CHROME_BAR },
  { id: 'edge', label: 'Microsoft Edge', processNames: ['msedge'], bundleIds: ['com.microsoft.edgemac', 'com.microsoft.edgemac.Dev', 'com.microsoft.edgemac.Beta'], appNames: ['Microsoft Edge'], automation: 'chrome', titleSuffixes: [' - Microsoft Edge', ' - Microsoft​ Edge'], addressBarNames: CHROME_BAR },
  { id: 'brave', label: 'Brave', processNames: ['brave'], bundleIds: ['com.brave.Browser'], appNames: ['Brave Browser'], automation: 'chrome', titleSuffixes: [' - Brave'], addressBarNames: CHROME_BAR },
  { id: 'arc', label: 'Arc', processNames: ['arc'], bundleIds: ['company.thebrowser.Browser'], appNames: ['Arc'], automation: 'chrome', titleSuffixes: [' - Arc'], addressBarNames: CHROME_BAR },
  { id: 'vivaldi', label: 'Vivaldi', processNames: ['vivaldi'], bundleIds: ['com.vivaldi.Vivaldi'], appNames: ['Vivaldi'], automation: 'chrome', titleSuffixes: [' - Vivaldi'], addressBarNames: CHROME_BAR },
  { id: 'opera', label: 'Opera', processNames: ['opera'], bundleIds: ['com.operasoftware.Opera'], appNames: ['Opera'], automation: 'chrome', titleSuffixes: [' - Opera'], addressBarNames: CHROME_BAR },
  { id: 'chromium', label: 'Chromium', processNames: ['chromium'], bundleIds: ['org.chromium.Chromium'], appNames: ['Chromium'], automation: 'chrome', titleSuffixes: [' - Chromium'], addressBarNames: CHROME_BAR },
  { id: 'zen', label: 'Zen', processNames: ['zen'], bundleIds: ['app.zen-browser.zen'], appNames: ['Zen', 'Zen Browser'], automation: 'none', titleSuffixes: [' — Zen Browser', ' - Zen Browser', ' — Zen', ' - Zen'], addressBarNames: ['Search or enter address', 'Search with Google or enter address'] },
  { id: 'orion', label: 'Orion', processNames: ['orion'], bundleIds: ['com.kagi.kagimacOS'], appNames: ['Orion'], automation: 'safari', titleSuffixes: [' — Orion', ' - Orion'], addressBarNames: [] },
  { id: 'safari', label: 'Safari', processNames: ['safari'], bundleIds: ['com.apple.Safari', 'com.apple.SafariTechnologyPreview'], appNames: ['Safari', 'Safari Technology Preview'], automation: 'safari', titleSuffixes: [' — Safari', ' - Safari'], addressBarNames: [] },
  { id: 'firefox', label: 'Firefox', processNames: ['firefox'], bundleIds: ['org.mozilla.firefox', 'org.mozilla.firefoxdeveloperedition', 'org.mozilla.nightly'], appNames: ['Firefox', 'Firefox Developer Edition', 'Firefox Nightly'], automation: 'none', titleSuffixes: [' — Mozilla Firefox', ' - Mozilla Firefox', ' — Mozilla Firefox Private Browsing', ' — Firefox Developer Edition', ' - Firefox Developer Edition', ' — Firefox Nightly'], addressBarNames: ['Search or enter address', 'Search with Google or enter address', 'Search with DuckDuckGo or enter address'] },
];

const byProcess = new Map<string, BrowserInfo>();
const byBundle = new Map<string, BrowserInfo>();
const byApp = new Map<string, BrowserInfo>();
for (const b of BROWSERS) {
  for (const p of b.processNames) byProcess.set(p.toLowerCase(), b);
  for (const id of b.bundleIds) byBundle.set(id.toLowerCase(), b);
  for (const n of b.appNames) byApp.set(n.toLowerCase(), b);
}

export function browserByProcess(processName: string | null | undefined): BrowserInfo | null {
  if (!processName) return null;
  const p = processName.toLowerCase().replace(/\.exe$/, '');
  return byProcess.get(p) ?? null;
}
export function browserByBundle(bundleId: string | null | undefined): BrowserInfo | null {
  if (!bundleId) return null;
  return byBundle.get(bundleId.toLowerCase()) ?? null;
}
export function browserByAppName(app: string | null | undefined): BrowserInfo | null {
  if (!app) return null;
  return byApp.get(app.toLowerCase()) ?? null;
}
export function browserById(id: BrowserId | null | undefined): BrowserInfo | null {
  return id ? BROWSERS.find((b) => b.id === id) ?? null : null;
}
export function isBrowserProcess(processName: string | null | undefined): boolean {
  return browserByProcess(processName) !== null;
}
