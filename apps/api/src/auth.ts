import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Password hashing for workspace accounts: scrypt with a per-password salt, stored as "scrypt$salt$hash". */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && timingSafeEqual(test, ref);
}

/** Bearer token handed to a desktop after sign-in (stored hashed on the server). */
export const newToken = (): string => randomBytes(24).toString('base64url');

/** Short code an admin shares so teammates can join: "K7Q2-M9XD". */
export function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = () => alphabet[randomBytes(1)[0]! % alphabet.length]!;
  return Array.from({ length: 8 }, pick).join('').replace(/^(.{4})/, '$1-');
}

export const newId = (prefix: string): string => prefix + '_' + randomBytes(6).toString('hex');

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '··';
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';
