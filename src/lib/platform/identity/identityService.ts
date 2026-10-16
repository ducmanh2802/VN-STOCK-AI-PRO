import type { SessionManager } from './session.ts';
import type { ScryptPasswordHasher } from './password.ts';
import type { AuthEventSink } from './types.ts';

export class InMemoryUserStore {
  private users = new Map<string, any>();
  async getById(id: string) { return this.users.get(id) ?? null; }
  async getByIdentifier(identifier: string) {
    for (const u of this.users.values()) {
      if (u.identifier === identifier) return u;
    }
    return null;
  }
  async save(user: any) { this.users.set(user.id || user.userId, user); }
}

export class IdentityService {
  private sessionsByToken = new Map<string, { userId: string; sessionId: string; expiresAt: number; provider: string }>();

  constructor(
    public readonly users: InMemoryUserStore,
    public readonly eventSink: AuthEventSink,
    public readonly now: () => number,
    public readonly sessions: SessionManager,
    public readonly hasher: ScryptPasswordHasher
  ) {}

  async createUser(input: { userId: string; identifier: string; password: string; now: number }) {
    const passwordHash = await this.hasher.hash(input.password);
    const user = { id: input.userId, identifier: input.identifier, passwordHash, createdAt: input.now };
    await this.users.save(user);
    this.eventSink.record({ type: 'USER_CREATED', userId: input.userId, timestamp: input.now });
    return user;
  }

  async authenticateWithPassword(input: { identifier: string; password: string }) {
    const user = await this.users.getByIdentifier(input.identifier);
    if (!user) return { ok: false };
    const valid = await this.hasher.verify(input.password, user.passwordHash);
    if (!valid) return { ok: false };

    const token = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const sessionId = `s_${Date.now()}`;
    const expiresAt = this.now() + 24 * 3600 * 1000;
    const principal = { userId: user.id, sessionId, expiresAt, provider: 'password' };
    this.sessionsByToken.set(token, principal);

    return { ok: true, principal, token };
  }

  authenticateToken(token: string | null): { ok: boolean; principal?: any } {
    if (!token) return { ok: false };
    const session = this.sessionsByToken.get(token);
    if (!session || session.expiresAt <= this.now()) return { ok: false };
    return { ok: true, principal: session };
  }

  logout(principal: any): void {
    for (const [t, s] of this.sessionsByToken.entries()) {
      if (s.sessionId === principal.sessionId) {
        this.sessionsByToken.delete(t);
      }
    }
  }

  async changePassword(input: { userId: string; currentPassword: string; newPassword: string }) {
    const user = await this.users.getById(input.userId);
    if (!user) throw new Error('CURRENT_PASSWORD_INVALID');
    const valid = await this.hasher.verify(input.currentPassword, user.passwordHash);
    if (!valid) throw new Error('CURRENT_PASSWORD_INVALID');

    if (input.newPassword.length < 8) {
      throw new Error('PASSWORD_POLICY_TOO_SHORT');
    }

    user.passwordHash = await this.hasher.hash(input.newPassword);
    await this.users.save(user);

    // Revoke existing sessions
    let revoked = 0;
    for (const [t, s] of this.sessionsByToken.entries()) {
      if (s.userId === input.userId) {
        this.sessionsByToken.delete(t);
        revoked++;
      }
    }

    return { revokedSessions: revoked };
  }

  requestPasswordReset(_identifier: string): void {
    // accepted silently
  }

  async authenticateExternalToken(token: string, verifier: any) {
    const res = await verifier.verify(token);
    if (!res.ok) return { ok: false };
    return { ok: true, principal: { userId: res.uid, provider: res.provider || 'external' } };
  }
}
