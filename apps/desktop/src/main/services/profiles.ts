import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountMode, AccountRole, AccountStatus, ProfileSummary } from '../../shared/types';

export interface ProfileRec {
  id: string;
  /** Database file, relative to userData */
  file: string;
  name: string;
  initials: string;
  email: string;
  mode: AccountMode | null;
  role: AccountRole | null;
  workspace: string | null;
  setupDone: boolean;
  /** Made by "Create a new profile" and not set up yet: deleted when abandoned */
  provisional: boolean;
  createdAt: number;
  lastUsedAt: number;
}

interface Index { version: 1; active: string | null; profiles: ProfileRec[] }

/** Database of an install from before profiles existed; adopted in place as the "default" profile. */
const LEGACY_FILE = 'dailybee.sqlite';

/**
 * The local profiles on this device (profiles.json in userData). Each profile has its own SQLite
 * file, so a second person — or a second identity — never sees the first one's data. `active` is
 * the profile to open at launch; null means signed out, which shows the profile list.
 */
export class ProfileService {
  private index: Index;

  constructor(private readonly dir: string, private readonly log: (m: string) => void = () => {}, private readonly now: () => number = Date.now) {
    this.index = this.load();
  }

  private get file(): string { return join(this.dir, 'profiles.json'); }

  private load(): Index {
    if (existsSync(this.file)) {
      try {
        const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Index>;
        if (Array.isArray(raw.profiles)) return { version: 1, active: raw.active ?? null, profiles: raw.profiles as ProfileRec[] };
      } catch (e) {
        this.log('[profiles] could not read profiles.json: ' + String(e));
      }
    }
    if (existsSync(join(this.dir, LEGACY_FILE))) {
      const t = this.now();
      const legacy: ProfileRec = { id: 'default', file: LEGACY_FILE, name: '', initials: '··', email: '', mode: null, role: null, workspace: null, setupDone: false, provisional: false, createdAt: t, lastUsedAt: t };
      const index: Index = { version: 1, active: 'default', profiles: [legacy] };
      this.save(index);
      this.log('[profiles] adopted the existing database as the default profile');
      return index;
    }
    return { version: 1, active: null, profiles: [] };
  }

  private save(index = this.index): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(index, null, 2));
    renameSync(tmp, this.file);
  }

  /** Most recently used first. */
  list(): ProfileRec[] { return [...this.index.profiles].sort((a, b) => b.lastUsedAt - a.lastUsedAt); }
  get(id: string): ProfileRec | null { return this.index.profiles.find((p) => p.id === id) ?? null; }
  active(): string | null { return this.index.active; }

  path(id: string): string {
    const p = this.get(id);
    if (!p) throw new Error('No profile ' + id);
    return join(this.dir, p.file);
  }

  setActive(id: string | null): void {
    if (id && !this.get(id)) throw new Error('No profile ' + id);
    this.index.active = id;
    this.save();
  }

  /** A new, empty profile. It stays provisional until the wizard finishes in it. */
  create(): ProfileRec {
    const id = 'p_' + randomBytes(6).toString('hex');
    const t = this.now();
    mkdirSync(join(this.dir, 'profiles'), { recursive: true });
    const rec: ProfileRec = { id, file: join('profiles', id + '.sqlite'), name: '', initials: '··', email: '', mode: null, role: null, workspace: null, setupDone: false, provisional: true, createdAt: t, lastUsedAt: t };
    this.index.profiles.push(rec);
    this.save();
    return rec;
  }

  touch(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.lastUsedAt = this.now();
    this.save();
  }

  /** Keep the list in step with the open profile's account: name, mode, workspace, whether setup finished. */
  updateFromAccount(id: string, a: AccountStatus): void {
    const p = this.get(id);
    if (!p) return;
    p.name = a.name;
    p.initials = a.initials;
    p.email = a.email;
    p.mode = a.mode;
    p.role = a.role;
    p.workspace = a.workspace?.name ?? null;
    p.setupDone = a.setupDone;
    if (a.setupDone) p.provisional = false;
    this.save();
  }

  /** Delete a profile and its database. Refused for the active one (close it first). */
  remove(id: string): void {
    const p = this.get(id);
    if (!p) return;
    if (this.index.active === id) throw new Error('Close the profile before removing it');
    for (const f of [join(this.dir, p.file), join(this.dir, p.file) + '.tmp']) {
      try { if (existsSync(f)) unlinkSync(f); } catch (e) { this.log('[profiles] could not delete ' + f + ': ' + String(e)); }
    }
    this.index.profiles = this.index.profiles.filter((x) => x.id !== id);
    this.save();
    this.log('[profiles] removed ' + id);
  }

  /** Provisional profiles left behind by an abandoned wizard are deleted; the active one is kept. */
  prune(): void {
    for (const p of this.list()) if (p.provisional && !p.setupDone && p.id !== this.index.active) this.remove(p.id);
  }

  summary(p: ProfileRec): ProfileSummary {
    return { id: p.id, name: p.name, initials: p.initials, email: p.email, mode: p.mode, role: p.role, workspace: p.workspace, setupDone: p.setupDone, lastUsedAt: p.lastUsedAt };
  }
}
