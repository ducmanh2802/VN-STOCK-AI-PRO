/**
 * PLATFORM-01 — IDENTITY SERVICE (application orchestration, no I/O)
 *
 * Rules enforced here (§13):
 *  - valid credentials → authenticated (session issued)
 *  - invalid credentials → INVALID_CREDENTIALS for BOTH unknown user and wrong password
 *  - disabled/locked account → rejected (and its sessions are dead)
 *  - expired session → SESSION_EXPIRED
 *  - revoked session → SESSION_REVOKED
 *  - logout → session invalidated
 *  - password change → previous credential invalidated + all sessions revoked
 *
 * No financial/business logic lives here: identity does not know what a portfolio is.
 */
import { ScryptPasswordHasher, validatePassword, type PasswordHasher } from './password.ts';
import { SessionManager } from './session.ts';
import type { TokenVerifier } from './tokenVerifier.ts';
import type { AuthEvent, AuthEventSink, AuthEventType, AuthResult, UserAccount, UserStatus } from './types.ts';

export interface UserStore {
  get(userId: string): UserAccount | null;
  getByIdentifier(identifier: string): UserAccount | null;
  put(account: UserAccount): void;
}

export class InMemoryUserStore implements UserStore {
  private readonly byId = new Map<string, UserAccount>();
  private readonly byIdentifier = new Map<string, string>();

  get(userId: string): UserAccount | null {
    return this.byId.get(userId) ?? null;
  }

  getByIdentifier(identifier: string): UserAccount | null {
    const id = this.byIdentifier.get(identifier.trim().toLowerCase());
    return id ? (this.byId.get(id) ?? null) : null;
  }

  put(account: UserAccount): void {
    this.byId.set(account.userId, account);
    if (account.passwordHash !== null) this.byIdentifier.set(account.userId.toLowerCase(), account.userId);
  }

  /** Test helper: index a local-password account by its login identifier. */
  putWithIdentifier(identifier: string, account: UserAccount): void {
    this.byId.set(account.userId, account);
    this.byIdentifier.set(identifier.trim().toLowerCase(), account.userId);
  }
}

export interface LockoutPolicy {
  readonly maxAttempts: number;
  readonly windowMs: number;
  readonly lockMs: number;
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };

interface AttemptState {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

export interface CreateUserInput {
  readonly userId: string;
  readonly identifier: string;
  readonly password: string;
  readonly status?: UserStatus;
  readonly now: number;
}

export class IdentityService {
  private readonly hasher: PasswordHasher;
  private readonly sessions: SessionManager;
  private readonly attempts = new Map<string, AttemptState>();
  private readonly lockout: LockoutPolicy;

  constructor(
    private readonly users: UserStore,
    private readonly sink: AuthEventSink,
    private readonly now: () => number,
    sessions: SessionManager,
    hasher: PasswordHasher = new ScryptPasswordHasher(),
    lockout: LockoutPolicy = DEFAULT_LOCKOUT_POLICY,
  ) {
    this.sessions = sessions;
    this.hasher = hasher;
    this.lockout = lockout;
  }

  private emit(type: AuthEventType, userId: string | null, sessionId: string | null, outcome: 'SUCCESS' | 'FAILURE', metadata: Record<string, string> = {}): void {
    const event: AuthEvent = { type, userId, sessionId, occurredAt: this.now(), outcome, metadata };
    this.sink.record(event);
  }

  async createUser(input: CreateUserInput): Promise<UserAccount> {
    if (!input.userId || !input.userId.trim()) throw new Error('USER_ID_REQUIRED');
    if (!input.identifier || !input.identifier.trim()) throw new Error('USER_IDENTIFIER_REQUIRED');
    const violations = validatePassword(input.password, input.identifier);
    if (violations.length > 0) throw new Error(`PASSWORD_POLICY:${violations.map((v) => v.code).join(',')}`);
    if (this.users.get(input.userId)) throw new Error('USER_ALREADY_EXISTS');
    const account: UserAccount = {
      userId: input.userId,
      status: input.status ?? 'ACTIVE',
      passwordHash: await this.hasher.hash(input.password),
      createdAt: input.now,
      updatedAt: input.now,
      lastLoginAt: null,
      disabledReason: null,
    };
    this.storeAccount(account, input.identifier);
    this.emit('LOGIN_SUCCESS', account.userId, null, 'SUCCESS', { event: 'user_created' });
    return account;
  }

  /** Persists the account, indexing it by login identifier when one was supplied. */
  private storeAccount(account: UserAccount, identifier: string | null): void {
    const store = this.users as InMemoryUserStore & UserStore;
    if (identifier && typeof store.putWithIdentifier === 'function') store.putWithIdentifier(identifier, account);
    else store.put(account);
  }

