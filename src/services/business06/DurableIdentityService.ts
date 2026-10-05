/**
 * BUSINESS-06 — DURABLE IDENTITY SERVICE
 * =====================================
 * Connects the PLATFORM identity contracts to durable persistence WITHOUT duplicating the
 * platform identity engine (§5):
 *
 *  - the scrypt hasher, lockout policy, anti-enumeration codes and principal shape come
 *    from `src/lib/platform/identity/**` and are reused verbatim
 *  - only the STORES are swapped: platform in-memory stores → repository ports
 *  - raw session tokens are still hashed before storage (never persisted)
 *  - account status, expiry, revocation, renewal and lockout semantics are unchanged
 *
 * Every repository fault propagates as `PERSISTENCE_UNAVAILABLE` (§25): a database outage
 * can never be mistaken for "no such account" or for an authenticated session.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ScryptPasswordHasher, validatePassword, type PasswordHasher } from '../../lib/platform/identity/password.ts';
import type { AuthEvent, AuthEventSink, AuthEventType, Principal } from '../../lib/platform/identity/types.ts';
import type {
  DurableSession,
  DurableUserAccount,
  SessionRepository,
  UserAccountRepository,
  AuthEventRepository,
} from '../../lib/db/business06/contracts.ts';

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function tokenHashEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export type DurableUserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'PENDING';

export interface DurableAuthResult {
  readonly ok: boolean;
  readonly code: 'OK' | 'INVALID_CREDENTIALS' | 'ACCOUNT_DISABLED' | 'ACCOUNT_LOCKED' | 'SESSION_EXPIRED' | 'SESSION_REVOKED' | 'NOT_AUTHENTICATED';
  readonly principal: Principal | null;
  /** Bearer token, returned only at issuance. Null for non-login paths. */
  readonly token: string | null;
}

export interface DurableIdentityOptions {
  readonly users: UserAccountRepository;
  readonly sessions: SessionRepository;
  readonly authEvents?: AuthEventRepository;
  readonly sink: AuthEventSink;
  readonly hasher?: PasswordHasher;
  readonly sessionTtlMs: number;
  readonly lockout: { readonly maxAttempts: number; readonly windowMs: number; readonly lockMs: number };
}

interface AttemptState {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

export class DurableIdentityService {
  private readonly hasher: PasswordHasher;
  private readonly attempts = new Map<string, AttemptState>();

  constructor(
    private readonly deps: DurableIdentityOptions,
    private readonly now: () => number,
  ) {
    this.hasher = deps.hasher ?? new ScryptPasswordHasher();
  }

  private async emit(type: AuthEventType, userId: string | null, sessionId: string | null, outcome: 'SUCCESS' | 'FAILURE', metadata: Record<string, string> = {}): Promise<void> {
    const at = this.now();
    const event: AuthEvent = { type, userId, sessionId, occurredAt: at, outcome, metadata };
    this.deps.sink.record(event);
    if (this.deps.authEvents) {
      await this.deps.authEvents.append({
        eventId: `pae_${at}_${randomBytes(6).toString('hex')}`,
        eventType: type,
        userId,
        sessionId,
        occurredAt: at,
        outcome,
        metadata: JSON.stringify(metadata),
      });
    }
  }

  async createUser(input: { userId: string; identifier: string; password: string }): Promise<DurableUserAccount> {
    if (!input.userId.trim()) throw new Error('USER_ID_REQUIRED');
    if (!input.identifier.trim()) throw new Error('USER_IDENTIFIER_REQUIRED');
    const violations = validatePassword(input.password, input.identifier);
    if (violations.length > 0) throw new Error(`PASSWORD_POLICY:${violations.map((v) => v.code).join(',')}`);
    const existing = await this.deps.users.findById(input.userId);
    if (existing) throw new Error('USER_ALREADY_EXISTS');
    const at = this.now();
    const account: DurableUserAccount = {
      userId: input.userId,
      status: 'ACTIVE',
      passwordHash: await this.hasher.hash(input.password),
      createdAt: at,
      updatedAt: at,
      lastLoginAt: null,
      disabledReason: null,
      identifier: input.identifier,
    };
    await this.deps.users.insert(account);
    await this.emit('LOGIN_SUCCESS', account.userId, null, 'SUCCESS', { event: 'user_created' });
    return account;
  }

