/**
 * BUSINESS-06 — CONSTRAINT-FAITHFUL IN-MEMORY PERSISTENCE HARNESS
 * ================================================================
 * Implements the SAME ports as the SQL adapters and enforces the SAME invariants that the
 * PostgreSQL migrations declare:
 *
 *   - UNIQUE (user identifier), UNIQUE session_id
 *   - UNIQUE (organization_id, user_id) on memberships
 *   - CHECK seat assignment  (ASSIGNED ⇔ assigned_user_id IS NOT NULL)
 *   - PARTIAL UNIQUE (organization_id, assigned_user_id) WHERE status='ASSIGNED'
 *   - UNIQUE (provider, event_id) on webhooks        → idempotency
 *   - UNIQUE event_id + causation_id on the ledger  → no double accounting
 *   - UNIQUE subject_id on subscriptions
 *   - compare-and-set on subscription version
 *
 * HONEST LIMITATION: this is a harness, **not** a PostgreSQL server. It exists so the
 * behavioural and concurrency suite can run offline. The SQL adapters and the migration are
 * the production path; a live-PostgreSQL integration test remains a documented requirement
 * (the same honesty rule applied to PLATFORM-05 backup/restore).
 */

import {
  PersistenceError,
  type AuthEventRepository,
  type CommercialLedgerRepository,
  type CommercialLedgerRow,
  type DurableSession,
  type DurableUserAccount,
  type MembershipRecord,
  type MembershipRepository,
  type OrganizationRecord,
  type OrganizationRepository,
  type SeatAllocationPort,
  type SeatAllocationRequest,
  type SeatAllocationResult,
  type SeatRecord,
  type SeatRepository,
  type SessionRepository,
  type SubscriptionRepository,
  type SubscriptionRow,
  type TransactionContext,
  type TransactionRunner,
  type UserAccountRepository,
  type WebhookRecord,
  type WebhookRepository,
} from './contracts.ts';
import { randomBytes } from 'node:crypto';

/**
 * Serializes transactions the way a real SERIALIZABLE/REPEATABLE-READ database would:
 * one transaction at a time. This is what makes the seat-overcommit race testable — the
 * loser observes the winner's committed state and is refused by the invariant.
 */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export class InMemoryUserAccountRepository implements UserAccountRepository {
  private readonly byId = new Map<string, DurableUserAccount>();
  private readonly byIdentifier = new Map<string, string>();

  async findById(userId: string): Promise<DurableUserAccount | null> {
    return this.byId.get(userId) ?? null;
  }

  async findByIdentifier(identifier: string): Promise<DurableUserAccount | null> {
    const id = this.byIdentifier.get(identifier.trim().toLowerCase());
    return id ? (this.byId.get(id) ?? null) : null;
  }

  async insert(account: DurableUserAccount): Promise<void> {
    if (this.byId.has(account.userId)) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'user exists', 'platform_user_account_pkey');
    }
    if (account.identifier) {
      const key = account.identifier.trim().toLowerCase();
      if (this.byIdentifier.has(key)) {
        throw new PersistenceError('CONSTRAINT_VIOLATION', 'identifier exists', 'platform_user_account_identifier_uniq');
      }
      this.byIdentifier.set(key, account.userId);
    }
    this.byId.set(account.userId, account);
  }

  async update(account: DurableUserAccount): Promise<void> {
    const existing = this.byId.get(account.userId);
    if (!existing) throw new PersistenceError('NOT_FOUND', 'user missing', 'platform_user_account_pkey');
    if (account.identifier && account.identifier !== existing.identifier) {
      const key = account.identifier.trim().toLowerCase();
      const owner = this.byIdentifier.get(key);
      if (owner && owner !== account.userId) {
        throw new PersistenceError('CONSTRAINT_VIOLATION', 'identifier taken', 'platform_user_account_identifier_uniq');
      }
      if (existing.identifier) this.byIdentifier.delete(existing.identifier.toLowerCase());
      this.byIdentifier.set(key, account.userId);
    }
    this.byId.set(account.userId, account);
  }

  all(): readonly DurableUserAccount[] {
    return [...this.byId.values()];
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly byId = new Map<string, DurableSession>();
  private readonly byTokenHash = new Map<string, string>();

  async insert(session: DurableSession): Promise<void> {
    if (this.byId.has(session.sessionId)) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'session exists', 'platform_sessions_pkey');
    }
    if (this.byTokenHash.has(session.tokenHash)) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'token hash exists', 'platform_sessions_token_hash_uniq');
    }
    this.byId.set(session.sessionId, session);
    this.byTokenHash.set(session.tokenHash, session.sessionId);
  }

  async findByTokenHash(tokenHash: string): Promise<DurableSession | null> {
    const id = this.byTokenHash.get(tokenHash);
    return id ? (this.byId.get(id) ?? null) : null;
  }

  async findById(sessionId: string): Promise<DurableSession | null> {
    return this.byId.get(sessionId) ?? null;
  }

  async revoke(sessionId: string, at: number): Promise<void> {
    const s = this.byId.get(sessionId);
    if (!s) throw new PersistenceError('NOT_FOUND', 'session missing', 'platform_sessions_pkey');
    this.byId.set(sessionId, { ...s, revokedAt: s.revokedAt ?? at });
  }

  async revokeAllForUser(userId: string, at: number): Promise<number> {
    let n = 0;
    for (const s of [...this.byId.values()]) {
      if (s.userId === userId && s.revokedAt === null) {
        this.byId.set(s.sessionId, { ...s, revokedAt: at });
        n++;
      }
    }
    return n;
  }

  async listByUser(userId: string): Promise<readonly DurableSession[]> {
    return [...this.byId.values()].filter((s) => s.userId === userId);
  }

  activeCount(userId: string, at: number): number {
    return [...this.byId.values()].filter((s) => s.userId === userId && s.revokedAt === null && s.expiresAt > at).length;
  }
}

