import { EventEmitter } from 'node:events';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@dailybee/api/router';
import type { AccountMode, AccountResult, AccountRole, AccountStatus, SecurityAnswer, SoloSetup } from '../../shared/types';
import type { Repo } from '../repo';
import type { SettingsService } from './settings';

interface AccountRec {
  setupDone: boolean;
  mode: AccountMode | null;
  role: AccountRole | null;
  /** Solo only: "scrypt$salt$hash"; never sent to the renderer */
  passwordHash: string | null;
  workspace: { id: string; name: string; inviteCode: string | null } | null;
  /** Solo only: security questions with scrypt-hashed, normalised answers; they reset a forgotten password */
  recovery: Array<{ question: string; answerHash: string }> | null;
  /** The first-run tour was finished or skipped */
  tourDone?: boolean;
}

const EMPTY: AccountRec = { setupDone: false, mode: null, role: null, passwordHash: null, workspace: null, recovery: null };

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
};
export const verifyPassword = (password: string, stored: string | null): boolean => {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && timingSafeEqual(test, ref);
};
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '··';
/** Answers are compared without case, surrounding spaces or double spaces. */
const normaliseAnswer = (a: string): string => a.trim().toLowerCase().replace(/\s+/g, ' ');
/** Two different questions, both answered. Throws with the reason otherwise. */
const cleanRecovery = (r: SecurityAnswer[] | undefined): SecurityAnswer[] => {
  const list = (r ?? []).map((x) => ({ question: (x.question ?? '').trim(), answer: normaliseAnswer(x.answer ?? '') })).filter((x) => x.question).slice(0, 2);
  if (list.length < 2) throw new Error('Pick two security questions');
  if (list[0]!.question === list[1]!.question) throw new Error('Pick two different security questions');
  if (list.some((x) => !x.answer)) throw new Error('Answer both security questions');
  return list;
};
const RECOVERY_TRIES = 5;
const RECOVERY_BLOCK_MS = 30_000;

/**
 * Who is using this install. Solo: a profile stored on the device (name, optional email, password
 * hash) that must be unlocked at launch; nothing ever leaves the machine. Team: an account in a
 * workspace on the sync API (email + password), whose token, role and workspace the settings keep.
 * Demo mode pretends to be a signed-in admin so the kit's screens show.
 */
