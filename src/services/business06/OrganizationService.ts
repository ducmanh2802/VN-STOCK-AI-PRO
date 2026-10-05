/**
 * BUSINESS-06 — ORGANIZATION / MEMBERSHIP / SEAT SERVICE
 * =====================================================
 * Server-side organization boundary (§6) with transactional seat allocation (§9).
 *
 * Invariants enforced here and in the database:
 *   - a user belongs to an organization ONLY through a membership row
 *   - membership has an explicit role; role never implies ownership implicitly
 *   - cross-organization access is denied before any data is read
 *   - allocated seats <= purchased seats, enforced inside one transaction
 *
 * The BUSINESS-04 organization domain engine is reused for its role/status vocabulary; this
 * service owns only persistence and enforcement.
 */
import {
  PersistenceError,
  type MembershipRecord,
  type MembershipRepository,
  type OrganizationRecord,
  type OrganizationRepository,
  type OrgRole,
  type SeatAllocationPort,
  type SeatRecord,
  type SeatRepository,
  type TransactionContext,
  type TransactionRunner,
} from '../../lib/db/business06/contracts.ts';

const ACTIVE_ROLES: readonly OrgRole[] = ['OWNER', 'ADMIN', 'RESEARCHER', 'VIEWER', 'TRAINING_ADMIN', 'INSTRUCTOR'];

export interface MembershipWithRole {
  readonly membership: MembershipRecord;
  readonly organization: OrganizationRecord | null;
  readonly isOwner: boolean;
}

export type OrgFailure =
  | 'PERSISTENCE_UNAVAILABLE'
  | 'ORGANIZATION_NOT_FOUND'
  | 'NOT_A_MEMBER'
  | 'MEMBERSHIP_EXISTS'
  | 'ROLE_INSUFFICIENT'
  | 'CROSS_ORGANIZATION_DENIED'
  | 'SEAT_CAPACITY_EXHAUSTED'
  | 'LAST_OWNER_PROTECTED'
  | 'INVALID_INPUT';

export class OrganizationError extends Error {
  constructor(readonly failure: OrgFailure, message: string) {
    super(message);
    this.name = 'OrganizationError';
  }
}

/** Resource-scoping roles; explicit permission sets (no implicit ownership). */
const ROLE_PERMISSIONS: Readonly<Record<OrgRole, readonly string[]>> = {
  OWNER: ['org.read', 'org.write', 'org.delete', 'member.read', 'member.write', 'seat.write', 'billing.read', 'billing.write'],
  ADMIN: ['org.read', 'org.write', 'member.read', 'member.write', 'seat.write', 'billing.read'],
  RESEARCHER: ['org.read', 'member.read', 'research.write'],
  VIEWER: ['org.read', 'member.read'],
  TRAINING_ADMIN: ['org.read', 'member.read', 'training.write'],
  INSTRUCTOR: ['org.read', 'member.read', 'training.read'],
};

export interface OrgAuditEvent {
  readonly action: string;
  readonly actorUserId: string | null;
  readonly organizationId: string | null;
  readonly resourceId: string | null;
  readonly outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  readonly reason: string | null;
  readonly correlationId: string | null;
  readonly occurredAt: number;
  readonly beforeState: string | null;
  readonly afterState: string | null;
}

export type OrgAuditSink = (event: OrgAuditEvent) => void;

