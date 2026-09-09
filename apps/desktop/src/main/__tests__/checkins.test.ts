import { EventEmitter } from 'node:events';
import type { CategorisedSample } from '@dailybee/tracker';
import { describe, expect, it } from 'vitest';
import type { Checkin } from '../../shared/types';
import { CheckinService, type CheckinHost } from '../services/checkins';
import { DEFAULT_SETTINGS, deepMerge } from '../services/settings';
import type { Repo } from '../repo';
import type { SessionService } from '../services/session';
import type { SettingsService } from '../services/settings';
import type { TrackerService } from '../services/tracker';

const INTERVAL = 3;

function sample(ts: number, category: CategorisedSample['category'], domain: string | null): CategorisedSample {
  return { ts, app: domain ? 'Google Chrome' : 'VS Code', process: null, title: domain ?? 'main.ts', url: domain ? `https://${domain}/` : null, pageTitle: null, browser: domain ? 'chrome' : null, urlSource: 'none', idle: false, category, domain, matched: true, tracked: true };
}

/** Minimal in-memory stand-ins for the services the check-in logic talks to. */
function harness(policy: Partial<typeof DEFAULT_SETTINGS.policy> = {}, running = true) {
  const checkins = new Map<string, Checkin>();
  const repo = {
    upsertCheckin: (c: Checkin) => { checkins.set(c.id, { ...c }); },
    checkin: (id: string) => checkins.get(id) ?? null,
    checkinsForDay: () => [...checkins.values()],
  } as unknown as Repo;
  const settings = { get: () => deepMerge(DEFAULT_SETTINGS, { policy }) } as unknown as SettingsService;
  const session = Object.assign(new EventEmitter(), {
    get: () => (running ? { running: true, startedAt: 0, current: { task: 'Timer sync', ref: null, project: 'DailyBee', size: 'Large', goal: '' } } : { running: false, startedAt: null, current: null }),
    elapsedSeconds: () => 60,
  }) as unknown as SessionService;
  const samples: CategorisedSample[] = [];
  const recategorised: Array<[string, string]> = [];
  const tracker = Object.assign(new EventEmitter(), {
    intervalSec: INTERVAL,
    todaySamples: () => samples,
    recategorise: (t: { kind: string; value: string }, cat: string) => { recategorised.push([t.value, cat]); },
  }) as unknown as TrackerService;
  const shown: string[] = [];
  const host: CheckinHost = { showPopup: () => shown.push('popup'), hidePopup: () => shown.push('hide-popup'), showOverlay: () => shown.push('overlay'), hideOverlay: () => shown.push('hide-overlay') };
  const svc = new CheckinService(repo, settings, session, tracker, host);
  /** Feed one sample as the tracker would: append, then emit. */
  const tick = (ts: number, category: CategorisedSample['category'], domain: string | null) => { const s = sample(ts, category, domain); samples.push(s); tracker.emit('sample', s); };
  return { svc, tick, shown, recategorised, checkins };
}

const SEC = 1000;

describe('CheckinService full-screen warning', () => {
  it('opens the overlay once the distraction streak reaches warningSeconds while a task runs', () => {
    const h = harness({ warningSeconds: 9 });
    h.tick(0, 'work', null);
    h.tick(3 * SEC, 'distraction', 'tiktok.com');
    h.tick(6 * SEC, 'distraction', 'tiktok.com');
    expect(h.shown).toEqual([]);
    h.tick(9 * SEC, 'distraction', 'tiktok.com');
    expect(h.shown).toEqual(['overlay']);
    const c = h.svc.active!;
    expect(c.kind).toBe('warning');
    expect(c.domain).toBe('tiktok.com');
    expect(c.text).toContain('tiktok.com');
    expect(c.text).toContain('“Timer sync”');
  });

  it('does nothing when no task is running or the warning is switched off', () => {
    const idle = harness({ warningSeconds: 3 }, false);
    for (let i = 0; i < 5; i++) idle.tick(i * 3 * SEC, 'distraction', 'tiktok.com');
    expect(idle.shown).toEqual([]);
    const off = harness({ warningSeconds: 3, fullscreenWarning: false, driftMinutes: 1 });
    for (let i = 0; i < 5; i++) off.tick(i * 3 * SEC, 'distraction', 'tiktok.com');
    expect(off.shown).toEqual([]);
    for (let i = 5; i < 21; i++) off.tick(i * 3 * SEC, 'distraction', 'tiktok.com');
    expect(off.shown).toEqual(['popup']);
    expect(off.svc.active?.kind).toBe('drift');
  });

  it('stays quiet for snoozeMinutes after "Taking a break" and recategorises on "This is work"', () => {
    const h = harness({ warningSeconds: 3, snoozeMinutes: 1 });
    const t0 = Date.now();
    h.tick(t0, 'distraction', 'tiktok.com');
    expect(h.shown).toEqual(['overlay']);
    h.svc.answer(h.svc.active!.id, 'break');
    expect(h.shown).toEqual(['overlay', 'hide-popup', 'hide-overlay']);
    expect(h.svc.active).toBeNull();
    // Within the snooze window: no new warning even though the streak keeps growing.
    h.tick(t0 + 30 * SEC, 'distraction', 'tiktok.com');
    expect(h.shown).toHaveLength(3);
    // After the snooze (and the 2-minute cooldown): warns again.
    h.tick(t0 + 150 * SEC, 'distraction', 'tiktok.com');
    expect(h.shown).toHaveLength(4);
    h.svc.answer(h.svc.active!.id, 'relevant');
    expect(h.recategorised).toEqual([['tiktok.com', 'work']]);
    const answers = [...h.checkins.values()].map((c) => c.answer);
    expect(answers).toEqual(['break', 'relevant']);
  });

  it('simulated check-ins cycle drift → pulse → warning and route to the right surface', () => {
    const h = harness();
    expect(h.svc.trigger().kind).toBe('drift');
    h.svc.dismissActive();
    expect(h.svc.trigger().kind).toBe('pulse');
    h.svc.dismissActive();
    expect(h.svc.trigger().kind).toBe('warning');
    expect(h.shown.filter((s) => !s.startsWith('hide'))).toEqual(['popup', 'popup', 'overlay']);
  });
});
