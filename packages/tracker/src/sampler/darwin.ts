import { execFile } from 'node:child_process';
import { BROWSERS, browserByBundle, browserByAppName } from '../browsers';
import { readFirefoxActiveTab } from '../firefox';
import { parseBrowserTitle } from '../title';
import type { BrowserId, PermissionStatus, SamplerOptions } from '../types';
import { EMPTY, isSelf, looksLikeUrl, selfSample, type Provider, type RawSample } from './provider';

/**
 * macOS provider (JXA through `osascript`, one short process per sample):
 *  - frontmost app via NSWorkspace, window title via System Events (needs Accessibility)
 *  - page URL/title via the browser's own scripting dictionary — Chrome-family
 *    (`URL of active tab of front window`) and Safari-family (`URL of current tab`) — which needs
 *    the per-browser Automation permission; macOS prompts on first use.
 * Firefox has no dictionary: we fall back to its session store, then to the window title.
 */
const JXA = String.raw`
function run(argv) {
  const wantUrl = argv[0] === 'url';
  const chromeLike = JSON.parse(argv[1] || '[]');
  const safariLike = JSON.parse(argv[2] || '[]');
  ObjC.import('AppKit');
  const ws = $.NSWorkspace.sharedWorkspace;
  const front = ws.frontmostApplication;
  const app = ObjC.unwrap(front.localizedName) || '';
  const bundle = ObjC.unwrap(front.bundleIdentifier) || '';
  const pid = front.processIdentifier;
  let title = '', axError = null;
  try {
    const se = Application('System Events');
    const procs = se.applicationProcesses.whose({ unixId: pid })();
    if (procs.length) { const wins = procs[0].windows(); if (wins.length) title = wins[0].name() || ''; }
  } catch (e) { axError = String(e); }
  let url = null, pageTitle = null, autoError = null;
  if (wantUrl && bundle) {
    try {
      if (chromeLike.indexOf(bundle) >= 0) {
        const b = Application(bundle);
        if (b.windows.length) { const t = b.windows[0].activeTab; url = t.url(); pageTitle = t.title(); }
      } else if (safariLike.indexOf(bundle) >= 0) {
        const s = Application(bundle);
        if (s.windows.length) { const t = s.windows[0].currentTab; url = t.url(); pageTitle = t.name(); }
      }
    } catch (e) { autoError = String(e); }
  }
  return JSON.stringify({ app, bundle, pid, title, url, pageTitle, axError, autoError });
}
`;

interface JxaReply { app: string; bundle: string; pid: number; title: string; url: string | null; pageTitle: string | null; axError: string | null; autoError: string | null }

const CHROME_LIKE = BROWSERS.filter((b) => b.automation === 'chrome').flatMap((b) => b.bundleIds);
const SAFARI_LIKE = BROWSERS.filter((b) => b.automation === 'safari').flatMap((b) => b.bundleIds);

const isDenied = (err: string | null): boolean => !!err && /-1743|not authori[sz]ed|-25211|-1719|assistive access|-10004/i.test(err);

export function createDarwinProvider(opts: SamplerOptions = {}): Provider {
  const log = opts.log ?? (() => {});
  let sampled = false;
  let lastAxError: string | null = null;
  const automation = new Map<BrowserId, string | null>(); // browser → last error (null = ok)

  const runJxa = (wantUrl: boolean): Promise<JxaReply> => new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', JXA, wantUrl ? 'url' : 'sample', JSON.stringify(CHROME_LIKE), JSON.stringify(SAFARI_LIKE)], { timeout: 4000, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(String(stdout).trim()) as JxaReply); } catch (e) { reject(e); }
    });
  });

  return {
    async sample(wantUrl: boolean): Promise<RawSample> {
      let r: JxaReply;
      try { r = await runJxa(wantUrl); } catch (e) { log('[tracker/darwin] ' + String(e)); return EMPTY; }
      sampled = true;
      lastAxError = r.axError;
      if (isSelf(r.pid, opts, r.bundle, r.title)) return selfSample(r.title || '', opts);
      const browser = browserByBundle(r.bundle) ?? browserByAppName(r.app);
      const app = browser ? browser.label : (r.app || 'Unknown app');
      if (!browser) return { app, process: r.bundle || null, title: r.title || '', url: null, pageTitle: null, browser: null, urlSource: 'none' };
      let url: string | null = null;
      let pageTitle: string | null = r.pageTitle || parseBrowserTitle(r.title || '', browser);
      let urlSource: RawSample['urlSource'] = 'title';
      if (wantUrl) {
        if (browser.automation !== 'none') automation.set(browser.id, r.autoError);
        if (looksLikeUrl(r.url)) { url = r.url; urlSource = 'automation'; }
        else if (browser.id === 'firefox' || browser.id === 'zen') {
          const ff = readFirefoxActiveTab('darwin');
          if (ff && (!pageTitle || !ff.title || ff.title === pageTitle)) { url = ff.url; pageTitle = pageTitle ?? ff.title; urlSource = 'sessionstore'; }
        }
      }
      return { app, process: r.bundle || null, title: r.title || '', url, pageTitle, browser: browser.id, urlSource };
    },
    async permissions(): Promise<PermissionStatus[]> {
      const list: PermissionStatus[] = [
        { id: 'accessibility', name: 'Accessibility', description: 'Active window and address bar', state: !sampled ? 'unknown' : isDenied(lastAxError) ? 'denied' : 'granted', requestable: true },
      ];
      for (const b of BROWSERS) {
        if (b.automation === 'none') continue;
        const err = automation.get(b.id);
        const state: PermissionStatus['state'] = err === undefined ? 'unknown' : isDenied(err) ? 'denied' : 'granted';
        list.push({ id: 'automation:' + b.id, name: 'Automation · ' + b.label, description: 'Active tab URL and title', state, requestable: true });
      }
      list.push({ id: 'screen', name: 'Screen Recording', description: 'Window titles for non-browser apps', state: 'unknown', requestable: true });
      return list;
    },
    dispose() { /* per-sample processes, nothing to keep */ },
  };
}
