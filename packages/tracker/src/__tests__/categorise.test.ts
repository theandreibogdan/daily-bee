import { describe, expect, it } from 'vitest';
import { categorise, DEFAULT_RULES, displayUrl, extractDomain, fullUrl, mergeRules, shortUrl } from '../categorise';
import type { Rule, WindowSample } from '../types';

const base: WindowSample = { ts: 0, app: 'Google Chrome', process: 'chrome', title: 'x - Google Chrome', url: null, pageTitle: null, browser: 'chrome', urlSource: 'none', idle: false };
const web = (url: string): WindowSample => ({ ...base, url, urlSource: 'accessibility' });
const native = (app: string, process: string | null = null): WindowSample => ({ ...base, app, process, browser: null, title: app });

describe('extractDomain', () => {
  it('strips scheme, www, port and path', () => {
    expect(extractDomain('https://www.github.com/dailybee/api/pull/412')).toBe('github.com');
    expect(extractDomain('localhost:5173/today')).toBe('localhost');
    expect(extractDomain('github.com/dailybee')).toBe('github.com');
    expect(extractDomain('chrome://settings/')).toBe('chrome:');
    expect(extractDomain(null)).toBeNull();
  });
  it('displayUrl keeps host, path and identifying query params', () => {
    expect(displayUrl('https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API#y')).toBe('developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API');
    expect(displayUrl('https://www.youtube.com/')).toBe('youtube.com');
    expect(displayUrl('https://www.youtube.com/watch?v=wvaY5bG5p7A')).toBe('youtube.com/watch?v=wvaY5bG5p7A');
    // tracking / playback params do not make a new page
    expect(displayUrl('https://www.youtube.com/watch?v=wvaY5bG5p7A&t=42s&si=abc&list=PL1&index=3')).toBe('youtube.com/watch?v=wvaY5bG5p7A');
    expect(displayUrl('https://example.com/page?utm_source=x&utm_medium=y&id=7')).toBe('example.com/page?id=7');
    // the address bar hides the scheme; that must not change the identity
    expect(displayUrl('youtube.com/watch?v=wvaY5bG5p7A')).toBe(displayUrl('https://www.youtube.com/watch?v=wvaY5bG5p7A'));
  });
  it('fullUrl restores a scheme the address bar hid', () => {
    expect(fullUrl('youtube.com/watch?v=wvaY5bG5p7A')).toBe('https://youtube.com/watch?v=wvaY5bG5p7A');
    expect(fullUrl('https://www.youtube.com/watch?v=wvaY5bG5p7A')).toBe('https://www.youtube.com/watch?v=wvaY5bG5p7A');
    expect(fullUrl('localhost:5173/today')).toBe('https://localhost:5173/today');
    expect(fullUrl('chrome://settings/')).toBe('chrome://settings/');
  });
  it('shortUrl trims page rows by character count', () => {
    expect(shortUrl('github.com/dailybee/api/pull/412')).toBe('github.com/dailybee/api/pull/412');
    expect(shortUrl('developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API')).toBe('developer.mozilla.org/en-US/docs/Web/AP…');
    expect(shortUrl('google.com/maps/place/Ploiesti Customs Office')).toBe('google.com/maps/place/Ploiesti Customs…');
    expect(shortUrl('developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API').length).toBe(40);
    expect(shortUrl('abc', 3)).toBe('abc');
    expect(shortUrl('abcd', 3)).toBe('ab…');
  });
  it('displayUrl drops volatile segments so one page stays one row', () => {
    const a = displayUrl('https://www.google.com/maps/place/Ploiesti+Customs+Office/@44.9323628,25.9397448,13z/data=!3m1!4b1');
    const b = displayUrl('https://www.google.com/maps/place/Ploiesti+Customs+Office/@44.9357904,25.9259643,13z/data=!4m6!3m5');
    expect(a).toBe('google.com/maps/place/Ploiesti Customs Office');
    expect(b).toBe(a);
  });
});

describe('categorise', () => {
  it('uses domain suffix rules for browser pages', () => {
    expect(categorise(web('https://github.com/dailybee/api/pull/412')).category).toBe('work');
    expect(categorise(web('https://gist.github.com/x')).category).toBe('work');
    expect(categorise(web('https://www.youtube.com/watch?v=1')).category).toBe('distraction');
    expect(categorise(web('https://developer.mozilla.org/x')).category).toBe('research');
    expect(categorise(web('https://frontendmasters.com/courses/rust-ts')).category).toBe('learning');
    expect(categorise(web('https://app.slack.com/client')).category).toBe('communication');
  });
  it('falls back to research for unknown domains and work for unknown apps', () => {
    const u = categorise(web('https://some-unknown-site.example'));
    expect(u.category).toBe('research');
    expect(u.matched).toBe(false);
    expect(categorise(native('Mystery App', 'mystery')).category).toBe('work');
  });
  it('matches native apps by name or process', () => {
    expect(categorise(native('VS Code', 'Code')).category).toBe('work');
    expect(categorise(native('Slack', 'slack')).category).toBe('communication');
    expect(categorise(native('Spotify', 'Spotify')).category).toBe('distraction');
  });
  it('lets user overrides win over defaults', () => {
    const rules = mergeRules(DEFAULT_RULES, [{ match: 'domain', pattern: 'youtube.com', category: 'learning', source: 'user' } satisfies Rule]);
    expect(categorise(web('https://www.youtube.com/watch?v=1'), rules).category).toBe('learning');
    // other defaults untouched
    expect(categorise(web('https://reddit.com/r/x'), rules).category).toBe('distraction');
  });
  it('supports title regex rules', () => {
    const rules = mergeRules(DEFAULT_RULES, [{ match: 'title', pattern: 'rust for ts', category: 'learning', source: 'user' }]);
    expect(categorise({ ...native('Preview', 'Preview'), title: 'Rust for TS devs.pdf' }, rules).category).toBe('learning');
  });
});