export class InMemoryAuthEventRepository implements AuthEventRepository {
  private readonly rows: Array<{
    eventId: string;
    eventType: string;
    userId: string | null;
    sessionId: string | null;
    occurredAt: number;
    outcome: string;
    metadata: string;
  }> = [];

  async append(event: {
    eventId: string;
    eventType: string;
    userId: string | null;
    sessionId: string | null;
    occurredAt: number;
    outcome: string;
    metadata: string;
  }): Promise<void> {
    if (this.rows.some((r) => r.eventId === event.eventId)) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'event exists', 'platform_auth_events_event_id_uniq');
    }
    this.rows.push(event);
  }

  async countByType(eventType: string): Promise<number> {
    return this.rows.filter((r) => r.eventType === eventType).length;
  }

  all(): readonly { eventId: string; eventType: string; outcome: string; occurredAt: number }[] {
    return this.rows.map(({ eventId, eventType, outcome, occurredAt }) => ({ eventId, eventType, outcome, occurredAt }));
  }
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private readonly byId = new Map<string, OrganizationRecord>();

  async insert(org: OrganizationRecord): Promise<void> {
    if (this.byId.has(org.organizationId)) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'organization exists', 'business_organizations_oid_uniq');
    }
    this.byId.set(org.organizationId, org);
  }

  async findById(organizationId: string): Promise<OrganizationRecord | null> {
    return this.byId.get(organizationId) ?? null;
  }

  async update(org: OrganizationRecord): Promise<void> {
    if (!this.byId.has(org.organizationId)) {
      throw new PersistenceError('NOT_FOUND', 'organization missing', 'business_organizations_oid_uniq');
    }
    this.byId.set(org.organizationId, org);
  }

  all(): readonly OrganizationRecord[] {
    return [...this.byId.values()];
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly rows = new Map<string, MembershipRecord>();

  private key(organizationId: string, userId: string): string {
    return `${organizationId}::${userId}`;
  }

  async insert(membership: MembershipRecord): Promise<void> {
    const k = this.key(membership.organizationId, membership.userId);
    if (this.rows.has(k)) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'membership exists', 'business_org_memberships_uniq');
    }
    this.rows.set(k, membership);
  }

  async find(organizationId: string, userId: string): Promise<MembershipRecord | null> {
    return this.rows.get(this.key(organizationId, userId)) ?? null;
  }

  async listByOrganization(organizationId: string): Promise<readonly MembershipRecord[]> {
    return [...this.rows.values()].filter((m) => m.organizationId === organizationId);
  }

  async listByUser(userId: string): Promise<readonly MembershipRecord[]> {
    return [...this.rows.values()].filter((m) => m.userId === userId);
  }

  async update(membership: MembershipRecord): Promise<void> {
    const k = this.key(membership.organizationId, membership.userId);
    if (!this.rows.has(k)) {
      throw new PersistenceError('NOT_FOUND', 'membership missing', 'business_org_memberships_uniq');
    }
    this.rows.set(k, membership);
  }

  async remove(organizationId: string, userId: string): Promise<boolean> {
    return this.rows.delete(this.key(organizationId, userId));
  }
}

