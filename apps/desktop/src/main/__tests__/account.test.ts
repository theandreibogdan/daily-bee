import { describe, expect, it } from 'vitest';
import type { DeepPartial, SecurityAnswer, Settings } from '../../shared/types';
import type { Repo } from '../repo';
import { AccountService, hashPassword, verifyPassword } from '../services/account';
import { DEFAULT_SETTINGS, deepMerge, type SettingsService } from '../services/settings';

function fakes() {
  const kv = new Map<string, string>();
  const repo = { getKv: <T>(k: string, f: T): T => (kv.has(k) ? (JSON.parse(kv.get(k)!) as T) : f), setKv: (k: string, v: unknown) => { kv.set(k, JSON.stringify(v)); } } as unknown as Repo;
  let state: Settings = deepMerge(DEFAULT_SETTINGS, {});
  const settings = { get: () => state, update: (p: DeepPartial<Settings>) => { state = deepMerge(state, p); return state; } } as unknown as SettingsService;
  return { repo, settings, kv, get: () => state };
}
const quiet = () => {};
const Q1 = 'What was the name of your first pet?';
const Q2 = 'In what city were you born?';
const RECOVERY: SecurityAnswer[] = [{ question: Q1, answer: 'Rex' }, { question: Q2, answer: '  New   York ' }];

describe('local password', () => {
  it('hashes with scrypt and verifies', () => {
    const h = hashPassword('hunter22');
    expect(h).not.toContain('hunter22');
    expect(verifyPassword('hunter22', h)).toBe(true);
    expect(verifyPassword('hunter23', h)).toBe(false);
  });
});

