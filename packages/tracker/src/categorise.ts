import type { CategorisedSample, Category, Rule, WindowSample } from './types';

/** Domain → category defaults. Suffix match: "github.com" also matches "gist.github.com". */
const D = (category: Category, ...domains: string[]): Rule[] => domains.map((pattern) => ({ match: 'domain', pattern, category, source: 'default' }));
/** App name / process → category defaults. Case-insensitive; matches app name or process name. */
const A = (category: Category, ...apps: string[]): Rule[] => apps.map((pattern) => ({ match: 'app', pattern, category, source: 'default' }));

export const DEFAULT_RULES: Rule[] = [
  ...D('work', 'github.com', 'gitlab.com', 'bitbucket.org', 'linear.app', 'atlassian.net', 'jira.com', 'figma.com', 'vercel.com', 'app.netlify.com', 'console.aws.amazon.com', 'console.cloud.google.com', 'portal.azure.com', 'sentry.io', 'grafana.net', 'datadoghq.com', 'app.circleci.com', 'dashboard.stripe.com', 'supabase.com', 'railway.app', 'render.com', 'fly.io', 'cloudflare.com', 'localhost', '127.0.0.1', '0.0.0.0', 'dailybee.dev', 'notion.so', 'miro.com', 'app.asana.com', 'trello.com', 'monday.com', 'app.posthog.com', 'mixpanel.com', 'amplitude.com', 'vercel.app', 'ngrok.io', 'ngrok-free.app', 'codesandbox.io', 'stackblitz.com', 'huggingface.co'),
  ...D('research', 'stackoverflow.com', 'stackexchange.com', 'developer.mozilla.org', 'docs.github.com', 'readthedocs.io', 'npmjs.com', 'pypi.org', 'crates.io', 'pkg.go.dev', 'docs.rs', 'google.com', 'bing.com', 'duckduckgo.com', 'kagi.com', 'wikipedia.org', 'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'perplexity.ai', 'gemini.google.com', 'developer.apple.com', 'learn.microsoft.com', 'docs.microsoft.com', 'developer.chrome.com', 'web.dev', 'nodejs.org', 'react.dev', 'typescriptlang.org', 'vitejs.dev', 'vite.dev', 'electronjs.org', 'tailwindcss.com', 'postgresql.org', 'redis.io', 'docker.com', 'kubernetes.io', 'caniuse.com', 'regex101.com', 'jsonlint.com', 'devdocs.io', 'w3.org', 'ietf.org', 'rfc-editor.org', 'arxiv.org', 'scholar.google.com', 'medium.com', 'dev.to', 'hashnode.dev', 'substack.com', 'news.ycombinator.com', 'lobste.rs'),
  ...D('learning', 'frontendmasters.com', 'udemy.com', 'coursera.org', 'egghead.io', 'pluralsight.com', 'educative.io', 'exercism.org', 'leetcode.com', 'codecademy.com', 'khanacademy.org', 'edx.org', 'freecodecamp.org', 'codewars.com', 'hackerrank.com', 'roadmap.sh', 'ocw.mit.edu', 'brilliant.org', 'laracasts.com', 'testingjavascript.com', 'epicreact.dev', 'totaltypescript.com', 'rust-lang.org', 'learnxinyminutes.com', 'udacity.com', 'skillshare.com', 'oreilly.com'),
  ...D('communication', 'slack.com', 'teams.microsoft.com', 'meet.google.com', 'zoom.us', 'discord.com', 'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'calendar.google.com', 'web.whatsapp.com', 'web.telegram.org', 'messenger.com', 'loom.com', 'around.co', 'whereby.com', 'cal.com', 'calendly.com', 'mail.proton.me', 'mail.yahoo.com', 'fastmail.com', 'hey.com', 'intercom.com', 'front.com', 'zendesk.com'),
  ...D('distraction', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'reddit.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'netflix.com', 'twitch.tv', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'ebay.com', 'pinterest.com', 'imgur.com', '9gag.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'theguardian.com', 'linkedin.com', 'threads.net', 'bsky.app', 'mastodon.social', 'primevideo.com', 'disneyplus.com', 'hulu.com', 'hbomax.com', 'max.com', 'spotify.com', 'soundcloud.com', 'steampowered.com', 'store.steampowered.com', 'epicgames.com', 'ign.com', 'espn.com', 'buzzfeed.com', 'dailymail.co.uk', 'temu.com', 'aliexpress.com', 'zalando.com', 'booking.com', 'airbnb.com'),
  ...A('work', 'VS Code', 'Code', 'Code - Insiders', 'Cursor', 'Zed', 'IntelliJ IDEA', 'idea64', 'WebStorm', 'PyCharm', 'Rider', 'GoLand', 'CLion', 'Xcode', 'Android Studio', 'Visual Studio', 'devenv', 'Sublime Text', 'Vim', 'Neovim', 'nvim', 'Emacs', 'Terminal', 'iTerm', 'iTerm2', 'Windows Terminal', 'WindowsTerminal', 'Command Prompt', 'cmd', 'PowerShell', 'pwsh', 'Ghostty', 'Warp', 'Alacritty', 'WezTerm', 'kitty', 'Konsole', 'Postman', 'Insomnia', 'Bruno', 'Docker Desktop', 'TablePlus', 'DBeaver', 'DataGrip', 'Figma', 'Sketch', 'Notion', 'Obsidian', 'Linear', 'Fork', 'GitHub Desktop', 'Sourcetree', 'Tower', 'GitKraken', 'Finder', 'File Explorer', 'explorer', 'Preview', 'Notes', 'TextEdit', 'Notepad', 'Excel', 'Numbers', 'Word', 'Pages', 'Keynote', 'PowerPoint', 'Claude', 'ChatGPT'),
  ...A('communication', 'Slack', 'Discord', 'Microsoft Teams', 'Teams', 'ms-teams', 'Zoom', 'zoom.us', 'Mail', 'Outlook', 'olk', 'Thunderbird', 'Messages', 'WhatsApp', 'Telegram', 'Signal', 'FaceTime', 'Skype', 'Google Meet', 'Webex', 'Loom', 'Around'),
  ...A('distraction', 'Spotify', 'Music', 'Apple Music', 'Netflix', 'Steam', 'Epic Games Launcher', 'Battle.net', 'VLC', 'IINA', 'QuickTime Player', 'Photos', 'TV', 'Podcasts', 'Books', 'Kindle'),
];

/** Domain from a URL: strips scheme, credentials, port, path and a leading "www." */
export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim();
  if (!u) return null;
  if (u.startsWith('chrome://') || u.startsWith('edge://') || u.startsWith('about:') || u.startsWith('brave://') || u.startsWith('arc://') || u.startsWith('vivaldi://') || u.startsWith('opera://')) {
    return u.split(/[/?#]/)[0] || u;
  }
  if (u.startsWith('file://')) return 'file';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Path segments that change while you stay on the same page and must not split it into
 * several rows: map viewports ("/@44.93,25.93,13z"), Google Maps "data=" blobs, session ids.
 */
const VOLATILE_SEGMENT = /^(@|data=|sid=|session=)/i;

/** Query parameters that only carry tracking or playback state; the page is the same without them. */
const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid|igshid|_ga|_gl|spm|ref|ref_src|si|feature|pp|t|start|list|index|start_radio|ab_channel|cid|_hsenc|_hsmi|vero_id)$/i;

const HAS_SCHEME = /^([a-z][a-z0-9+.-]*:\/\/|about:|chrome:|edge:|brave:|vivaldi:|opera:|arc:|file:|data:)/i;

/**
 * The address as a user would paste it: what the browser reported, with a scheme added when the
 * address bar hid it ("youtube.com/watch?v=x" → "https://youtube.com/watch?v=x").
 */
export function fullUrl(url: string): string {
  const u = url.trim();
  return HAS_SCHEME.test(u) ? u : 'https://' + u;
}

/**
 * Page identity for grouping and display: host + path (volatile segments dropped) + the query
 * parameters that identify the page ("youtube.com/watch?v=wvaY5bG5p7A"); tracking params are dropped.
 */
export function displayUrl(url: string, max = 72): string {
  const u = fullUrl(url);
  let out: string;
  try {
    const p = new URL(u);
    const path = p.pathname.split('/').filter((s) => s && !VOLATILE_SEGMENT.test(s)).map((s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } }).join('/');
    const params = [...p.searchParams.entries()].filter(([k]) => k && !TRACKING_PARAMS.test(k));
    const query = params.length ? '?' + params.map(([k, v]) => (v ? `${k}=${v}` : k)).join('&') : '';
    out = p.hostname.replace(/^www\./, '') + (path ? '/' + path : '') + query;
  } catch {
    out = url;
  }
  return out.length > max ? out.slice(0, max - 1) + '…' : out;
}

/** Page-row labels are cut at this many characters; the full address is shown on hover. */
export const TAB_LABEL_MAX_CHARS = 40;

/** Character-count trim for a page row label: the first `max - 1` characters plus an ellipsis. */
export function shortUrl(display: string, max = TAB_LABEL_MAX_CHARS): string {
  return display.length > max ? display.slice(0, max - 1).trimEnd() + '…' : display;
}

const domainMatches = (domain: string, pattern: string): boolean => {
  const p = pattern.toLowerCase().replace(/^www\./, '');
  return domain === p || domain.endsWith('.' + p);
};

const appMatches = (sample: WindowSample, pattern: string): boolean => {
  const p = pattern.toLowerCase();
  const a = sample.app.toLowerCase();
  const proc = (sample.process || '').toLowerCase().replace(/\.exe$/, '');
  return a === p || proc === p || (p.length > 3 && (a.includes(p) || proc.includes(p)));
};

const regexCache = new Map<string, RegExp | null>();
const titleMatches = (title: string, pattern: string): boolean => {
  let re = regexCache.get(pattern);
  if (re === undefined) {
    try { re = new RegExp(pattern, 'i'); } catch { re = null; }
    regexCache.set(pattern, re);
  }
  return re ? re.test(title) : false;
};

/** User overrides win over defaults; among the same source, domain rules beat app rules beat title rules, longer patterns beat shorter. */
export function mergeRules(defaults: Rule[], overrides: Rule[]): Rule[] {
  const order: Record<Rule['match'], number> = { domain: 0, app: 1, title: 2 };
  return [...overrides.map((r) => ({ ...r, source: 'user' as const })), ...defaults].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'user' ? -1 : 1;
    if (order[a.match] !== order[b.match]) return order[a.match] - order[b.match];
    return b.pattern.length - a.pattern.length;
  });
}