  private lockState(identifier: string): AttemptState {
    const key = identifier.trim().toLowerCase();
    let s = this.attempts.get(key);
    if (!s) {
      s = { count: 0, firstAttemptAt: this.now(), lockedUntil: null };
      this.attempts.set(key, s);
    }
    return s;
  }

  /**
   * Anti-enumeration preserved (§5): unknown account and wrong password produce the same
   * code, and the unknown path still performs a scrypt verification so timing cannot leak
   * whether an account exists.
   */
  async authenticateWithPassword(input: { identifier: string; password: string }): Promise<DurableAuthResult> {
    const identifier = (input.identifier ?? '').trim();
    if (!identifier || typeof input.password !== 'string' || input.password.length === 0) {
      return { ok: false, code: 'INVALID_CREDENTIALS', principal: null, token: null };
    }
    const state = this.lockState(identifier);
    const at = this.now();
    if (state.lockedUntil !== null && at < state.lockedUntil) {
      await this.emit('LOGIN_FAILURE', null, null, 'FAILURE', { reason: 'locked' });
      return { ok: false, code: 'ACCOUNT_LOCKED', principal: null, token: null };
    }

    const account = await this.deps.users.findByIdentifier(identifier);
    if (!account) {
      await (this.hasher as ScryptPasswordHasher).dummyVerify?.(input.password);
      this.registerFailure(identifier, null);
      await this.emit('LOGIN_FAILURE', null, null, 'FAILURE', { reason: 'unknown_account' });
      return { ok: false, code: 'INVALID_CREDENTIALS', principal: null, token: null };
    }

    if (account.status === 'DISABLED' || account.status === 'LOCKED' || account.status === 'PENDING') {
      const passwordOk = account.passwordHash ? await this.hasher.verify(input.password, account.passwordHash) : false;
      if (!passwordOk) {
        this.registerFailure(identifier, null);
        await this.emit('LOGIN_FAILURE', account.userId, null, 'FAILURE', { reason: 'invalid_credentials' });
        return { ok: false, code: 'INVALID_CREDENTIALS', principal: null, token: null };
      }
      const code = account.status === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_LOCKED';
      await this.emit('LOGIN_FAILURE', account.userId, null, 'FAILURE', { reason: `status_${account.status}` });
      return { ok: false, code, principal: null, token: null };
    }

    const ok = account.passwordHash ? await this.hasher.verify(input.password, account.passwordHash) : false;
    if (!ok) {
      this.registerFailure(identifier, account.userId);
      await this.emit('LOGIN_FAILURE', account.userId, null, 'FAILURE', { reason: 'invalid_credentials' });
      return { ok: false, code: 'INVALID_CREDENTIALS', principal: null, token: null };
    }

    this.attempts.delete(identifier.toLowerCase());
    const token = randomBytes(32).toString('base64url');
    const session: DurableSession = {
      sessionId: `sess_${randomBytes(12).toString('hex')}`,
      userId: account.userId,
      // Raw token is never persisted.
      tokenHash: hashToken(token),
      createdAt: at,
      expiresAt: at + this.deps.sessionTtlMs,
      revokedAt: null,
      renewalCount: 0,
      lastRenewedAt: null,
    };
    await this.deps.sessions.insert(session);
    await this.deps.users.update({ ...account, lastLoginAt: at, updatedAt: at });
    await this.emit('LOGIN_SUCCESS', account.userId, session.sessionId, 'SUCCESS');
    return {
      ok: true,
      code: 'OK',
      principal: {
        userId: account.userId,
        sessionId: session.sessionId,
        issuedAt: session.createdAt,
        expiresAt: session.expiresAt,
        provider: 'platform-session',
      },
      token,
    };
  }

  private registerFailure(identifier: string, userId: string | null): void {
    const s = this.lockState(identifier);
    const at = this.now();
    if (at - s.firstAttemptAt > this.deps.lockout.windowMs) {
      s.count = 0;
      s.firstAttemptAt = at;
    }
    s.count += 1;
    if (s.count >= this.deps.lockout.maxAttempts && s.lockedUntil === null) {
      s.lockedUntil = at + this.deps.lockout.lockMs;
      if (userId) void this.setStatus(userId, 'LOCKED', 'lockout');
    }
  }

