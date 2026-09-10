import { closeSync, copyFileSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { BackupInfo, BackupResult, BackupStatus, Settings } from '../../shared/types';
import { dayKey } from '../../shared/time';
import { Db } from '../db';
import { Repo } from '../repo';

/** A backup is the profile's SQLite file under its own extension. */
export const BACKUP_EXT = 'dailybee';
const SQLITE_HEADER = 'SQLite format 3\0';
/** Remind solo profiles after a week of use without a backup, then every 30 days. */
const FIRST_REMINDER_DAYS = 7;
const REMIND_EVERY_DAYS = 30;
const DAY = 86_400_000;

const KV_LAST = 'backup-last';
const KV_FILE = 'backup-file';
const KV_FIRST_SEEN = 'backup-first-seen';
const KV_REMINDED = 'backup-reminded';

/**
 * Settings › Backup. Export copies the profile's database out after flushing pending writes;
 * restore (index.ts) swaps a copy back in. The monthly reminder lands in the bell when a solo
 * profile has gone too long without one.
 */
export class BackupService {
  constructor(private readonly db: Db, private readonly repo: Repo, private readonly file: string, private readonly log: (m: string) => void, private readonly now: () => number = Date.now) {
    if (!repo.getKv<number | null>(KV_FIRST_SEEN, null)) repo.setKv(KV_FIRST_SEEN, this.now(), 'low');
  }

  status(): BackupStatus {
    let sizeBytes = 0;
    try { sizeBytes = statSync(this.file).size; } catch { /* not flushed yet */ }
    const first = this.repo.getKv<number>(KV_FIRST_SEEN, this.now());
    return { lastBackupAt: this.repo.getKv<number | null>(KV_LAST, null), lastFile: this.repo.getKv<string | null>(KV_FILE, null), sizeBytes, ageDays: Math.floor((this.now() - first) / DAY) };
  }

  /** "DailyBee-fay-ng-2026-09-10.dailybee" */
  suggestedName(profileName: string): string {
    const slug = profileName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';
    return `DailyBee-${slug}-${dayKey(this.now())}.${BACKUP_EXT}`;
  }

  /** Copy the database to `target`. Everything pending is written first, so the copy is complete. */
  exportTo(target: string): BackupResult {
    try {
      this.db.flush();
      copyFileSync(this.file, target);
      if (!isSqliteFile(target)) throw new Error('the copy does not read back as a database');
      this.repo.setKv(KV_LAST, this.now());
      this.repo.setKv(KV_FILE, target);
      this.log('[backup] exported to ' + target);
      return { ok: true, message: 'Backup saved as ' + basename(target), file: target };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log('[backup] export failed: ' + message);
      return { ok: false, message: 'Backup failed — ' + message };
    }
  }

  /** The reminder text when one is due, else null. */
  reminderDue(): string | null {
    const now = this.now();
    const { lastBackupAt, ageDays } = this.status();
    const reminded = this.repo.getKv<number | null>(KV_REMINDED, null);
    if (reminded && now - reminded < REMIND_EVERY_DAYS * DAY) return null;
    if (lastBackupAt === null) {
      if (ageDays < FIRST_REMINDER_DAYS) return null;
      return 'This profile has never been backed up. Its data lives only on this device; export a copy from Settings › Backup.';
    }
    const days = Math.floor((now - lastBackupAt) / DAY);
    if (days < REMIND_EVERY_DAYS) return null;
    return `The last backup was ${days} days ago. Export a fresh copy from Settings › Backup.`;
  }

  markReminded(): void {
    this.repo.setKv(KV_REMINDED, this.now(), 'low');
  }
}

/** The 16-byte SQLite header, so a wrong file is refused before anything is touched. */
export function isSqliteFile(file: string): boolean {
  try {
    const fd = openSync(file, 'r');
    try {
      const buf = Buffer.alloc(16);
      const n = readSync(fd, buf, 0, 16, 0);
      return n === 16 && buf.toString('latin1') === SQLITE_HEADER;
    } finally { closeSync(fd); }
  } catch { return false; }
}

/** Open a backup read-only and say whose it is and what it holds; throws when it is not a DailyBee database. */
export async function inspectBackup(file: string, log: (m: string) => void = () => {}): Promise<BackupInfo> {
  if (!existsSync(file)) throw new Error('That file does not exist');
  if (!isSqliteFile(file)) throw new Error('Not a DailyBee backup (the file is not a database)');
  const db = new Db(file, log, { readOnly: true });
  await db.open();
  try {
    const repo = new Repo(db);
    const account = repo.getKv<{ setupDone?: boolean; mode?: BackupInfo['mode'] } | null>('account', null);
    const settings = repo.getKv<Partial<Settings>>('settings', {});
    const days = db.all<{ day: string }>('SELECT DISTINCT day FROM entries ORDER BY day DESC').map((r) => String(r.day));
    if (!account && repo.entryCount() === 0 && db.count('samples') === 0) throw new Error('Not a DailyBee backup (no profile inside)');
    return {
      file, name: settings.profile?.name ?? '', email: settings.profile?.email ?? '', mode: account?.mode ?? null,
      entries: repo.entryCount(), days: days.length, lastDay: days[0] ?? null, sizeBytes: statSync(file).size,
    };
  } finally { db.close(); }
}