export class AccountService extends EventEmitter {
  private rec: AccountRec;
  private locked = false;
  private readonly demo: boolean;
  private recoveryMisses = 0;
  private recoveryBlockedUntil = 0;

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, private readonly log: (m: string) => void, opts: { demo: boolean }) {
    super();
    this.demo = opts.demo;
    this.rec = opts.demo
      ? { setupDone: true, mode: 'team', role: 'admin', passwordHash: null, workspace: { id: 'ws_demo', name: 'DailyBee', inviteCode: 'DEMO-2026' }, recovery: null }
      : { ...EMPTY, ...repo.getKv<Partial<AccountRec>>('account', {}) };
    // Env-configured workspaces (tests, DAILYBEE_API_URL) skip the wizard as a team admin.
    if (!this.rec.setupDone && process.env.DAILYBEE_API_URL && process.env.DAILYBEE_API_TOKEN) this.rec = { ...this.rec, setupDone: true, mode: 'team', role: 'admin' };
    this.locked = this.rec.setupDone && this.rec.mode === 'solo' && !!this.rec.passwordHash;
  }

  status(): AccountStatus {
    const s = this.settings.get();
    return {
      setupDone: this.rec.setupDone, mode: this.rec.mode, role: this.rec.role,
      name: s.profile.name, email: s.profile.email, initials: s.profile.initials,
      locked: this.locked, hasPassword: !!this.rec.passwordHash,
      needsLogin: this.rec.setupDone && this.rec.mode === 'team' && !this.demo && !s.workspace.token,
      securityQuestions: this.rec.recovery?.map((r) => r.question) ?? [],
      tourDone: this.demo || !!this.rec.tourDone,
      workspace: this.rec.mode === 'team' ? { name: this.rec.workspace?.name ?? s.workspace.teamName, inviteCode: this.rec.workspace?.inviteCode ?? null, apiUrl: s.workspace.apiUrl } : null,
    };
  }

  isLocked(): boolean { return this.locked; }

  private persist(): void {
    this.repo.setKv('account', this.rec);
    this.emit('change', this.status());
  }

  // ---- solo ----------------------------------------------------------------------------------
  setupSolo(p: SoloSetup): AccountStatus {
    const name = p.name.trim();
    if (!name) throw new Error('Name is required');
    if (p.password.length < 6) throw new Error('Password must be at least 6 characters');
    const recovery = cleanRecovery(p.recovery).map((x) => ({ question: x.question, answerHash: hashPassword(x.answer) }));
    this.settings.update({ profile: { name, email: p.email.trim(), initials: initialsOf(name) }, workspace: { token: '' } });
    this.rec = { setupDone: true, mode: 'solo', role: null, passwordHash: hashPassword(p.password), workspace: null, recovery };
    this.locked = false;
    this.persist();
    this.log('[account] solo profile created');
    return this.status();
  }

  unlock(password: string): AccountResult {
    if (!this.locked) return { ok: true, message: 'Already unlocked' };
    if (!verifyPassword(password, this.rec.passwordHash)) return { ok: false, message: 'Wrong password' };
    this.locked = false;
    this.emit('change', this.status());
    return { ok: true, message: 'Unlocked' };
  }

  lock(): AccountStatus {
    if (this.rec.mode === 'solo' && this.rec.passwordHash) { this.locked = true; this.emit('change', this.status()); }
    return this.status();
  }

  /** Do the security answers match? Five misses block further tries for 30 seconds. */
  checkRecovery(answers: string[], now = Date.now()): AccountResult {
    if (this.rec.mode !== 'solo') return { ok: false, message: 'Team accounts change their password on the workspace server' };
    if (!this.rec.recovery?.length) return { ok: false, message: 'This profile has no security questions, so its password cannot be reset' };
    if (now < this.recoveryBlockedUntil) return { ok: false, message: `Too many wrong answers. Try again in ${Math.ceil((this.recoveryBlockedUntil - now) / 1000)} s` };
    const ok = this.rec.recovery.every((r, i) => verifyPassword(normaliseAnswer(answers[i] ?? ''), r.answerHash));
    if (!ok) {
      this.recoveryMisses += 1;
      if (this.recoveryMisses >= RECOVERY_TRIES) { this.recoveryMisses = 0; this.recoveryBlockedUntil = now + RECOVERY_BLOCK_MS; }
      this.log('[account] wrong security answers');
      return { ok: false, message: 'Those answers do not match' };
    }
    this.recoveryMisses = 0;
    return { ok: true, message: 'Answers match' };
  }

  /** Forgotten password: the security answers must match, then the new password replaces the old one. */
  resetPassword(next: string, answers: string[]): AccountResult {
    const check = this.checkRecovery(answers);
    if (!check.ok) return check;
    if (next.length < 6) return { ok: false, message: 'New password must be at least 6 characters' };
    this.rec = { ...this.rec, passwordHash: hashPassword(next) };
    this.locked = false;
    this.persist();
    this.log('[account] password reset after answering the security questions');
    return { ok: true, message: 'Password set' };
  }

  /** Set or change the security questions; the current password proves it is the owner. */
  setRecovery(current: string, recovery: SecurityAnswer[]): AccountResult {
    if (this.rec.mode !== 'solo') return { ok: false, message: 'Security questions belong to solo profiles' };
    if (!verifyPassword(current, this.rec.passwordHash)) return { ok: false, message: 'Current password is wrong' };
    let list: SecurityAnswer[];
    try { list = cleanRecovery(recovery); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
    this.rec = { ...this.rec, recovery: list.map((x) => ({ question: x.question, answerHash: hashPassword(x.answer) })) };
    this.persist();
    this.log('[account] security questions updated');
    return { ok: true, message: 'Security questions saved' };
  }

  changePassword(current: string, next: string): AccountResult {
    if (this.rec.mode !== 'solo') return { ok: false, message: 'Team accounts change their password on the workspace server' };
    if (!verifyPassword(current, this.rec.passwordHash)) return { ok: false, message: 'Current password is wrong' };
    if (next.length < 6) return { ok: false, message: 'New password must be at least 6 characters' };
    this.rec = { ...this.rec, passwordHash: hashPassword(next) };
    this.persist();
    return { ok: true, message: 'Password changed' };
  }

  // ---- team ----------------------------------------------------------------------------------
  private client(apiUrl: string) {
    const url = apiUrl.trim().replace(/\/$/, '');
    if (!/^https?:\/\//.test(url)) throw new Error('Enter the server address including http:// or https://');
    return { url, client: createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: url + '/trpc' })] }) };
  }

  private async team(apiUrl: string, run: (client: ReturnType<typeof createTRPCClient<AppRouter>>) => Promise<{ token: string | null; user: { name: string; email: string; initials: string; team: string; role: 'member' | 'lead' | 'admin' }; workspace: { id: string; name: string; inviteCode: string | null } }>): Promise<AccountResult> {
    let url: string;
    let client: ReturnType<typeof createTRPCClient<AppRouter>>;
    try { ({ url, client } = this.client(apiUrl)); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
    try {
      const r = await run(client);
      if (!r.token) return { ok: false, message: 'The server did not return a sign-in token' };
      const role: AccountRole = r.user.role === 'member' ? 'member' : 'admin';
      this.settings.update({ profile: { name: r.user.name, email: r.user.email, initials: r.user.initials }, workspace: { apiUrl: url, token: r.token, teamName: r.user.team || r.workspace.name } });
      this.rec = { setupDone: true, mode: 'team', role, passwordHash: null, recovery: null, workspace: { id: r.workspace.id, name: r.workspace.name, inviteCode: r.workspace.inviteCode } };
      this.locked = false;
      this.persist();
      this.log(`[account] signed in to ${r.workspace.name} as ${role}`);
      return { ok: true, message: role === 'admin' ? `Signed in to ${r.workspace.name} as an admin` : `Signed in to ${r.workspace.name}` };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const message = /fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(raw) ? `Could not reach ${url}. Is the DailyBee server running?` : raw;
      this.log('[account] ' + message);
      return { ok: false, message };
    }
  }

  /** The guided first run was finished or skipped; it is not shown again for this profile. */
  finishTour(): AccountStatus {
    if (!this.rec.tourDone) { this.rec = { ...this.rec, tourDone: true }; this.persist(); }
    return this.status();
  }

  /** Is there a DailyBee API at this address? Used by the wizard's server guide before anyone signs in. */
  async checkServer(apiUrl: string): Promise<AccountResult> {
    let url: string;
    try { ({ url } = this.client(apiUrl)); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
    try {
      const res = await fetch(url + '/trpc/health', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ok: false, message: `${url} answered with HTTP ${res.status}, which is not a DailyBee API` };
      const body = (await res.json()) as { result?: { data?: { ok?: boolean; service?: string } } };
      const data = body.result?.data;
      if (!data?.ok || data.service !== 'dailybee-api') return { ok: false, message: `${url} answered, but not as a DailyBee API` };
      return { ok: true, message: `A DailyBee API is running at ${url}` };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      return { ok: false, message: /abort|timeout/i.test(raw) ? `No answer from ${url} within 5 seconds` : `Could not reach ${url}. Is the server running, and is the address right?` };
    }
  }

  teamCreate(p: { apiUrl: string; workspaceName: string; name: string; email: string; password: string }): Promise<AccountResult> {
    return this.team(p.apiUrl, (c) => c.auth.createWorkspace.mutate({ workspaceName: p.workspaceName, name: p.name, email: p.email, password: p.password }));
  }

  teamJoin(p: { apiUrl: string; inviteCode: string; name: string; email: string; password: string }): Promise<AccountResult> {
    return this.team(p.apiUrl, (c) => c.auth.join.mutate({ inviteCode: p.inviteCode, name: p.name, email: p.email, password: p.password }));
  }

  teamLogin(p: { apiUrl: string; email: string; password: string }): Promise<AccountResult> {
    return this.team(p.apiUrl, (c) => c.auth.login.mutate({ email: p.email, password: p.password }));
  }

  /**
   * Sign out, just before the profile closes (main/index.ts closeProfile). A team account drops its
   * workspace token and asks for the password next time; a solo profile keeps its own. All data stays.
   */
  signOut(): AccountStatus {
    if (this.rec.mode === 'team') {
      this.settings.update({ workspace: { token: '' } });
      this.log('[account] signed out of ' + (this.rec.workspace?.name ?? 'the workspace'));
    }
    this.locked = this.rec.mode === 'solo' && !!this.rec.passwordHash;
    this.emit('change', this.status());
    return this.status();
  }
}