export class InMemorySeatRepository implements SeatRepository {
  private readonly byId = new Map<string, SeatRecord>();

  /** Mirrors CHECK business_org_seats_assignment_check. */
  private static assertAssignmentCheck(seat: SeatRecord): void {
    const consistent = (seat.status === 'ASSIGNED') === (seat.assignedUserId !== null);
    if (!consistent) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'seat assignment inconsistent', 'business_org_seats_assignment_check');
    }
  }

  /** Mirrors the PARTIAL UNIQUE index on (organization_id, assigned_user_id) WHERE ASSIGNED. */
  private assertActiveAssignmentUnique(seat: SeatRecord): void {
    if (seat.status !== 'ASSIGNED' || !seat.assignedUserId) return;
    for (const other of this.byId.values()) {
      if (other.seatId === seat.seatId) continue;
      if (other.organizationId === seat.organizationId && other.status === 'ASSIGNED' && other.assignedUserId === seat.assignedUserId) {
        throw new PersistenceError('CONSTRAINT_VIOLATION', 'user already holds an assigned seat', 'business_org_seats_active_assignment');
      }
    }
  }

  async insert(seat: SeatRecord): Promise<void> {
    if (this.byId.has(seat.seatId)) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'seat exists', 'business_org_seats_sid_idx');
    }
    InMemorySeatRepository.assertAssignmentCheck(seat);
    this.byId.set(seat.seatId, seat);
  }

  async findById(seatId: string): Promise<SeatRecord | null> {
    return this.byId.get(seatId) ?? null;
  }

  async listByOrganization(organizationId: string): Promise<readonly SeatRecord[]> {
    return [...this.byId.values()].filter((s) => s.organizationId === organizationId);
  }

  async update(seat: SeatRecord): Promise<void> {
    if (!this.byId.has(seat.seatId)) {
      throw new PersistenceError('NOT_FOUND', 'seat missing', 'business_org_seats_sid_idx');
    }
    InMemorySeatRepository.assertAssignmentCheck(seat);
    this.assertActiveAssignmentUnique(seat);
    this.byId.set(seat.seatId, seat);
  }

  assignedCount(organizationId: string): number {
    return [...this.byId.values()].filter((s) => s.organizationId === organizationId && s.status === 'ASSIGNED').length;
  }
}

export class InMemorySeatAllocation implements SeatAllocationPort {
  constructor(private readonly seats: InMemorySeatRepository, private readonly memberships: InMemoryMembershipRepository) {}

  async allocate(request: SeatAllocationRequest): Promise<SeatAllocationResult> {
    if (request.purchasedSeats < 0 || !Number.isInteger(request.purchasedSeats)) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'purchased seats invalid', 'business_org_seats_purchased_check');
    }
    // §9: allocated <= purchased. Checked before any write, inside the transaction.
    if (this.seats.assignedCount(request.organizationId) >= request.purchasedSeats) {
      throw new PersistenceError('CONSTRAINT_VIOLATION', 'seat capacity exhausted', 'business_org_seats_capacity');
    }
    const seat: SeatRecord = {
      seatId: request.seatId,
      organizationId: request.organizationId,
      status: 'ASSIGNED',
      assignedUserId: request.userId,
      assignedAt: request.at,
      correlationId: request.correlationId,
      createdAt: request.at,
      updatedAt: request.at,
    };
    await this.seats.update(seat);

    const existing = await this.memberships.find(request.organizationId, request.userId);
    const membership: MembershipRecord = {
      organizationId: request.organizationId,
      userId: request.userId,
      role: existing?.role ?? 'VIEWER',
      status: 'ACTIVE',
      seatId: seat.seatId,
      correlationId: request.correlationId,
      joinedAt: existing?.joinedAt ?? request.at,
      updatedAt: request.at,
    };
    if (existing) await this.memberships.update(membership);
    else await this.memberships.insert(membership);

    return { seat, allocated: this.seats.assignedCount(request.organizationId), purchased: request.purchasedSeats };
  }

  async release(organizationId: string, seatId: string, at: number): Promise<boolean> {
    const seat = await this.seats.findById(seatId);
    if (!seat || seat.organizationId !== organizationId || seat.status !== 'ASSIGNED') return false;
    await this.seats.update({ ...seat, status: 'AVAILABLE', assignedUserId: null, assignedAt: null, updatedAt: at });
    if (seat.assignedUserId) {
      const m = await this.memberships.find(organizationId, seat.assignedUserId);
      if (m) await this.memberships.update({ ...m, seatId: null, updatedAt: at });
    }
    return true;
  }

  async allocatedCount(organizationId: string): Promise<number> {
    return this.seats.assignedCount(organizationId);
  }
}

