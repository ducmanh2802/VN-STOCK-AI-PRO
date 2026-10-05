/**
 * BUSINESS-06 — PERSISTENCE CONTRACTS (ports)
 * ============================================
 * Domain engines stay pure and testable without PostgreSQL (§14). This file declares the
 * repository PORTS; `sql/` implements them with drizzle/PostgreSQL and `memory/`
 * implements them with a constraint-faithful harness for offline verification.
 *
 * Failure semantics (§25): a persistence fault is NEVER silently converted into
 * "no subscription" / "free user" / "payment ok". Ports therefore return explicit
 * `PERSISTENCE_UNAVAILABLE` rather than empty results.
 */

export type PersistenceFault =
  | 'PERSISTENCE_UNAVAILABLE'
  | 'CONSTRAINT_VIOLATION'
  | 'NOT_FOUND'
  | 'SERIALIZATION_CONFLICT';

export class PersistenceError extends Error {
  constructor(
    readonly fault: PersistenceFault,
    readonly detail: string,
    /** DB constraint name when the fault came from the database. */
    readonly constraint?: string,
  ) {
    super(`${fault}:${detail}`);
    this.name = 'PersistenceError';
  }
}

// ---------------------------------------------------------------- identity (§5)

export interface DurableUserAccount {
  readonly userId: string;
  readonly status: string;
  /** scrypt record only. Never plaintext. */
  readonly passwordHash: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastLoginAt: number | null;
  readonly disabledReason: string | null;
  /** Login identifier → user_id index (may be several per user). */
  readonly identifier: string | null;
}

export interface DurableSession {
  readonly sessionId: string;
  readonly userId: string;
  /** sha256 of the bearer token. Raw tokens are never persisted. */
  readonly tokenHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly renewalCount: number;
  readonly lastRenewedAt: number | null;
}

export interface UserAccountRepository {
  findById(userId: string): Promise<DurableUserAccount | null>;
  findByIdentifier(identifier: string): Promise<DurableUserAccount | null>;
  insert(account: DurableUserAccount): Promise<void>;
  update(account: DurableUserAccount): Promise<void>;
}