export class OrganizationService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly seatAllocation: SeatAllocationPort,
    private readonly audit: OrgAuditSink,
    private readonly now: () => number,
  ) {}

  private static permissionOf(role: OrgRole, permission: string): boolean {
    return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
  }

  /** §6 membership is the ONLY way into an organization; no implicit user→org link. */
  async requireMembership(
    repos: TransactionContext,
    organizationId: string,
    userId: string,
    permission?: string,
  ): Promise<MembershipWithRole> {
    const organization = await repos.organizations.findById(organizationId);
    if (!organization) throw new OrganizationError('ORGANIZATION_NOT_FOUND', 'organization does not exist');
    if (organization.status !== 'ACTIVE') {
      throw new OrganizationError('ORGANIZATION_NOT_FOUND', `organization is ${organization.status}`);
    }
    const membership = await repos.memberships.find(organizationId, userId);
    if (!membership) throw new OrganizationError('NOT_A_MEMBER', 'membership required');
    if (membership.status !== 'ACTIVE') throw new OrganizationError('NOT_A_MEMBER', `membership is ${membership.status}`);
    if (permission && !OrganizationService.permissionOf(membership.role, permission)) {
      throw new OrganizationError('ROLE_INSUFFICIENT', `${membership.role} lacks ${permission}`);
    }
    return { membership, organization, isOwner: membership.role === 'OWNER' };
  }

  async createOrganization(input: {
    organizationId: string;
    name: string;
    ownerUserId: string;
    correlationId: string | null;
    initialSeats: number;
  }): Promise<{ organization: OrganizationRecord; ownerMembership: MembershipRecord }> {
    if (!input.organizationId.trim() || !input.name.trim()) throw new OrganizationError('INVALID_INPUT', 'id and name required');
    if (!Number.isInteger(input.initialSeats) || input.initialSeats < 1) {
      throw new OrganizationError('INVALID_INPUT', 'initialSeats must be a positive integer');
    }
    const at = this.now();
    try {
      return await this.tx.run(async (repos) => {
        const organization: OrganizationRecord = {
          organizationId: input.organizationId,
          name: input.name.trim(),
          status: 'ACTIVE',
          createdBy: input.ownerUserId,
          createdAt: at,
          updatedAt: at,
        };
        await repos.organizations.insert(organization);

        // Seat rows exist up-front so capacity is explicit and auditable.
        for (let i = 0; i < input.initialSeats; i++) {
          await repos.seats.insert({
            seatId: `${input.organizationId}-seat-${i + 1}`,
            organizationId: input.organizationId,
            status: 'AVAILABLE',
            assignedUserId: null,
            assignedAt: null,
            correlationId: input.correlationId,
            createdAt: at,
            updatedAt: at,
          });
        }

        const ownerMembership: MembershipRecord = {
          organizationId: input.organizationId,
          userId: input.ownerUserId,
          role: 'OWNER',
          status: 'ACTIVE',
          seatId: `${input.organizationId}-seat-1`,
          correlationId: input.correlationId,
          joinedAt: at,
          updatedAt: at,
        };
        await repos.memberships.insert(ownerMembership);
        this.audit({
          action: 'organization.create',
          actorUserId: input.ownerUserId,
          organizationId: input.organizationId,
          resourceId: input.organizationId,
          outcome: 'SUCCESS',
          reason: null,
          correlationId: input.correlationId,
          occurredAt: at,
          beforeState: null,
          afterState: `ACTIVE seats=${input.initialSeats}`,
        });
        return { organization, ownerMembership };
      });
    } catch (e) {
      if (e instanceof PersistenceError) {
        this.audit({
          action: 'organization.create',
          actorUserId: input.ownerUserId,
          organizationId: input.organizationId,
          resourceId: input.organizationId,
          outcome: 'FAILURE',
          reason: e.fault,
          correlationId: input.correlationId,
          occurredAt: at,
          beforeState: null,
          afterState: null,
        });
        throw new OrganizationError('PERSISTENCE_UNAVAILABLE', e.detail);
      }
      throw e;
    }
  }

  async addMember(input: {
    organizationId: string;
    actorUserId: string;
    userId: string;
    role: OrgRole;
    correlationId: string | null;
  }): Promise<MembershipRecord> {
    if (!ACTIVE_ROLES.includes(input.role)) throw new OrganizationError('INVALID_INPUT', `unknown role ${input.role}`);
    const at = this.now();
    return this.tx.run(async (repos) => {
      await this.requireMembership(repos, input.organizationId, input.actorUserId, 'member.write');
      const existing = await repos.memberships.find(input.organizationId, input.userId);
      if (existing && existing.status !== 'REVOKED') {
        this.audit({
          action: 'membership.add',
          actorUserId: input.actorUserId,
          organizationId: input.organizationId,
          resourceId: input.userId,
          outcome: 'DENIED',
          reason: 'MEMBERSHIP_EXISTS',
          correlationId: input.correlationId,
          occurredAt: at,
          beforeState: existing.status,
          afterState: null,
        });
        throw new OrganizationError('MEMBERSHIP_EXISTS', 'membership already exists');
      }
      const membership: MembershipRecord = {
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        status: 'ACTIVE',
        seatId: existing?.seatId ?? null,
        correlationId: input.correlationId,
        joinedAt: at,
        updatedAt: at,
      };
      if (existing) await repos.memberships.update(membership);
      else await repos.memberships.insert(membership);
      this.audit({
        action: 'membership.add',
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        resourceId: input.userId,
        outcome: 'SUCCESS',
        reason: null,
        correlationId: input.correlationId,
        occurredAt: at,
        beforeState: existing?.status ?? null,
        afterState: `${membership.role}/${membership.status}`,
      });
      return membership;
    });
  }

  /**
   * §9 Seat allocation. `purchasedSeats` is the plan-derived capacity; the transaction
   * refuses when allocated would exceed it, so a concurrent double-allocation cannot produce
   * `purchased + 1`.
   */
  async allocateSeat(input: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
    seatId: string;
    purchasedSeats: number;
    correlationId: string | null;
  }): Promise<{ allocated: number; purchased: number; seatId: string }> {
    const at = this.now();
    return this.tx.run(async (repos) => {
      await this.requireMembership(repos, input.organizationId, input.actorUserId, 'seat.write');
      try {
        const result = await this.seatAllocation.allocate({
          organizationId: input.organizationId,
          userId: input.targetUserId,
          purchasedSeats: input.purchasedSeats,
          seatId: input.seatId,
          correlationId: input.correlationId,
          at,
        });
        this.audit({
          action: 'seat.allocate',
          actorUserId: input.actorUserId,
          organizationId: input.organizationId,
          resourceId: input.seatId,
          outcome: 'SUCCESS',
          reason: null,
          correlationId: input.correlationId,
          occurredAt: at,
          beforeState: `allocated=${result.allocated - 1}`,
          afterState: `allocated=${result.allocated}/${result.purchased}`,
        });
        return { allocated: result.allocated, purchased: result.purchased, seatId: result.seat.seatId };
      } catch (e) {
        if (e instanceof PersistenceError) {
          this.audit({
            action: 'seat.allocate',
            actorUserId: input.actorUserId,
            organizationId: input.organizationId,
            resourceId: input.seatId,
            outcome: 'DENIED',
            reason: e.constraint ?? e.fault,
            correlationId: input.correlationId,
            occurredAt: at,
            beforeState: null,
            afterState: null,
          });
          if (e.constraint === 'business_org_seats_capacity') {
            throw new OrganizationError('SEAT_CAPACITY_EXHAUSTED', 'purchased seats exhausted');
          }
          throw new OrganizationError('INVALID_INPUT', e.detail);
        }
        throw e;
      }
    });
  }

  async releaseSeat(input: {
    organizationId: string;
    actorUserId: string;
    seatId: string;
    correlationId: string | null;
  }): Promise<boolean> {
    const at = this.now();
    return this.tx.run(async (repos) => {
      await this.requireMembership(repos, input.organizationId, input.actorUserId, 'seat.write');
      const released = await this.seatAllocation.release(input.organizationId, input.seatId, at);
      this.audit({
        action: 'seat.release',
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        resourceId: input.seatId,
        outcome: released ? 'SUCCESS' : 'DENIED',
        reason: released ? null : 'NOT_ASSIGNED',
        correlationId: input.correlationId,
        occurredAt: at,
        beforeState: null,
        afterState: released ? 'AVAILABLE' : null,
      });
      return released;
    });
  }

  /** A workspace may never be left without an OWNER. */
  async changeRole(input: {
    organizationId: string;
    actorUserId: string;
    targetUserId: string;
    role: OrgRole;
    correlationId: string | null;
  }): Promise<MembershipRecord> {
    const at = this.now();
    return this.tx.run(async (repos) => {
      const actor = await this.requireMembership(repos, input.organizationId, input.actorUserId, 'member.write');
      if (!ACTIVE_ROLES.includes(input.role)) throw new OrganizationError('INVALID_INPUT', 'unknown role');
      const target = await repos.memberships.find(input.organizationId, input.targetUserId);
      if (!target) throw new OrganizationError('NOT_A_MEMBER', 'target is not a member');
      if (target.role === 'OWNER' && input.role !== 'OWNER') {
        const owners = (await repos.memberships.listByOrganization(input.organizationId)).filter((m) => m.role === 'OWNER' && m.status === 'ACTIVE');
        if (owners.length <= 1) {
          this.audit({
            action: 'membership.role_change',
            actorUserId: input.actorUserId,
            organizationId: input.organizationId,
            resourceId: input.targetUserId,
            outcome: 'DENIED',
            reason: 'LAST_OWNER_PROTECTED',
            correlationId: input.correlationId,
            occurredAt: at,
            beforeState: target.role,
            afterState: null,
          });
          throw new OrganizationError('LAST_OWNER_PROTECTED', 'an organization must retain an owner');
        }
      }
      const updated: MembershipRecord = { ...target, role: input.role, updatedAt: at };
      await repos.memberships.update(updated);
      this.audit({
        action: 'membership.role_change',
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        resourceId: input.targetUserId,
        outcome: 'SUCCESS',
        reason: null,
        correlationId: input.correlationId,
        occurredAt: at,
        beforeState: target.role,
        afterState: input.role,
      });
      void actor;
      return updated;
    });
  }

  /** §6/§19 cross-organization read: the caller must hold a membership in THAT organization. */
  async listMembers(input: { organizationId: string; actorUserId: string }): Promise<readonly MembershipRecord[]> {
    return this.tx.run(async (repos) => {
      await this.requireMembership(repos, input.organizationId, input.actorUserId, 'member.read');
      return repos.memberships.listByOrganization(input.organizationId);
    });
  }

  async removeMember(input: { organizationId: string; actorUserId: string; targetUserId: string }): Promise<boolean> {
    const at = this.now();
    return this.tx.run(async (repos) => {
      await this.requireMembership(repos, input.organizationId, input.actorUserId, 'member.write');
      const target = await repos.memberships.find(input.organizationId, input.targetUserId);
      if (!target) return false;
      if (target.role === 'OWNER') {
        const owners = (await repos.memberships.listByOrganization(input.organizationId)).filter((m) => m.role === 'OWNER' && m.status === 'ACTIVE');
        if (owners.length <= 1) throw new OrganizationError('LAST_OWNER_PROTECTED', 'an organization must retain an owner');
      }
      if (target.seatId) await this.seatAllocation.release(input.organizationId, target.seatId, at);
      return repos.memberships.remove(input.organizationId, input.targetUserId);
    });
  }

  async seatsOf(organizationId: string): Promise<readonly SeatRecord[]> {
    return this.tx.run((repos) => repos.seats.listByOrganization(organizationId));
  }

  async organizationsOf(userId: string): Promise<readonly string[]> {
    return this.tx.run(async (repos) => (await repos.memberships.listByUser(userId)).map((m) => m.organizationId));
  }
}

export { ROLE_PERMISSIONS as ORG_ROLE_PERMISSIONS };
export type { MembershipRepository, OrganizationRepository, SeatRepository };