  /** Provider-linked account: no local password is ever created. */
  registerExternalUser(input: { userId: string; identifier: string | null; now: number; status?: UserStatus }): UserAccount {
    const account: UserAccount = {
      userId: input.userId,
      status: input.status ?? 'ACTIVE',
      passwordHash: null,
      createdAt: input.now,
      updatedAt: input.now,
      lastLoginAt: null,
      disabledReason: null,
    };
    if (input.identifier) this.storeAccount(account, input.identifier);
    else this.users.put(account);
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

  private resetAttempts(identifier: string): void {
    this.attempts.delete(identifier.trim().toLowerCase());
  }

  /**
   * Enumeration-safe password authentication.
   * Unknown account and wrong password produce the SAME code, and the unknown path
   * still performs a scrypt verification so timing does not leak existence.
   */
  async authenticateWithPassword(input: { identifier: string; password: string }): Promise<AuthResult> {
    const identifier = (input.identifier ?? '').trim();
    if (!identifier || typeof input.password !== 'string' || input.password.length === 0) {
      return { ok: false, code: 'INVALID_CREDENTIALS' };
    }
    const state = this.lockState(identifier);
    const at = this.now();
    if (state.lockedUntil !== null && at < state.lockedUntil) {
      this.emit('LOGIN_FAILURE', null, null, 'FAILURE', { reason: 'locked' });
      return { ok: false, code: 'ACCOUNT_LOCKED' };
    }

    const account = this.users.getByIdentifier(identifier);
    if (!account) {
      await (this.hasher as ScryptPasswordHasher).dummyVerify?.(input.password);
      this.registerFailure(identifier);
      this.emit('LOGIN_FAILURE', null, null, 'FAILURE', { reason: 'unknown_account' });
      return { ok: false, code: 'INVALID_CREDENTIALS' };
    }

    if (account.status === 'DISABLED') {
      // Wrong password on a disabled account must NOT reveal that the account exists.
      const passwordOk = account.passwordHash ? await this.hasher.verify(input.password, account.passwordHash) : false;
      if (!passwordOk) {
        this.registerFailure(identifier);
        this.emit('LOGIN_FAILURE', account.userId, null, 'FAILURE', { reason: 'invalid_credentials' });
        return { ok: false, code: 'INVALID_CREDENTIALS' };
      }
      this.emit('LOGIN_FAILURE', account.userId, null, 'FAILURE', { reason: 'account_disabled' });
      return { ok: false, code: 'ACCOUNT_DISABLED' };
    }

    if (account.status === 'LOCKED' || account.status === 'PENDING') {
      this.emit('LOGIN_FAILURE', account.userId, null, 'FAILURE', { reason: `status_${account.status}` });
      return { ok: false, code: account.status === 'LOCKED' ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS' };
    }

    const ok = account.passwordHash ? await this.hasher.verify(input.password, account.passwordHash) : false;
    if (!ok) {
      this.registerFailure(identifier);
      this.emit('LOGIN_FAILURE', account.userId, null, 'FAILURE', { reason: 'invalid_credentials' });
      return { ok: false, code: 'INVALID_CREDENTIALS' };
    }

    this.resetAttempts(identifier);
    const { token, session } = this.sessions.issue(account.userId);
    this.users.put({ ...account, lastLoginAt: at, updatedAt: at });
    this.emit('LOGIN_SUCCESS', account.userId, session.sessionId, 'SUCCESS');
    return {
      ok: true,
      principal: {
        userId: account.userId,
        sessionId: session.sessionId,
        issuedAt: session.createdAt,
        expiresAt: session.expiresAt,
        provider: 'platform-session',
      },
session,
      token,
    };
  }

  private registerFailure(identifier: string): void {
    const s = this.lockState(identifier);
    const at = this.now();
    if (at - s.firstAttemptAt > this.lockout.windowMs) {
      s.count = 0;
      s.firstAttemptAt = at;
    }
    s.count += 1;
    if (s.count >= this.lockout.maxAttempts && s.lockedUntil === null) {
      s.lockedUntil = at + this.lockout.lockMs;
      const account = this.users.getByIdentifier(identifier);
      if (account && account.status === 'ACTIVE') {
        this.users.put({ ...account, status: 'LOCKED', updatedAt: at, disabledReason: 'lockout' });
      }
      this.emit('ACCOUNT_LOCKED', account?.userId ?? null, null, 'FAILURE', { attempts: String(s.count) });
    }
  }

  authenticateToken(token: string | null | undefined): AuthResult {
    const res = this.sessions.authenticate(token);
    if ('code' in res) return { ok: false, code: res.code };
    const account = this.users.get(res.session.userId);
    if (!account) return { ok: false, code: 'NOT_AUTHENTICATED' };
    if (account.status === 'DISABLED' || account.status === 'LOCKED') {
      return { ok: false, code: account.status === 'LOCKED' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_DISABLED' };
    }
    return {
      ok: true,
      principal: {
        userId: res.session.userId,
        sessionId: res.session.sessionId,
        issuedAt: res.session.createdAt,
        expiresAt: res.session.expiresAt,
        provider: 'platform-session',
      },
      session: res.session,
      token: null,
    };
  }

  /** External ID token path (existing Firebase deployment). Provider failures are explicit. */
  async authenticateExternalToken(token: string, verifier: TokenVerifier): Promise<AuthResult> {
    let id;
    try {
      id = await verifier.verify(token);
    } catch {
      this.emit('LOGIN_FAILURE', null, null, 'FAILURE', { reason: 'provider_unavailable' });
      return { ok: false, code: 'PROVIDER_UNAVAILABLE' };
    }
    if (!id) {
      this.emit('LOGIN_FAILURE', null, null, 'FAILURE', { reason: 'invalid_token' });
      return { ok: false, code: 'INVALID_CREDENTIALS' };
    }
    // The provider's own disabled signal is authoritative — a disabled Firebase
    // account must never authenticate just because the local row is stale.
    if (id.disabled) {
      this.emit('LOGIN_FAILURE', id.userId, null, 'FAILURE', { reason: 'provider_disabled' });
      return { ok: false, code: 'ACCOUNT_DISABLED' };
    }
    const account = this.users.get(id.userId);
    if (account && (account.status === 'DISABLED' || account.status === 'LOCKED')) {
      this.emit('LOGIN_FAILURE', id.userId, null, 'FAILURE', { reason: `status_${account.status}` });
      return { ok: false, code: account.status === 'LOCKED' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_DISABLED' };
    }
    const at = this.now();
    if (account) this.users.put({ ...account, lastLoginAt: at, updatedAt: at });
    this.emit('LOGIN_SUCCESS', id.userId, null, 'SUCCESS', { provider: verifier.name });
    return {
      ok: true,
      principal: {
        userId: id.userId,
        sessionId: `ext_${id.userId}`,
        issuedAt: at,
        expiresAt: at,
        provider: 'external-id-token',
      },
      session: {
        sessionId: `ext_${id.userId}`,
        userId: id.userId,
        tokenHash: '',
        createdAt: at,
        expiresAt: at,
        revokedAt: null,
        renewalCount: 0,
        lastRenewedAt: null,
      },
      token: null,
    };
  }

  logout(principal: { userId: string; sessionId: string }): boolean {
    const revoked = this.sessions.logout(principal.sessionId);
    this.emit('LOGOUT', principal.userId, principal.sessionId, 'SUCCESS');
    return revoked;
  }

  /** §13: changing the password invalidates the previous credential and kills every session. */
  async changePassword(input: { userId: string; currentPassword: string; newPassword: string }): Promise<{ revokedSessions: number }> {
    const account = this.users.get(input.userId);
    if (!account || !account.passwordHash) throw new Error('USER_NOT_FOUND');
    const ok = await this.hasher.verify(input.currentPassword, account.passwordHash);
    if (!ok) {
      this.emit('PASSWORD_CHANGED', account.userId, null, 'FAILURE', { reason: 'current_password_invalid' });
      throw new Error('CURRENT_PASSWORD_INVALID');
    }
    const violations = validatePassword(input.newPassword, account.userId);
    if (violations.length > 0) throw new Error(`PASSWORD_POLICY:${violations.map((v) => v.code).join(',')}`);
    const at = this.now();
    this.users.put({ ...account, passwordHash: await this.hasher.hash(input.newPassword), updatedAt: at });
    const revoked = this.sessions.revokeAll(account.userId);
    this.emit('PASSWORD_CHANGED', account.userId, null, 'SUCCESS', { revokedSessions: String(revoked) });
    return { revokedSessions: revoked };
  }

  /** §11 password reset boundary: no reset token is minted; only the event + policy hook. */
  requestPasswordReset(identifier: string): void {
    this.emit('PASSWORD_RESET_REQUESTED', this.users.getByIdentifier(identifier)?.userId ?? null, null, 'SUCCESS');
  }

  disableUser(userId: string, reason: string): number {
    const account = this.users.get(userId);
    if (!account) throw new Error('USER_NOT_FOUND');
    const at = this.now();
    this.users.put({ ...account, status: 'DISABLED', updatedAt: at, disabledReason: reason });
    const revoked = this.sessions.revokeAll(userId);
    this.emit('ACCOUNT_DISABLED', userId, null, 'SUCCESS', { revokedSessions: String(revoked) });
    return revoked;
  }

  enableUser(userId: string): void {
    const account = this.users.get(userId);
    if (!account) throw new Error('USER_NOT_FOUND');
    const at = this.now();
    this.users.put({ ...account, status: 'ACTIVE', updatedAt: at, disabledReason: null });
    this.resetAttempts(userId);
    this.emit('ACCOUNT_ENABLED', userId, null, 'SUCCESS');
  }

  sessionsFor(userId: string): ReturnType<SessionManager['activeSessions']> {
    return this.sessions.activeSessions(userId);
  }
}