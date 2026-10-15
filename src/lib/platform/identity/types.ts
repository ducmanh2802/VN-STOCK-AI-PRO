/**
 * PLATFORM-01 — IDENTITY TYPES (pure, no I/O)
 *
 * Identity is deliberately separated from persistence and from the token provider:
 * every provider/clock/store is injected so the security rules are testable offline.
 */

/** §10 authentication states. */
export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'PENDING';

/** §11 authentication events. No secret material is ever carried in these records. */
export type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'SESSION_REVOKED'
  | 'SESSION_RENEWED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_ENABLED'
  | 'ACCOUNT_LOCKED';

/**
 * Fail-closed error codes. INVALID_CREDENTIALS is intentionally used for BOTH
 * "unknown account" and "wrong password" so responses cannot enumerate accounts.
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_LOCKED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'NOT_AUTHENTICATED'
  | 'WEAK_PASSWORD'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE';

export interface UserAccount {
  readonly userId: string;
  readonly status: UserStatus;
  /** scrypt-encoded credential record; null for provider-only (e.g. Firebase) accounts. */
  readonly passwordHash: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastLoginAt: number | null;
  readonly disabledReason: string | null;
}

export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  /** Set when the identity came from a third-party ID token rather than a platform session. */
  readonly provider: 'platform-session' | 'external-id-token';
}

export interface SessionRecord {
  readonly sessionId: string;
  readonly userId: string;
  /** sha256 of the bearer token. The raw token is never stored. */
  readonly tokenHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly renewalCount: number;
  readonly lastRenewedAt: number | null;
}

export interface AuthEvent {
  readonly type: AuthEventType;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly occurredAt: number;
  readonly outcome: 'SUCCESS' | 'FAILURE';
  /** Coarse, non-identifying client context only (e.g. hashed user agent). */
  readonly metadata: Readonly<Record<string, string>>;
}

export type AuthResult =
  | {
      readonly ok: true;
      readonly principal: Principal;
      readonly session: SessionRecord;
      /**
       * Bearer token for platform sessions — returned ONLY at issuance time and never
       * persisted. Null when authentication came from an external ID token the client
       * already holds (Firebase), so no second secret is minted.
       */
      readonly token: string | null;
    }
  | { readonly ok: false; readonly code: AuthErrorCode };

/** §11 sink — implemented by the PLATFORM-03 audit layer, never by identity itself. */
export interface AuthEventSink {
  record(event: AuthEvent): void;
}

export class InMemoryAuthEventSink implements AuthEventSink {
  private readonly events: AuthEvent[] = [];

  record(event: AuthEvent): void {
    this.events.push(event);
  }

  all(): readonly AuthEvent[] {
    return [...this.events];
  }

  types(): readonly AuthEventType[] {
    return this.events.map((e) => e.type);
  }

  clear(): void {
    this.events.length = 0;
  }
}