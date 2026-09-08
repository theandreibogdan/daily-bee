import { describe, expect, it } from 'vitest';
import { scrubForSync } from '../services/sync';
import { deepMerge, DEFAULT_SETTINGS } from '../services/settings';

describe('scrubForSync (privacy rule: URLs never leave the device)', () => {
  it('drops page-level keys at any depth and redacts URL-shaped text', () => {
    const out = scrubForSync({
      day: '2026-09-07',
      topApps: ['VS Code', 'Google Chrome'],
      entries: [{ task: 'Fix login on https://app.example.com/login', url: 'https://x', title: 'secret', tabs: [['github.com/x', 1]] }],
      nested: { pageTitle: 'p', domain: 'github.com', keep: 'see www.example.org today' },
    });
    expect(JSON.stringify(out)).not.toMatch(/https?:\/\/|www\./);
    expect(out.entries[0]).toEqual({ task: 'Fix login on [url]' });
    expect(out.nested).toEqual({ keep: 'see [url] today' });
    expect(out.topApps).toEqual(['VS Code', 'Google Chrome']);
  });
});

describe('deepMerge', () => {
  it('merges nested patches without dropping siblings and never enables managersSeeUrls', () => {
    const s = deepMerge(DEFAULT_SETTINGS, { tracking: { intervalSec: 5 }, policy: { driftMinutes: 12 } });
    expect(s.tracking.intervalSec).toBe(5);
    expect(s.tracking.captureBrowser).toBe(true);
    expect(s.policy.driftMinutes).toBe(12);
    expect(s.policy.reportTime).toBe('18:00');
    expect(s.policy.managersSeeUrls).toBe(false);
  });
});
