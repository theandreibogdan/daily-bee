import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AccountStatus } from '../../shared/types';
import { ProfileService } from '../services/profiles';

const dirs: string[] = [];
const fresh = () => { const d = mkdtempSync(join(tmpdir(), 'dailybee-profiles-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const solo = (name: string): AccountStatus => ({ setupDone: true, mode: 'solo', role: null, name, email: '', initials: name.split(' ').map((w) => w[0]!).join(''), locked: false, hasPassword: true, needsLogin: false, securityQuestions: [], tourDone: false, workspace: null });
const unfinished: AccountStatus = { setupDone: false, mode: null, role: null, name: '', email: '', initials: '··', locked: false, hasPassword: false, needsLogin: false, securityQuestions: [], tourDone: false, workspace: null };

describe('ProfileService', () => {
  it('creates profiles with their own database files, opens the most recent first, and removes them with their data', () => {
    const dir = fresh();
    let t = 1000;
    const svc = new ProfileService(dir, () => {}, () => t);
    expect(svc.list()).toEqual([]);
    expect(svc.active()).toBeNull();
    const a = svc.create();
    expect(a.provisional).toBe(true);
    expect(svc.path(a.id)).toBe(join(dir, 'profiles', a.id + '.sqlite'));
    svc.setActive(a.id);
    svc.updateFromAccount(a.id, solo('Ada Lovelace'));
    expect(svc.get(a.id)).toMatchObject({ name: 'Ada Lovelace', initials: 'AL', mode: 'solo', setupDone: true, provisional: false });
    t = 2000;
    const b = svc.create();
    svc.updateFromAccount(b.id, solo('Bob Byte'));
    svc.touch(b.id);
    expect(svc.list().map((p) => p.name)).toEqual(['Bob Byte', 'Ada Lovelace']);
    // The list survives a restart, and so does the active profile.
    const again = new ProfileService(dir, () => {}, () => t);
    expect(again.active()).toBe(a.id);
    expect(again.list().length).toBe(2);
    // Removing deletes the database file; the active profile must be closed first.
    writeFileSync(again.path(b.id), 'x');
    expect(() => again.remove(a.id)).toThrow(/Close the profile/);
    again.remove(b.id);
    expect(existsSync(join(dir, 'profiles', b.id + '.sqlite'))).toBe(false);
    expect(again.list().map((p) => p.id)).toEqual([a.id]);
    again.setActive(null);
    expect(new ProfileService(dir).active()).toBeNull();
  });

  it('adopts an install from before profiles existed as the active default profile without moving its file', () => {
    const dir = fresh();
    writeFileSync(join(dir, 'dailybee.sqlite'), 'legacy');
    const svc = new ProfileService(dir);
    expect(svc.active()).toBe('default');
    expect(svc.path('default')).toBe(join(dir, 'dailybee.sqlite'));
    expect(svc.get('default')?.provisional).toBe(false);
    svc.setActive(null);
    // Not provisional, so never pruned even when signed out and not set up.
    svc.prune();
    expect(svc.list().length).toBe(1);
  });

  it('prunes abandoned provisional profiles but keeps the active one and finished ones', () => {
    const dir = fresh();
    const svc = new ProfileService(dir);
    const abandoned = svc.create();
    const finished = svc.create();
    svc.updateFromAccount(finished.id, solo('Cara Ng'));
    const current = svc.create();
    svc.setActive(current.id);
    svc.updateFromAccount(current.id, unfinished);
    svc.prune();
    expect(svc.list().map((p) => p.id).sort()).toEqual([current.id, finished.id].sort());
    expect(svc.get(abandoned.id)).toBeNull();
    expect(svc.summary(finished)).toMatchObject({ id: finished.id, name: 'Cara Ng', mode: 'solo', setupDone: true });
  });
});