describe('AccountService (solo)', () => {
  it('starts in the wizard, creates a profile, locks at the next launch and unlocks with the password', () => {
    const f = fakes();
    const first = new AccountService(f.repo, f.settings, quiet, { demo: false });
    expect(first.status()).toMatchObject({ setupDone: false, mode: null, locked: false, securityQuestions: [] });
    const s = first.setupSolo({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'secret1', recovery: RECOVERY });
    expect(s).toMatchObject({ setupDone: true, mode: 'solo', role: null, locked: false, hasPassword: true, name: 'Ada Lovelace', workspace: null, securityQuestions: [Q1, Q2] });
    expect(f.get().profile.initials).toBe('AL');
    // Neither the password nor the answers are stored in clear.
    expect(f.kv.get('account')).not.toContain('secret1');
    expect(f.kv.get('account')).not.toMatch(/rex|york/i);
    // Relaunch: the stored profile opens locked.
    const again = new AccountService(f.repo, f.settings, quiet, { demo: false });
    expect(again.status().locked).toBe(true);
    expect(again.unlock('wrong')).toMatchObject({ ok: false });
    expect(again.status().locked).toBe(true);
    expect(again.unlock('secret1').ok).toBe(true);
    expect(again.status().locked).toBe(false);
    // Lock, change the password, sign out (the solo profile stays and re-locks).
    expect(again.lock().locked).toBe(true);
    again.unlock('secret1');
    expect(again.changePassword('nope', 'newpass1').ok).toBe(false);
    expect(again.changePassword('secret1', 'short').ok).toBe(false);
    expect(again.changePassword('secret1', 'newpass1').ok).toBe(true);
    expect(new AccountService(f.repo, f.settings, quiet, { demo: false }).unlock('newpass1').ok).toBe(true);
    expect(again.signOut()).toMatchObject({ setupDone: true, mode: 'solo', locked: true });
  });

  it('resets a forgotten password only with the right security answers, ignoring case and spacing', () => {
    const f = fakes();
    const svc = new AccountService(f.repo, f.settings, quiet, { demo: false });
    svc.setupSolo({ name: 'Ada Lovelace', email: '', password: 'secret1', recovery: RECOVERY });
    const locked = new AccountService(f.repo, f.settings, quiet, { demo: false });
    expect(locked.status().locked).toBe(true);
    expect(locked.checkRecovery(['Rex', 'Paris'])).toMatchObject({ ok: false, message: /do not match/ });
    expect(locked.resetPassword('replaced1', ['Rex', 'Paris']).ok).toBe(false);
    expect(locked.status().locked).toBe(true);
    expect(locked.checkRecovery(['REX', 'new york']).ok).toBe(true);
    expect(locked.resetPassword('short', ['rex', 'New York']).ok).toBe(false);
    expect(locked.resetPassword('replaced1', ['rex ', 'new  york'])).toMatchObject({ ok: true });
    expect(locked.status().locked).toBe(false);
    expect(new AccountService(f.repo, f.settings, quiet, { demo: false }).unlock('replaced1').ok).toBe(true);
    // The questions can be changed with the current password.
    expect(locked.setRecovery('wrong', RECOVERY).ok).toBe(false);
    expect(locked.setRecovery('replaced1', [{ question: Q1, answer: 'a' }, { question: Q1, answer: 'b' }])).toMatchObject({ ok: false, message: /different/ });
    expect(locked.setRecovery('replaced1', [{ question: Q1, answer: 'Bolt' }, { question: 'What was your childhood nickname?', answer: 'Sparky' }]).ok).toBe(true);
    expect(locked.status().securityQuestions).toEqual([Q1, 'What was your childhood nickname?']);
    expect(new AccountService(f.repo, f.settings, quiet, { demo: false }).checkRecovery(['bolt', 'sparky']).ok).toBe(true);
  });

  it('blocks the security questions for 30 seconds after five misses', () => {
    const f = fakes();
    new AccountService(f.repo, f.settings, quiet, { demo: false }).setupSolo({ name: 'Ada', email: '', password: 'secret1', recovery: RECOVERY });
    const svc = new AccountService(f.repo, f.settings, quiet, { demo: false });
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(svc.checkRecovery(['x', 'y'], t0).message).toMatch(/do not match/);
    expect(svc.checkRecovery(['rex', 'new york'], t0 + 1000).message).toMatch(/Try again in \d+ s/);
    expect(svc.checkRecovery(['rex', 'new york'], t0 + 31_000).ok).toBe(true);
  });

  it('cannot reset a profile made without security questions, and validates the questions at creation', () => {
    const f = fakes();
    f.repo.setKv('account', { setupDone: true, mode: 'solo', role: null, passwordHash: hashPassword('secret1'), workspace: null });
    const old = new AccountService(f.repo, f.settings, quiet, { demo: false });
    expect(old.status()).toMatchObject({ locked: true, securityQuestions: [] });
    expect(old.checkRecovery(['a', 'b'])).toMatchObject({ ok: false, message: /no security questions/ });
    expect(old.resetPassword('replaced1', []).ok).toBe(false);
    expect(old.status().locked).toBe(true);
    const svc = new AccountService(fakes().repo, f.settings, quiet, { demo: false });
    expect(() => svc.setupSolo({ name: '  ', email: '', password: 'secret1', recovery: RECOVERY })).toThrow(/Name/);
    expect(() => svc.setupSolo({ name: 'Ada', email: '', password: 'abc', recovery: RECOVERY })).toThrow(/6 characters/);
    expect(() => svc.setupSolo({ name: 'Ada', email: '', password: 'secret1', recovery: [] })).toThrow(/two security questions/);
    expect(() => svc.setupSolo({ name: 'Ada', email: '', password: 'secret1', recovery: [{ question: Q1, answer: 'a' }, { question: Q1, answer: 'b' }] })).toThrow(/different/);
    expect(() => svc.setupSolo({ name: 'Ada', email: '', password: 'secret1', recovery: [{ question: Q1, answer: ' ' }, { question: Q2, answer: 'b' }] })).toThrow(/Answer both/);
    expect(svc.status().setupDone).toBe(false);
  });

  it('demo mode pretends to be a signed-in admin', () => {
    const f = fakes();
    const demo = new AccountService(f.repo, f.settings, quiet, { demo: true });
    expect(demo.status()).toMatchObject({ setupDone: true, mode: 'team', role: 'admin', locked: false });
    expect(demo.status().workspace?.inviteCode).toBe('DEMO-2026');
    expect(demo.checkRecovery(['a', 'b']).ok).toBe(false);
  });

  it('refuses team sign-in against an address without a scheme and reports an unreachable server', async () => {
    const f = fakes();
    const svc = new AccountService(f.repo, f.settings, quiet, { demo: false });
    expect((await svc.teamLogin({ apiUrl: 'localhost:1', email: 'a@b.c', password: 'x' })).message).toMatch(/http:\/\//);
    const r = await svc.teamLogin({ apiUrl: 'http://127.0.0.1:1', email: 'a@b.c', password: 'x' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Could not reach/);
    expect(svc.status().setupDone).toBe(false);
  });
});