export interface SessionRepository {
  insert(session: DurableSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<DurableSession | null>;
  findById(sessionId: string): Promise<DurableSession | null>;
  revoke(sessionId: string, at: number): Promise<void>;
  revokeAllForUser(userId: string, at: number): Promise<number>;
  listByUser(userId: string): Promise<readonly DurableSession[]>;
}

export interface AuthEventRepository {
  /** Append-only. There is intentionally no update or delete operation. */
  append(event: {
    eventId: string;
    eventType: string;
    userId: string | null;
    sessionId: string | null;
    occurredAt: number;
    outcome: string;
    metadata: string;
  }): Promise<void>;
  countByType(eventType: string): Promise<number>;
}

// ------------------------------------------------------- organization + seats (§6/§9)

export interface OrganizationRecord {
  readonly organizationId: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  readonly createdBy: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type OrgRole = 'OWNER' | 'ADMIN' | 'RESEARCHER' | 'VIEWER' | 'TRAINING_ADMIN' | 'INSTRUCTOR';
export type OrgMembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'PENDING';

export interface MembershipRecord {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: OrgRole;
  readonly status: OrgMembershipStatus;
  readonly seatId: string | null;
  readonly correlationId: string | null;
  readonly joinedAt: number;
  readonly updatedAt: number;
}

export interface SeatRecord {
  readonly seatId: string;
  readonly organizationId: string;
  readonly status: 'AVAILABLE' | 'ASSIGNED' | 'SUSPENDED' | 'REVOKED';
  readonly assignedUserId: string | null;
  readonly assignedAt: number | null;
  readonly correlationId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface OrganizationRepository {
  insert(org: OrganizationRecord): Promise<void>;
  findById(organizationId: string): Promise<OrganizationRecord | null>;
  update(org: OrganizationRecord): Promise<void>;
}

export interface MembershipRepository {
  /** UNIQUE (organization_id, user_id) — a repeat insert is a CONSTRAINT_VIOLATION. */
  insert(membership: MembershipRecord): Promise<void>;
  find(organizationId: string, userId: string): Promise<MembershipRecord | null>;
  listByOrganization(organizationId: string): Promise<readonly MembershipRecord[]>;
  listByUser(userId: string): Promise<readonly MembershipRecord[]>;
  update(membership: MembershipRecord): Promise<void>;
  remove(organizationId: string, userId: string): Promise<boolean>;
}

export interface SeatRepository {
  insert(seat: SeatRecord): Promise<void>;
  findById(seatId: string): Promise<SeatRecord | null>;
  listByOrganization(organizationId: string): Promise<readonly SeatRecord[]>;
  update(seat: SeatRecord): Promise<void>;
}

export interface SeatAllocationRequest {
  readonly organizationId: string;
  readonly userId: string;
  readonly purchasedSeats: number;
  readonly seatId: string;
  readonly correlationId: string | null;
  readonly at: number;
}

export interface SeatAllocationResult {
  readonly seat: SeatRecord;
  readonly allocated: number;
  readonly purchased: number;
}

/**
 * §9 The invariant `allocated <= purchased` and "one assigned seat per user" are enforced
 * inside ONE transaction. Concurrency therefore cannot produce purchased+1.
 */
export interface SeatAllocationPort {
  allocate(request: SeatAllocationRequest): Promise<SeatAllocationResult>;
  release(organizationId: string, seatId: string, at: number): Promise<boolean>;
  allocatedCount(organizationId: string): Promise<number>;
}

// --------------------------------------------------------- billing persistence (§10/§12)

export interface WebhookRecord {
  readonly provider: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly receivedAt: number;
  readonly verifiedAt: number | null;
  readonly processingStatus: 'RECEIVED' | 'VERIFIED' | 'PROCESSED' | 'FAILED' | 'DUPLICATE';
  readonly payloadHash: string;
  readonly processedAt: number | null;
  readonly failureReason: string | null;
  readonly correlationId: string | null;
}

export interface WebhookRepository {
  /**
   * UNIQUE (provider, event_id). Returns false when the event was already present, which is
   * how §12 idempotency is achieved: the caller applies business effects only on `true`.
   */
  insertOnce(record: WebhookRecord): Promise<boolean>;
  find(provider: string, eventId: string): Promise<WebhookRecord | null>;
  markProcessed(provider: string, eventId: string, at: number): Promise<void>;
  markFailed(provider: string, eventId: string, at: number, reason: string): Promise<void>;
  countByStatus(status: WebhookRecord['processingStatus']): Promise<number>;
}

export type CommercialEntryKind = 'INVOICE' | 'CHARGE' | 'REFUND' | 'CREDIT' | 'FEE' | 'TAX' | 'ADJUSTMENT' | 'SUBSCRIPTION_EVENT' | 'PAYMENT_EVENT';

export interface CommercialLedgerRow {
  readonly entryId: string;
  readonly eventId: string;
  readonly causationId: string | null;
  readonly subjectId: string;
  readonly organizationId: string | null;
  readonly kind: CommercialEntryKind;
  readonly amountMinor: number;
  readonly currency: string;
  readonly periodKey: string;
  readonly occurredAt: number;
  readonly provider: string | null;
  readonly correlationId: string | null;
  readonly metadata: string;
}

export interface CommercialLedgerRepository {
  /** UNIQUE event_id and UNIQUE causation_id → a replay can never double-account. */
  appendOnce(row: CommercialLedgerRow): Promise<boolean>;
  findByEventId(eventId: string): Promise<CommercialLedgerRow | null>;
  listBySubject(subjectId: string, limit: number): Promise<readonly CommercialLedgerRow[]>;
  /** Sum of amount_minor for a subject/period — the reconciliation input. */
  totalMinor(subjectId: string, periodKey: string): Promise<number>;
}

export interface SubscriptionRow {
  readonly subscriptionId: string;
  readonly subjectId: string;
  readonly subjectKind: 'USER' | 'ORGANIZATION';
  readonly organizationId: string | null;
  readonly planId: string;
  readonly status: string;
  readonly providerRef: string | null;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly cancelledAt: string | null;
  readonly gracePeriodEnd: string | null;
  readonly trialEndsAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubscriptionRepository {
  /** UNIQUE subject_id (0008). */
  upsert(row: SubscriptionRow): Promise<void>;
  findBySubject(subjectId: string): Promise<SubscriptionRow | null>;
  findByProviderRef(providerRef: string): Promise<SubscriptionRow | null>;
  /**
   * Compare-and-set on `version` (§13 optimistic concurrency): a stale writer affects 0 rows
   * and receives SERIALIZATION_CONFLICT instead of silently overwriting a newer state.
   */
  updateStatus(row: SubscriptionRow, expectedVersion: number): Promise<void>;
}

// ------------------------------------------------------------------ transaction (§13)

export interface TransactionRunner {
  /**
   * Runs `fn` inside a single database transaction. Every write that spans more than one
   * aggregate (seat + membership, webhook + ledger + subscription) MUST go through this.
   */
  run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export interface TransactionContext {
  readonly users: UserAccountRepository;
  readonly sessions: SessionRepository;
  readonly authEvents: AuthEventRepository;
  readonly organizations: OrganizationRepository;
  readonly memberships: MembershipRepository;
  readonly seats: SeatRepository;
  readonly webhooks: WebhookRepository;
  readonly ledger: CommercialLedgerRepository;
  readonly subscriptions: SubscriptionRepository;
}

/** Full durable store handed to business services. */
export interface BusinessPersistence {
  readonly tx: TransactionRunner;
  readonly repositories: TransactionContext;
}