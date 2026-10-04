/**
 * PLATFORM-01 — SESSION MANAGEMENT (pure, store + clock injected)
 * §9 requirements: unique id, expiration, revocation, logout, renewal, secure storage.
 *
 * Security properties:
 * - the bearer token is random 32 bytes (256 bits) and is NEVER stored; only its
 *   sha256 hash is persisted, so a store dump cannot be replayed as a session
 * - constant-time token comparison
 * - revoked and expired sessions are distinguishable in the audit trail but both
 *   deny access
 * - renewal extends the expiry and increments renewalCount (bounded by policy)
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthErrorCode, SessionRecord } from './types.ts';

export interface SessionStore {
  create(session: SessionRecord): void;
  get(sessionId: string): SessionRecord | null;
  /** Lookup by token hash — the raw token is never a key. */
  findByTokenHash(tokenHash: string): SessionRecord | null;
  revoke(sessionId: string, at: number): void;
  revokeAllForUser(userId: string, at: number): number;
  listByUser(userId: string): readonly SessionRecord[];
}

export class InMemorySessionStore implements SessionStore {
  private readonly byId = new Map<string, SessionRecord>();

  create(session: SessionRecord): void {
    this.byId.set(session.sessionId, session);
  }

  get(sessionId: string): SessionRecord | null {
    return this.byId.get(sessionId) ?? null;
  }

  findByTokenHash(tokenHash: string): SessionRecord | null {
    for (const s of this.byId.values()) if (hashEquals(s.tokenHash, tokenHash)) return s;
    return null;
  }

  revoke(sessionId: string, at: number): void {
    const s = this.byId.get(sessionId);
    if (s && s.revokedAt === null) this.byId.set(sessionId, { ...s, revokedAt: at });
  }

  revokeAllForUser(userId: string, at: number): number {
    let n = 0;
    for (const s of this.byId.values()) {
      if (s.userId === userId && s.revokedAt === null) {
        this.byId.set(s.sessionId, { ...s, revokedAt: at });
        n++;
      }
    }
    return n;
  }

  listByUser(userId: string): readonly SessionRecord[] {
    return [...this.byId.values()].filter((s) => s.userId === userId);
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hashEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export interface SessionIssueResult {
  readonly token: string;
  readonly session: SessionRecord;
}

export type SessionAuthResult =
  | { readonly ok: true; readonly session: SessionRecord }
  | { readonly ok: false; readonly code: Extract<AuthErrorCode, 'NOT_AUTHENTICATED' | 'SESSION_EXPIRED' | 'SESSION_REVOKED'> };

export interface SessionPolicy {
  readonly ttlMs: number;
  readonly renewTtlMs: number;
  readonly maxRenewals: number;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  ttlMs: 12 * 60 * 60 * 1000,
  renewTtlMs: 12 * 60 * 60 * 1000,
  maxRenewals: 12,
};

export class SessionManager {
  constructor(
    private readonly store: SessionStore,
    private readonly now: () => number,
    private readonly policy: SessionPolicy = DEFAULT_SESSION_POLICY,
  ) {}

  issue(userId: string): SessionIssueResult {
    if (!userId || !userId.trim()) throw new Error('SESSION_USER_REQUIRED');
    const token = randomBytes(32).toString('base64url');
    const at = this.now();
    const session: SessionRecord = {
      sessionId: `sess_${randomBytes(12).toString('hex')}`,
      userId,
      tokenHash: hashToken(token),
      createdAt: at,
      expiresAt: at + this.policy.ttlMs,
      revokedAt: null,
      renewalCount: 0,
      lastRenewedAt: null,
    };
    this.store.create(session);
    return { token, session };
  }

  authenticate(token: string | null | undefined): SessionAuthResult {
    if (typeof token !== 'string' || token.length === 0) return { ok: false, code: 'NOT_AUTHENTICATED' };
    const session = this.store.findByTokenHash(hashToken(token));
    if (!session) return { ok: false, code: 'NOT_AUTHENTICATED' };
    if (session.revokedAt !== null) return { ok: false, code: 'SESSION_REVOKED' };
    if (this.now() >= session.expiresAt) return { ok: false, code: 'SESSION_EXPIRED' };
    return { ok: true, session };
  }

  /** Idempotent logout. Revoking an already-revoked session is a no-op, not an error. */
  logout(sessionId: string): boolean {
    const s = this.store.get(sessionId);
    if (!s || s.revokedAt !== null) return false;
    this.store.revoke(sessionId, this.now());
    return true;
  }

  revokeAll(userId: string): number {
    return this.store.revokeAllForUser(userId, this.now());
  }

  renew(sessionId: string): SessionAuthResult {
    const s = this.store.get(sessionId);
    if (!s) return { ok: false, code: 'NOT_AUTHENTICATED' };
    if (s.revokedAt !== null) return { ok: false, code: 'SESSION_REVOKED' };
    const at = this.now();
    if (at >= s.expiresAt) return { ok: false, code: 'SESSION_EXPIRED' };
    if (s.renewalCount >= this.policy.maxRenewals) {
      // Bounded renewal: force re-authentication instead of an immortal session.
      this.store.revoke(sessionId, at);
      return { ok: false, code: 'SESSION_EXPIRED' };
    }
    const renewed: SessionRecord = {
      ...s,
      expiresAt: at + this.policy.renewTtlMs,
      renewalCount: s.renewalCount + 1,
      lastRenewedAt: at,
    };
    this.store.create(renewed);
    return { ok: true, session: renewed };
  }

  activeSessions(userId: string): readonly SessionRecord[] {
    const at = this.now();
    return this.store.listByUser(userId).filter((s) => s.revokedAt === null && at < s.expiresAt);
  }
}