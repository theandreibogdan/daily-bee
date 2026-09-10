import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayKey } from '../../shared/time';
import { Db } from '../db';
import { Repo } from '../repo';
import { BackupService, inspectBackup, isSqliteFile } from '../services/backup';

const DAY_MS = 86_400_000;
const T0 = Date.parse('2026-09-08T12:00:00');
let dir: string;
let db: Db;
let repo: Repo;
let now = T0;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dailybee-backup-'));
  db = new Db(join(dir, 'profile.sqlite'));
  await db.open();
  repo = new Repo(db);
  repo.setKv('account', { setupDone: true, mode: 'solo', role: null, passwordHash: 'x', workspace: null });
  repo.setKv('settings', { profile: { name: 'Fay Ng', email: 'fay@example.com' } });
  repo.upsertEntry({ id: 'e1', day: dayKey(T0), task: 'Timer sync', ref: null, project: 'api', startTs: T0, start: '', seconds: 1200, done: false });
  repo.upsertEntry({ id: 'e2', day: dayKey(T0 - DAY_MS), task: 'Yesterday', ref: null, project: 'api', startTs: T0 - DAY_MS, start: '', seconds: 600, done: true });
});
afterAll(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe('BackupService', () => {
  it('exports a complete copy, remembers when, and the copy inspects as the same profile', async () => {
    const svc = new BackupService(db, repo, join(dir, 'profile.sqlite'), () => {}, () => now);
    expect(svc.status()).toMatchObject({ lastBackupAt: null, lastFile: null, ageDays: 0 });
    expect(svc.suggestedName('Fay Ng')).toBe('DailyBee-fay-ng-2026-09-08.dailybee');
    const target = join(dir, svc.suggestedName('Fay Ng'));
    const r = svc.exportTo(target);
    expect(r).toMatchObject({ ok: true, file: target });
    expect(existsSync(target)).toBe(true);
    expect(isSqliteFile(target)).toBe(true);
    expect(svc.status()).toMatchObject({ lastBackupAt: T0, lastFile: target });
    expect(svc.status().sizeBytes).toBeGreaterThan(0);
    const info = await inspectBackup(target);
    expect(info).toMatchObject({ file: target, name: 'Fay Ng', email: 'fay@example.com', mode: 'solo', entries: 2, days: 2, lastDay: dayKey(T0) });
  });

  it('refuses files that are not a DailyBee database', async () => {
    const text = join(dir, 'notes.dailybee');
    writeFileSync(text, 'hello');
    expect(isSqliteFile(text)).toBe(false);
    await expect(inspectBackup(text)).rejects.toThrow('not a database');
    await expect(inspectBackup(join(dir, 'missing.dailybee'))).rejects.toThrow('does not exist');
    const svc = new BackupService(db, repo, join(dir, 'profile.sqlite'), () => {}, () => now);
    expect(svc.exportTo(join(dir, 'no-such-dir', 'x.dailybee')).ok).toBe(false);
  });

  it('reminds after a week without any backup, then every 30 days', async () => {
    const fresh = new Db(join(dir, 'fresh.sqlite'));
    await fresh.open();
    const freshRepo = new Repo(fresh);
    // A brand-new profile: nothing yet.
    let t = T0;
    const svc = new BackupService(fresh, freshRepo, join(dir, 'fresh.sqlite'), () => {}, () => t);
    expect(svc.reminderDue()).toBeNull();
    t = T0 + 8 * DAY_MS;
    expect(svc.reminderDue()).toContain('never been backed up');
    svc.markReminded();
    expect(svc.reminderDue()).toBeNull();
    t = T0 + 40 * DAY_MS;
    expect(svc.reminderDue()).toContain('never been backed up');
    // After a backup: quiet for 30 days, then a dated reminder.
    freshRepo.setKv('backup-last', t);
    expect(svc.reminderDue()).toBeNull();
    t += 31 * DAY_MS;
    expect(svc.reminderDue()).toBe('The last backup was 31 days ago. Export a fresh copy from Settings › Backup.');
    fresh.close();
  });
});