export class InMemoryWebhookRepository implements WebhookRepository {
  private readonly rows = new Map<string, WebhookRecord>();

  private key(provider: string, eventId: string): string {
    return `${provider}::${eventId}`;
  }

  /** UNIQUE (provider, event_id): the §12 idempotency guarantee. */
  async insertOnce(record: WebhookRecord): Promise<boolean> {
    const k = this.key(record.provider, record.eventId);
    if (this.rows.has(k)) return false;
    this.rows.set(k, record);
    return true;
  }

  async find(provider: string, eventId: string): Promise<WebhookRecord | null> {
    return this.rows.get(this.key(provider, eventId)) ?? null;
  }

  async markProcessed(provider: string, eventId: string, at: number): Promise<void> {
    const r = this.rows.get(this.key(provider, eventId));
    if (!r) throw new PersistenceError('NOT_FOUND', 'webhook missing', 'business_webhook_eid_idx');
    this.rows.set(this.key(provider, eventId), { ...r, processingStatus: 'PROCESSED', processedAt: at, failureReason: null });
  }

  async markFailed(provider: string, eventId: string, at: number, reason: string): Promise<void> {
    const r = this.rows.get(this.key(provider, eventId));
    if (!r) throw new PersistenceError('NOT_FOUND', 'webhook missing', 'business_webhook_eid_idx');
    this.rows.set(this.key(provider, eventId), { ...r, processingStatus: 'FAILED', processedAt: at, failureReason: reason });
  }

  async countByStatus(status: WebhookRecord['processingStatus']): Promise<number> {
    return [...this.rows.values()].filter((r) => r.processingStatus === status).length;
  }

  all(): readonly WebhookRecord[] {
    return [...this.rows.values()];
  }
}

export class InMemoryCommercialLedgerRepository implements CommercialLedgerRepository {
  private readonly byEventId = new Map<string, CommercialLedgerRow>();
  private readonly byCausation = new Map<string, string>();

  /** UNIQUE event_id AND UNIQUE causation_id → a replay cannot double-account (§10). */
  async appendOnce(row: CommercialLedgerRow): Promise<boolean> {
    if (this.byEventId.has(row.eventId)) return false;
    if (row.causationId && this.byCausation.has(row.causationId)) return false;
    this.byEventId.set(row.eventId, row);
    if (row.causationId) this.byCausation.set(row.causationId, row.eventId);
    return true;
  }

  async findByEventId(eventId: string): Promise<CommercialLedgerRow | null> {
    return this.byEventId.get(eventId) ?? null;
  }

  async listBySubject(subjectId: string, limit: number): Promise<readonly CommercialLedgerRow[]> {
    return [...this.byEventId.values()].filter((r) => r.subjectId === subjectId).slice(-limit);
  }

  async totalMinor(subjectId: string, periodKey: string): Promise<number> {
    return [...this.byEventId.values()]
      .filter((r) => r.subjectId === subjectId && r.periodKey === periodKey)
      .reduce((sum, r) => sum + r.amountMinor, 0);
  }

  count(): number {
    return this.byEventId.size;
  }
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly bySubject = new Map<string, SubscriptionRow>();
  private readonly byProviderRef = new Map<string, string>();