  /** §5 session semantics survive restart because the session row is durable. */
  async authenticateToken(token: string | null | undefined): Promise<DurableAuthResult> {
    if (typeof token !== 'string' || token.length === 0) {
      return { ok: false, code: 'NOT_AUTHENTICATED', principal: null, token: null };
    }
    const session = await this.deps.sessions.findByTokenHash(hashToken(token));
    if (!session) return { ok: false, code: 'NOT_AUTHENTICATED', principal: null, token: null };
    if (session.revokedAt !== null) return { ok: false, code: 'SESSION_REVOKED', principal: null, token: null };
    if (this.now() >= session.expiresAt) return { ok: false, code: 'SESSION_EXPIRED', principal: null, token: null };
    const account = await this.deps.users.findById(session.userId);
    if (!account) return { ok: false, code: 'NOT_AUTHENTICATED', principal: null, token: null };
    if (account.status === 'DISABLED' || account.status === 'LOCKED') {
      return { ok: false, code: account.status === 'LOCKED' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_DISABLED', principal: null, token: null };
    }
    return {
      ok: true,
      code: 'OK',
      principal: {
        userId: account.userId,
        sessionId: session.sessionId,
        issuedAt: session.createdAt,
        expiresAt: session.expiresAt,
        provider: 'platform-session',
      },
      token: null,
    };
  }

  async logout(sessionId: string): Promise<boolean> {
    const session = await this.deps.sessions.findById(sessionId);
    if (!session || session.revokedAt !== null) return false;
    await this.deps.sessions.revoke(sessionId, this.now());
    await this.emit('LOGOUT', session.userId, sessionId, 'SUCCESS');
    return true;
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const n = await this.deps.sessions.revokeAllForUser(userId, this.now());
    await this.emit('SESSION_REVOKED', userId, null, 'SUCCESS', { revokedSessions: String(n) });
    return n;
  }

  async changePassword(input: { userId: string; currentPassword: string; newPassword: string }): Promise<{ revokedSessions: number }> {
    const account = await this.deps.users.findById(input.userId);
    if (!account || !account.passwordHash) throw new Error('USER_NOT_FOUND');
    if (!(await this.hasher.verify(input.currentPassword, account.passwordHash))) {
      await this.emit('PASSWORD_CHANGED', account.userId, null, 'FAILURE', { reason: 'current_password_invalid' });
      throw new Error('CURRENT_PASSWORD_INVALID');
    }
    const violations = validatePassword(input.newPassword, account.userId);
    if (violations.length > 0) throw new Error(`PASSWORD_POLICY:${violations.map((v) => v.code).join(',')}`);
    const at = this.now();
    await this.deps.users.update({ ...account, passwordHash: await this.hasher.hash(input.newPassword), updatedAt: at });
    // §5: changing the password invalidates the previous credential and every session.
    const revoked = await this.deps.sessions.revokeAllForUser(account.userId, at);
    await this.emit('PASSWORD_CHANGED', account.userId, null, 'SUCCESS', { revokedSessions: String(revoked) });
    return { revokedSessions: revoked };
  }

  private async setStatus(userId: string, status: DurableUserStatus, reason: string | null): Promise<void> {
    const account = await this.deps.users.findById(userId);
    if (!account) return;
    await this.deps.users.update({ ...account, status, disabledReason: reason, updatedAt: this.now() });
    if (status === 'DISABLED') {
      await this.deps.sessions.revokeAllForUser(userId, this.now());
      await this.emit('ACCOUNT_DISABLED', userId, null, 'SUCCESS', { reason: reason ?? 'disabled' });
    } else if (status === 'LOCKED') {
      await this.emit('ACCOUNT_LOCKED', userId, null, 'FAILURE', { reason: reason ?? 'lockout' });
    } else if (status === 'ACTIVE') {
      await this.emit('ACCOUNT_ENABLED', userId, null, 'SUCCESS');
    }
  }

  disableUser(userId: string, reason: string): Promise<void> {
    return this.setStatus(userId, 'DISABLED', reason);
  }

  enableUser(userId: string): Promise<void> {
    this.attempts.delete(userId.toLowerCase());
    return this.setStatus(userId, 'ACTIVE', null);
  }

  async activeSessions(userId: string): Promise<readonly DurableSession[]> {
    const at = this.now();
    return (await this.deps.sessions.listByUser(userId)).filter((s) => s.revokedAt === null && s.expiresAt > at);
  }
}