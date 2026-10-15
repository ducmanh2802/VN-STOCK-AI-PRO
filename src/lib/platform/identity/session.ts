export const DEFAULT_SESSION_POLICY = {
  maxAgeMs: 24 * 60 * 60 * 1000,
  idleTimeoutMs: 2 * 60 * 60 * 1000,
};

export class InMemorySessionStore {
  private sessions = new Map<string, any>();
  async get(id: string) { return this.sessions.get(id) ?? null; }
  async set(id: string, sess: any) { this.sessions.set(id, sess); }
  async delete(id: string) { this.sessions.delete(id); }
}

export class SessionManager {
  constructor(
    private readonly store: InMemorySessionStore = new InMemorySessionStore(),
    private readonly now: () => number = () => Date.now(),
    public readonly policy = DEFAULT_SESSION_POLICY
  ) {}

  async createSession(userId: string) {
    const token = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const session = { id: token, userId, createdAt: this.now(), lastActiveAt: this.now() };
    await this.store.set(token, session);
    return session;
  }

  async getSession(token: string) {
    return this.store.get(token);
  }

  async revokeSession(token: string) {
    await this.store.delete(token);
  }
}