  async upsert(row: SubscriptionRow): Promise<void> {
    const existing = this.bySubject.get(row.subjectId);
    this.bySubject.set(row.subjectId, existing ? { ...row, createdAt: existing.createdAt } : row);
    if (row.providerRef) this.byProviderRef.set(row.providerRef, row.subjectId);
  }

  async findBySubject(subjectId: string): Promise<SubscriptionRow | null> {
    return this.bySubject.get(subjectId) ?? null;
  }

  async findByProviderRef(providerRef: string): Promise<SubscriptionRow | null> {
    const subjectId = this.byProviderRef.get(providerRef);
    return subjectId ? (this.bySubject.get(subjectId) ?? null) : null;
  }

  /** Compare-and-set on version (§13): a stale writer is refused, never silently applied. */
  async updateStatus(row: SubscriptionRow, expectedVersion: number): Promise<void> {
    const existing = this.bySubject.get(row.subjectId);
    if (!existing) throw new PersistenceError('NOT_FOUND', 'subscription missing', 'business_subscriptions_subject_uniq');
    if (existing.version !== expectedVersion) {
      throw new PersistenceError('SERIALIZATION_CONFLICT', `expected v${expectedVersion}, found v${existing.version}`);
    }
    this.bySubject.set(row.subjectId, { ...row, version: existing.version + 1, createdAt: existing.createdAt });
  }
}

export interface InMemoryPersistenceOptions {
  /** When true, every port throws PERSISTENCE_UNAVAILABLE (outage simulation, §25). */
  readonly unavailable?: boolean;
}

export function createInMemoryPersistence(options: InMemoryPersistenceOptions = {}): {
  persistence: { tx: TransactionRunner; repositories: TransactionContext };
  seatAllocation: SeatAllocationPort;
  internals: {
    users: InMemoryUserAccountRepository;
    sessions: InMemorySessionRepository;
    authEvents: InMemoryAuthEventRepository;
    organizations: InMemoryOrganizationRepository;
    memberships: InMemoryMembershipRepository;
    seats: InMemorySeatRepository;
    webhooks: InMemoryWebhookRepository;
    ledger: InMemoryCommercialLedgerRepository;
    subscriptions: InMemorySubscriptionRepository;
  };
} {
  const internals = {
    users: new InMemoryUserAccountRepository(),
    sessions: new InMemorySessionRepository(),
    authEvents: new InMemoryAuthEventRepository(),
    organizations: new InMemoryOrganizationRepository(),
    memberships: new InMemoryMembershipRepository(),
    seats: new InMemorySeatRepository(),
    webhooks: new InMemoryWebhookRepository(),
    ledger: new InMemoryCommercialLedgerRepository(),
    subscriptions: new InMemorySubscriptionRepository(),
  };
  const seatAllocation = new InMemorySeatAllocation(internals.seats, internals.memberships);

  const guard = <T extends object>(repo: T): T => {
    if (!options.unavailable) return repo;
    return new Proxy(repo, {
      get(target, prop) {
        const value = (target as Record<string | symbol, unknown>)[prop];
        if (typeof value !== 'function' || prop === 'then') return value;
        return () => Promise.reject(new PersistenceError('PERSISTENCE_UNAVAILABLE', 'database unavailable'));
      },
    }) as T;
  };

  const repositories: TransactionContext = {
    users: guard(internals.users),
    sessions: guard(internals.sessions),
    authEvents: guard(internals.authEvents),
    organizations: guard(internals.organizations),
    memberships: guard(internals.memberships),
    seats: guard(internals.seats),
    webhooks: guard(internals.webhooks),
    ledger: guard(internals.ledger),
    subscriptions: guard(internals.subscriptions),
  };

  const mutex = new Mutex();
  const tx: TransactionRunner = {
    run<T>(fn: (t: TransactionContext) => Promise<T>): Promise<T> {
      return mutex.run(async () => {
        if (options.unavailable) throw new PersistenceError('PERSISTENCE_UNAVAILABLE', 'database unavailable');
        return fn(repositories);
      });
    },
  };

  return { persistence: { tx, repositories }, seatAllocation, internals };
}

export function newSessionId(): string {
  return `sess_${randomBytes(12).toString('hex')}`;
}