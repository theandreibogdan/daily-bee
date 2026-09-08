import { describe, expect, it } from 'vitest';
import { aggregateActivity, buildTimeline, categoryMix, currentStreak, toPercentages } from '../aggregate';
import { categorise } from '../categorise';
import type { CategorisedSample, WindowSample } from '../types';

const T0 = Date.parse('2026-09-07T09:05:00');
const mk = (i: number, partial: Partial<WindowSample>): CategorisedSample =>
  categorise({ ts: T0 + i * 3000, app: 'VS Code', process: 'Code', title: 'timer-sync.ts - api-gateway - Visual Studio Code', url: null, pageTitle: null, browser: null, urlSource: 'none', idle: false, ...partial });

describe('toPercentages', () => {
  it('sums to 100 with largest-remainder rounding', () => {
    expect(toPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(toPercentages([0, 0])).toEqual([0, 0]);
    expect(toPercentages([2580, 840, 660, 420, 540]).reduce((a, b) => a + b)).toBe(100);
  });
});

describe('categoryMix', () => {
  it('counts seconds per category and focus share, ignoring idle', () => {
    const s = [mk(0, {}), mk(1, {}), mk(2, { app: 'Slack', process: 'slack', title: 'Slack' }), mk(3, { idle: true })];
    const m = categoryMix(s, 3);
    expect(m.seconds.work).toBe(6);
    expect(m.seconds.communication).toBe(3);
    expect(m.total).toBe(9);
    expect(m.percent.work + m.percent.communication).toBe(100);
    expect(m.focus).toBe(m.percent.work);
  });
});

describe('aggregateActivity', () => {
  it('groups native apps by app and browsers by category with tab rows', () => {
    const chrome = (i: number, url: string, pageTitle: string) => mk(i, { app: 'Google Chrome', process: 'chrome', browser: 'chrome', url, pageTitle, urlSource: 'accessibility', title: pageTitle + ' - Google Chrome' });
    const s = [mk(0, {}), mk(1, {}), chrome(2, 'https://github.com/dailybee/api/pull/412', 'PR #412'), chrome(3, 'https://github.com/dailybee/api/actions', 'Actions'), chrome(4, 'https://www.youtube.com/watch?v=1', 'Video')];
    const rows = aggregateActivity(s, 3);
    const code = rows.find((r) => r.app === 'VS Code')!;
    expect(code.seconds).toBe(6);
    expect(code.detail).toBe('timer-sync.ts - api-gateway');
    expect(code.icon).toBe('code-2');
    expect(code.tabs).toBeNull();
    const gh = rows.find((r) => r.app === 'Google Chrome' && r.cat === 'work')!;
    expect(gh.tabs?.length).toBe(2);
    expect(gh.tabs?.[0]?.url).toBe('github.com/dailybee/api/pull/412');
    expect(gh.tabs?.[0]?.fullUrl).toBe('https://github.com/dailybee/api/pull/412');
    expect(gh.tabs?.[0]?.title).toBe('PR #412');
    const ytRow = rows.find((r) => r.app === 'Google Chrome' && r.cat === 'distraction')!;
    expect(ytRow.tabs?.[0]?.url).toBe('youtube.com/watch?v=1');
    expect(ytRow.tabs?.[0]?.fullUrl).toBe('https://www.youtube.com/watch?v=1');
    expect(gh.detail.startsWith('github.com · ')).toBe(true);
    const yt = rows.find((r) => r.app === 'Google Chrome' && r.cat === 'distraction')!;
    expect(yt.seconds).toBe(3);
  });
});

describe('buildTimeline', () => {
  it('merges consecutive samples and inserts breaks on gaps', () => {
    const s = [mk(0, {}), mk(1, {}), mk(2, {}), mk(200, { app: 'Slack', process: 'slack', title: 'Slack' }), mk(201, { app: 'Slack', process: 'slack', title: 'Slack' })];
    const segs = buildTimeline(s, { intervalSec: 3, minSegmentSec: 0 });
    expect(segs.map((x) => x.cat)).toEqual(['work', 'break', 'communication']);
    expect(segs[0]!.end - segs[0]!.start).toBe(9000);
    expect(segs[1]!.start).toBe(segs[0]!.end);
  });
  it('marks idle samples as break', () => {
    const s = [mk(0, {}), mk(1, { idle: true }), mk(2, { idle: true })];
    expect(buildTimeline(s, { intervalSec: 3, minSegmentSec: 0 }).map((x) => x.cat)).toEqual(['work', 'break']);
  });
});

describe('currentStreak', () => {
  it('measures the trailing run on a category', () => {
    const yt = (i: number) => mk(i, { app: 'Google Chrome', process: 'chrome', browser: 'chrome', url: 'https://youtube.com/watch', urlSource: 'accessibility' });
    expect(currentStreak([mk(0, {}), yt(1), yt(2), yt(3)], 'distraction', 3)).toBe(9);
    expect(currentStreak([yt(0), mk(1, {})], 'distraction', 3)).toBe(0);
  });
});
