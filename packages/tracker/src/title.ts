import { BROWSERS, type BrowserInfo } from './browsers';

/** Friendly names for common process names (Windows/Linux) — used when the OS gives no description. */
export const APP_NAMES: Record<string, string> = {
  code: 'VS Code', 'code - insiders': 'VS Code Insiders', cursor: 'Cursor', zed: 'Zed', idea64: 'IntelliJ IDEA', idea: 'IntelliJ IDEA', webstorm64: 'WebStorm', pycharm64: 'PyCharm', rider64: 'Rider', goland64: 'GoLand', clion64: 'CLion', 'sublime_text': 'Sublime Text', devenv: 'Visual Studio', 'android studio': 'Android Studio', studio64: 'Android Studio',
  windowsterminal: 'Windows Terminal', cmd: 'Command Prompt', powershell: 'PowerShell', pwsh: 'PowerShell', wt: 'Windows Terminal', 'gnome-terminal-server': 'Terminal', konsole: 'Konsole', alacritty: 'Alacritty', wezterm: 'WezTerm', 'wezterm-gui': 'WezTerm', kitty: 'kitty', iterm2: 'iTerm', terminal: 'Terminal',
  chrome: 'Google Chrome', msedge: 'Microsoft Edge', brave: 'Brave', arc: 'Arc', vivaldi: 'Vivaldi', opera: 'Opera', chromium: 'Chromium', firefox: 'Firefox', zen: 'Zen', safari: 'Safari',
  slack: 'Slack', discord: 'Discord', teams: 'Microsoft Teams', ms_teams: 'Microsoft Teams', 'ms-teams': 'Microsoft Teams', zoom: 'Zoom', outlook: 'Outlook', olk: 'Outlook', thunderbird: 'Thunderbird', whatsapp: 'WhatsApp', telegram: 'Telegram', signal: 'Signal',
  figma: 'Figma', notion: 'Notion', obsidian: 'Obsidian', linear: 'Linear', postman: 'Postman', 'docker desktop': 'Docker Desktop', dbeaver: 'DBeaver', tableplus: 'TablePlus', explorer: 'File Explorer', finder: 'Finder', spotify: 'Spotify', steam: 'Steam', 'vlc': 'VLC', 'ghostty': 'Ghostty', warp: 'Warp',
};

export function friendlyAppName(processName: string | null | undefined, fallback?: string | null): string {
  if (!processName) return fallback || 'Unknown app';
  const key = processName.toLowerCase().replace(/\.exe$/, '');
  return APP_NAMES[key] || fallback || processName;
}

/** Generic separators apps use between document and app name. */
const SEPS = [' - ', ' — ', ' – ', ' | ', ' · '];

/** Window-title names that differ from the friendly app name. */
const TITLE_ALIASES: Record<string, string[]> = {
  'vs code': ['Visual Studio Code', 'Visual Studio Code - Insiders'],
  'vs code insiders': ['Visual Studio Code - Insiders'],
  'intellij idea': ['IntelliJ IDEA'],
  'windows terminal': ['Windows Terminal'],
  'google chrome': ['Google Chrome'],
  'microsoft edge': ['Microsoft Edge'],
  'file explorer': ['File Explorer'],
};

/**
 * Strip a trailing " - <App name>" from a window title
 * ("timer-sync.ts - api-gateway - Visual Studio Code" → "timer-sync.ts - api-gateway").
 * Matches the app name, its process name, known aliases, or a last segment that ends with the app name as a word.
 */
export function stripAppSuffix(title: string, appNames: string[]): string {
  const t = title.trim();
  const names = appNames.filter(Boolean).flatMap((n) => [n, ...(TITLE_ALIASES[n.toLowerCase()] ?? [])]);
  for (const name of names) {
    for (const sep of SEPS) {
      const suf = sep + name;
      if (t.toLowerCase().endsWith(suf.toLowerCase())) return t.slice(0, -suf.length).trim();
    }
  }
  for (const sep of SEPS) {
    const i = t.lastIndexOf(sep);
    if (i <= 0) continue;
    const last = t.slice(i + sep.length).trim().toLowerCase();
    if (names.some((n) => { const w = n.toLowerCase().replace(/\.exe$/, ''); return w.length > 2 && (last === w || last.endsWith(' ' + w)); })) return t.slice(0, i).trim();
  }
  return t;
}

/** Page title from a browser window title, e.g. "PR #412 · dailybee/api - Google Chrome" → "PR #412 · dailybee/api". */
export function parseBrowserTitle(title: string, browser: BrowserInfo | null): string | null {
  if (!title) return null;
  const list = browser ? [browser] : BROWSERS;
  for (const b of list) {
    for (const suf of b.titleSuffixes) {
      if (title.endsWith(suf)) {
        let t = title.slice(0, -suf.length).trim();
        // Chrome adds " - High memory usage" / " (Incognito)" style tails occasionally; keep simple.
        t = t.replace(/\s+\(Incognito\)$/, '').replace(/\s+- Private Browsing$/, '');
        return t || null;
      }
    }
  }
  return title.trim() || null;
}

/** Detect a browser from a bare window title when process info is missing. */
export function browserFromTitle(title: string): BrowserInfo | null {
  for (const b of BROWSERS) for (const suf of b.titleSuffixes) if (title.endsWith(suf)) return b;
  return null;
}
