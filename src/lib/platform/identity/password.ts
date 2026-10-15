/**
 * PLATFORM-01 — CREDENTIAL SECURITY (node:crypto scrypt)
 * §8 requirements: NEVER store plaintext passwords; modern hashing; policy; verification.
 *
 * No custom cryptography is invented: scrypt + timingSafeEqual come from node:crypto.
 * Encoding is self-describing so parameters can be raised later without invalidating
 * existing records: `scrypt$N$r$p$<saltB64>$<hashB64>`.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

export interface PasswordHasher {
  /** Async so a future Argon2/bcrypt implementation can drop in unchanged. */
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, encoded: string): Promise<boolean>;
}

export interface PasswordPolicyViolation {
  readonly code:
    | 'TOO_SHORT'
    | 'TOO_LONG'
    | 'MISSING_UPPER'
    | 'MISSING_LOWER'
    | 'MISSING_DIGIT'
    | 'MATCHES_IDENTIFIER';
  readonly message: string;
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export function validatePassword(
  plaintext: string,
  identifier?: string | null,
): readonly PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  const pwd = plaintext ?? '';
  if (pwd.length < PASSWORD_MIN_LENGTH) {
    violations.push({ code: 'TOO_SHORT', message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
  }
  if (pwd.length > PASSWORD_MAX_LENGTH) {
    violations.push({ code: 'TOO_LONG', message: 'Password exceeds maximum length.' });
  }
  if (!/[A-Z]/.test(pwd)) violations.push({ code: 'MISSING_UPPER', message: 'Password requires an uppercase letter.' });
  if (!/[a-z]/.test(pwd)) violations.push({ code: 'MISSING_LOWER', message: 'Password requires a lowercase letter.' });
  if (!/[0-9]/.test(pwd)) violations.push({ code: 'MISSING_DIGIT', message: 'Password requires a digit.' });
  const id = (identifier ?? '').trim().toLowerCase();
  if (id && pwd.trim().toLowerCase() === id) {
    violations.push({ code: 'MATCHES_IDENTIFIER', message: 'Password must not equal the login identifier.' });
  }
  return violations;
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LEN, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key as Buffer);
    });
  });
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    if (typeof plaintext !== 'string' || plaintext.length === 0) throw new Error('PASSWORD_REQUIRED');
    const salt = randomBytes(SALT_LEN);
    const key = await scryptAsync(plaintext, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
    return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(plaintext: string, encoded: string): Promise<boolean> {
    // Malformed/foreign records fail closed instead of throwing to the caller.
    if (typeof encoded !== 'string' || typeof plaintext !== 'string') return false;
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    let salt: Buffer;
    let expected: Buffer;
    try {
      salt = Buffer.from(parts[4], 'base64');
      expected = Buffer.from(parts[5], 'base64');
    } catch {
      return false;
    }
    if (expected.length === 0) return false;
    const actual = await scryptAsync(plaintext, salt, n, r, p);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  /**
   * Burns comparable CPU time for unknown accounts so response timing does not
   * reveal whether an account exists (anti-enumeration, §13).
   */
  async dummyVerify(plaintext: string): Promise<void> {
    const salt = Buffer.alloc(SALT_LEN, 0);
    await scryptAsync(typeof plaintext === 'string' ? plaintext : '', salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  }
}