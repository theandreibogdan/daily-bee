import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { PresenceService, type Away } from '../services/presence';
import { DEFAULT_SETTINGS, deepMerge, type SettingsService } from '../services/settings';

const SEC = 1000;

function harness(tracking: Partial<typeof DEFAULT_SETTINGS.tracking> = {}) {
  const power = new EventEmitter();
  let idle = 0;
  const settings = { get: () => deepMerge(DEFAULT_SETTINGS, { tracking }) } as unknown as SettingsService;
  const svc = new PresenceService(settings, { getIdleSeconds: () => idle, on: (ev, cb) => power.on(ev, cb) }, 1_000_000);
  const events: Array<['away', Away] | ['back', number]> = [];
  svc.on('away', (a: Away) => events.push(['away', a]));
  svc.on('back', (at: number) => events.push(['back', at]));
  svc.start();
  svc.stop();
  return { svc, power, events, setIdle: (s: number) => { idle = s; } };
}

describe('PresenceService', () => {
  it('reports idle once the threshold passes, backdated to the last input, and back on input', () => {
    const h = harness({ idleMinutes: 10 });
    const now = 5_000_000_000;
    h.setIdle(599);
    h.svc.poll(now);
    expect(h.events).toEqual([]);
    h.setIdle(601);
    h.svc.poll(now + 2 * SEC);
    expect(h.events).toEqual([['away', { reason: 'idle', since: now + 2 * SEC - 601 * SEC }]]);
    h.svc.poll(now + 7 * SEC); // still idle: no repeat
    expect(h.events).toHaveLength(1);
    h.setIdle(1);
    h.svc.poll(now + 12 * SEC);
    expect(h.events[1]).toEqual(['back', now + 12 * SEC - 1 * SEC]);
  });

  it('treats screen lock and sleep as away, unlock and wake as back, and ignores idle when detection is off', () => {
    const h = harness({ idleDetection: false, idleMinutes: 1 });
    h.setIdle(3600);
    h.svc.poll();
    expect(h.events).toEqual([]);
    h.power.emit('lock-screen');
    expect(h.events[0]?.[0]).toBe('away');
    expect((h.events[0]?.[1] as Away).reason).toBe('lock');
    h.power.emit('suspend'); // already away: no second event
    expect(h.events).toHaveLength(1);
    h.power.emit('unlock-screen');
    expect(h.events[1]?.[0]).toBe('back');
    h.power.emit('suspend');
    expect((h.events[2]?.[1] as Away).reason).toBe('sleep');
    h.power.emit('resume');
    expect(h.events[3]?.[0]).toBe('back');
  });
});
