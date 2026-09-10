import { describe, expect, it } from 'vitest';
import type { Repo } from '../repo';
import { NotificationService } from '../services/notifications';

function fakes() {
  const kv = new Map<string, string>();
  const repo = { getKv: <T>(k: string, f: T): T => (kv.has(k) ? (JSON.parse(kv.get(k)!) as T) : f), setKv: (k: string, v: unknown) => { kv.set(k, JSON.stringify(v)); } } as unknown as Repo;
  const desktop: string[] = [];
  const host = { desktop: (title: string) => { desktop.push(title); }, log: () => {} };
  return { repo, host, desktop };
}

describe('NotificationService', () => {
  it('logs events newest first, counts unread, marks read, clears, and raises a desktop notification for every line', () => {
    const f = fakes();
    let t = 1_000_000;
    const svc = new NotificationService(f.repo, f.host, () => t);
    const changes: number[] = [];
    svc.on('change', (list: unknown[]) => changes.push(list.length));
    svc.push({ kind: 'session', title: 'Started “Timer sync”', screen: 'today' });
    t += 1000;
    svc.push({ kind: 'report', tone: 'success', title: 'Report sent to #eng', screen: 'reports' });
    t += 1000;
    svc.push({ kind: 'checkin', tone: 'warning', title: 'Drift on youtube.com', text: 'Still on it?' });
    expect(svc.list().map((n) => n.title)).toEqual(['Drift on youtube.com', 'Report sent to #eng', 'Started “Timer sync”']);
    expect(svc.unread()).toBe(3);
    expect(f.desktop).toEqual(['Started “Timer sync”', 'Report sent to #eng', 'Drift on youtube.com']);
    const first = svc.list()[2]!;
    svc.markRead([first.id]);
    expect(svc.unread()).toBe(2);
    expect(svc.list().find((n) => n.id === first.id)?.read).toBe(true);
    svc.markRead();
    expect(svc.unread()).toBe(0);
    // Persisted: a new instance sees the same log.
    expect(new NotificationService(f.repo, f.host, () => t).list().length).toBe(3);
    svc.clear();
    expect(svc.list()).toEqual([]);
    expect(changes.length).toBeGreaterThanOrEqual(6);
  });

  it('replaces keyed notifications, caps the log, and drops entries older than 30 days on load', () => {
    const f = fakes();
    let t = 10_000_000_000;
    const svc = new NotificationService(f.repo, f.host, () => t);
    svc.push({ kind: 'sync', tone: 'danger', title: 'Sync failed', key: 'sync' });
    t += 5000;
    svc.push({ kind: 'sync', tone: 'danger', title: 'Sync failed', text: 'again', key: 'sync' });
    expect(svc.list().filter((n) => n.key === 'sync').length).toBe(1);
    expect(svc.list()[0]?.text).toBe('again');
    for (let i = 0; i < 250; i++) { t += 1; svc.push({ kind: 'session', title: 'n' + i }); }
    expect(svc.list().length).toBe(200);
    // Load again 31 days later: everything is stale and gets pruned.
    const later = new NotificationService(f.repo, f.host, () => t + 31 * 86_400_000);
    expect(later.list()).toEqual([]);
  });
});