export interface CategoriseOptions {
  /** Category for browser pages with no matching rule (default "research") */
  unknownDomain?: Category;
  /** Category for native apps with no matching rule (default "work") */
  unknownApp?: Category;
}

export function categorise(sample: WindowSample, rules: Rule[] = DEFAULT_RULES, opts: CategoriseOptions = {}): CategorisedSample {
  const domain = extractDomain(sample.url);
  for (const r of rules) {
    if (r.match === 'domain') { if (domain && domainMatches(domain, r.pattern)) return { ...sample, category: r.category, domain, matched: true }; continue; }
    if (r.match === 'app') { if (!domain && appMatches(sample, r.pattern)) return { ...sample, category: r.category, domain, matched: true }; continue; }
    if (r.match === 'title') { if (titleMatches(sample.pageTitle || sample.title, r.pattern)) return { ...sample, category: r.category, domain, matched: true }; }
  }
  // Browser with a page title but no URL: try the title against domain rules the user wrote (e.g. "youtube")
  if (sample.browser) return { ...sample, category: opts.unknownDomain ?? 'research', domain, matched: false };
  return { ...sample, category: opts.unknownApp ?? 'work', domain, matched: false };
}

export function categoriseAll(samples: WindowSample[], rules: Rule[] = DEFAULT_RULES, opts?: CategoriseOptions): CategorisedSample[] {
  return samples.map((s) => categorise(s, rules, opts));
}
