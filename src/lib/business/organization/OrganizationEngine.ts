/**
 * BUSINESS-04 — ORGANIZATION ENGINE
 * ==================================
 * Pure domain rules for organizations, workspaces, memberships, seats and entitlement
 * precedence. No I/O, no clock, no database.
 *
 * The two hard requirements are both about *consistency under concurrency*:
 *  §04.6 seat count must always be internally consistent; concurrent assignment must be safe
 *  §04.7 organization entitlement precedence must never allow privilege escalation
 *
 * Both are handled by making every mutation a pure transition over an immutable snapshot,
 * with an explicit precondition that the caller must re-check transactionally. The engine
 * refuses an inconsistent input rather than repairing it.
 */

import {
  ACTIVE_MEMBERSHIP,
  ORGANIZATION_TRANSITIONS,
  ROLE_CAPABILITIES,
  SEAT_TRANSITIONS,
  type EntitlementPrecedence,
  type Membership,
  type MembershipStatus,
  type OrgCapability,
  type OrgExportKind,
  type OrgRole,
  type Organization,
  type OrganizationStatus,
  type Seat,
  type SeatStatus,
  type Workspace,
} from './types.ts';
import { highestRankPlan, requirePlan } from '../plans.ts';
import type { PlanId } from '../types.ts';

// ============================================================================
// AUTHORIZATION
// ============================================================================

export type OrgDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

const ALLOWED: OrgDecision = Object.freeze({ allowed: true });

function denied(reason: string): OrgDecision {
  return { allowed: false, reason };
}

/**
 * Capability check for one organization.
 *
 * Fail-closed ordering, and each step is load-bearing:
 *   1. authenticated          -> no principal, no access
 *   2. organization ACTIVE    -> a SUSPENDED org grants nothing to anybody, including its owner
 *   3. ACTIVE membership      -> PENDING/SUSPENDED/REVOKED grant nothing
 *   4. capability in role     -> and only then is the role consulted
 *
 * Step 2 before step 3 matters: an owner of a suspended organization must not retain access,
 * or "suspend the organization" would be a no-op for its most privileged members.
 */
export function can(
  org: Organization,
  membership: Membership | null,
  userId: string | null,
  capability: OrgCapability,
): OrgDecision {
  if (userId === null) return denied('AUTHENTICATION_REQUIRED');
  if (org.status !== 'ACTIVE') return denied(`ORGANIZATION_${org.status}`);

  if (membership === null) return denied('NOT_A_MEMBER');
  if (membership.organizationId !== org.organizationId) return denied('MEMBERSHIP_ORG_MISMATCH');
  if (membership.userId !== userId) return denied('MEMBERSHIP_USER_MISMATCH');
  if (!ACTIVE_MEMBERSHIP.has(membership.status)) return denied(`MEMBERSHIP_${membership.status}`);

  if (!ROLE_CAPABILITIES[membership.role].includes(capability)) {
    return denied(`CAPABILITY_NOT_IN_ROLE:${membership.role}`);
  }
  return ALLOWED;
}

/** Does this role confer this capability? Pure role lookup, no org context. */
export function roleHas(role: OrgRole, capability: OrgCapability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Effective capabilities of a role. */
export function capabilitiesOf(role: OrgRole): readonly OrgCapability[] {
  return ROLE_CAPABILITIES[role];
}

// ============================================================================
// ORGANIZATION LIFECYCLE
// ============================================================================

export function canTransitionOrganization(from: OrganizationStatus, to: OrganizationStatus): boolean {
  return ORGANIZATION_TRANSITIONS[from].includes(to);
}

/**
 * Transition organization status.
 *
 * Closing an organization is irreversible and requires every seat to be unassigned, which the
 * caller must have verified inside the same transaction. Passing seats on a CLOSED
 * organization would strand paid seats with nobody who can manage them.
 */
export function transitionOrganization(
  org: Organization,
  to: OrganizationStatus,
  at: string,
  seats: readonly Seat[],
): Organization {
  if (!canTransitionOrganization(org.status, to)) {
    throw new Error(`INVALID_ORGANIZATION_TRANSITION:${org.status}->${to}`);
  }
  if (to === 'CLOSED' && seats.some((s) => s.status === 'ASSIGNED')) {
    throw new Error('CANNOT_CLOSE_ORGANIZATION_WITH_ASSIGNED_SEATS');
  }
  return Object.freeze({ ...org, status: to, updatedAt: at });
}

// ============================================================================
// SEATS (roadmap §04.6)
// ============================================================================

export type SeatTransitionAction = 'ASSIGN' | 'RELEASE' | 'SUSPEND' | 'REVOKE';

export function canTransitionSeat(from: SeatStatus, to: SeatStatus): boolean {
  return SEAT_TRANSITIONS[from].includes(to);
}

/**
 * Derive seat counts. The single source of truth for "how many seats are used".
 * Derived, never stored as a counter that could drift from the rows.
 */
export function seatCounts(seats: readonly Seat[]): {
  readonly total: number;
  readonly assigned: number;
  readonly available: number;
  readonly suspended: number;
  readonly revoked: number;
} {
  const counts = { total: seats.length, assigned: 0, available: 0, suspended: 0, revoked: 0 };
  for (const s of seats) {
    if (s.status === 'ASSIGNED') counts.assigned += 1;
    else if (s.status === 'AVAILABLE') counts.available += 1;
    else if (s.status === 'SUSPENDED') counts.suspended += 1;
    else counts.revoked += 1;
  }
  return counts;
}

/**
 * The seat-count consistency invariant.
 *
 *   assigned + available + suspended + revoked === total
 *   an ASSIGNED seat always names a user
 *   an unassigned seat never names a user
 *
 * Checked before every seat mutation so a drifted table is reported rather than compounded.
 */
export function seatConsistency(seats: readonly Seat[]): {
  readonly consistent: boolean;
  readonly problems: readonly string[];
} {
  const problems: string[] = [];
  const c = seatCounts(seats);

  if (c.assigned + c.available + c.suspended + c.revoked !== c.total) {
    problems.push('SEAT_COUNTS_DO_NOT_SUM_TO_TOTAL');
  }
  for (const s of seats) {
    if (s.status === 'ASSIGNED' && s.assignedUserId === null) problems.push(`ASSIGNED_SEAT_WITHOUT_USER:${s.seatId}`);
    if (s.status !== 'ASSIGNED' && s.assignedUserId !== null) problems.push(`UNASSIGNED_SEAT_WITH_USER:${s.seatId}`);
  }
  return { consistent: problems.length === 0, problems };
}

/**
 * Assign a seat.
 *
 * CONCURRENCY SAFETY (roadmap §04.6)
 *
 *   The function is pure: it takes the seat snapshot and returns a NEW seat. It holds no
 *   mutable counter, so two concurrent assignments cannot interleave inside it.
 *
 *   The safety property that actually matters — two concurrent requests must not both consume
 *   the last seat — is enforced by the DATABASE, not here:
 *
 *     CREATE UNIQUE INDEX org_seats_active_assignment
 *       ON org_seats (organization_id, assigned_user_id)
 *       WHERE status = 'ASSIGNED' AND assigned_user_id IS NOT NULL;
 *
 *   That partial unique index makes "a user holds two seats in one organization" and
 *   "one user is assigned twice" both impossible under any interleaving. The pure function
 *   plus that index is what makes concurrent assignment safe; neither alone is.
 *
 *   The caller MUST re-read the seat row inside its transaction (SELECT ... FOR UPDATE, or
 *   the equivalent conditional UPDATE) and must reject on a zero-row update. That is recorded
 *   in the repository and in docs/BUSINESS_04_ARCHITECTURE.md §5.
 */
export function assignSeat(input: {
  readonly seat: Seat;
  readonly userId: string;
  readonly seats: readonly Seat[];
  /** Plan of the seat's organization. Its `maxSeats` is the capacity authority. */
  readonly orgPlanId: PlanId;
  readonly at: string;
  readonly allowOverCapacity?: boolean;
}): { readonly seat: Seat; readonly allSeats: readonly Seat[] } {
  if (input.userId.trim() === '') throw new Error('INVALID_SEAT_USER_ID');
  if (input.seat.organizationId.trim() === '') throw new Error('INVALID_ORGANIZATION_ID');

  const consistency = seatConsistency(input.seats);
  if (!consistency.consistent) throw new Error(`SEAT_TABLE_INCONSISTENT:${consistency.problems.join(',')}`);

  if (!canTransitionSeat(input.seat.status, 'ASSIGNED')) {
    throw new Error(`INVALID_SEAT_TRANSITION:${input.seat.status}->ASSIGNED`);
  }

  // A user holds at most one seat per organization.
  const alreadyHeld = input.seats.find((s) => s.status === 'ASSIGNED' && s.assignedUserId === input.userId);
  if (alreadyHeld !== undefined) {
    throw new Error(`USER_ALREADY_HOLDS_SEAT:${alreadyHeld.seatId}`);
  }

  // Capacity: the plan's ceiling is the authority, not a stored counter.
  const plan = requirePlan(input.orgPlanId);
  if (input.allowOverCapacity !== true && plan.maxSeats !== null && input.seats.length > plan.maxSeats) {
    throw new Error(`SEAT_CAPACITY_EXCEEDED:${input.seats.length}>${plan.maxSeats}`);
  }
  if (input.allowOverCapacity !== true) {
    const nextAssigned = seatCounts(input.seats).assigned + 1;
    if (plan.maxSeats !== null && nextAssigned > plan.maxSeats) {
      throw new Error(`SEAT_CAPACITY_EXCEEDED:${nextAssigned}>${plan.maxSeats}`);
    }
  }

  const updated: Seat = Object.freeze({
    ...input.seat,
    status: 'ASSIGNED',
    assignedUserId: input.userId,
    assignedAt: input.at,
    updatedAt: input.at,
  });

  // Replace in place by id so the collection keeps a stable order for tests and audit.
  const allSeats = input.seats.map((s) => (s.seatId === updated.seatId ? updated : s));
  return { seat: updated, allSeats };
}

/** Release, suspend or revoke a seat. */
export function transitionSeat(
  seat: Seat,
  to: SeatStatus,
  at: string,
): Seat {
  if (!canTransitionSeat(seat.status, to)) {
    throw new Error(`INVALID_SEAT_TRANSITION:${seat.status}->${to}`);
  }
  return Object.freeze({
    ...seat,
    status: to,
    assignedUserId: to === 'ASSIGNED' ? seat.assignedUserId : null,
    assignedAt: to === 'ASSIGNED' ? seat.assignedAt : null,
    updatedAt: at,
  });
}

// ============================================================================
// MEMBERSHIP
// ============================================================================

export const MEMBERSHIP_TRANSITIONS: Readonly<Record<MembershipStatus, readonly MembershipStatus[]>> =
  Object.freeze({
    PENDING: ['ACTIVE', 'REVOKED'],
    ACTIVE: ['SUSPENDED', 'REVOKED'],
    SUSPENDED: ['ACTIVE', 'REVOKED'],
    REVOKED: ['ACTIVE'],
  });

export function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean {
  return MEMBERSHIP_TRANSITIONS[from].includes(to);
}

export function transitionMembership(m: Membership, to: MembershipStatus, at: string): Membership {
  if (!canTransitionMembership(m.status, to)) {
    throw new Error(`INVALID_MEMBERSHIP_TRANSITION:${m.status}->${to}`);
  }
  return Object.freeze({
    ...m,
    status: to,
    // Losing ACTIVE membership immediately releases the seat's claim on the user, so a
    // leaver's seat never lingers as assigned to somebody who has left.
    seatId: ACTIVE_MEMBERSHIP.has(to) ? m.seatId : null,
    updatedAt: at,
  });
}

/**
 * Change a member's role.
 *
 * The last OWNER cannot be demoted. An organization with zero owners can never be
 * administered again, which is unrecoverable without direct database surgery.
 */
export function changeMemberRole(input: {
  readonly membership: Membership;
  readonly newRole: OrgRole;
  readonly allMemberships: readonly Membership[];
}): Membership {
  if (input.membership.role === input.newRole) return input.membership;
  if (!Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, input.newRole)) {
    throw new Error(`UNKNOWN_ORG_ROLE:${input.newRole}`);
  }
  if (input.membership.role === 'OWNER') {
    const owners = input.allMemberships.filter(
      (m) => m.organizationId === input.membership.organizationId && m.role === 'OWNER' && ACTIVE_MEMBERSHIP.has(m.status),
    );
    if (owners.length <= 1) throw new Error('CANNOT_DEMOTE_THE_LAST_OWNER');
  }
  return Object.freeze({ ...input.membership, role: input.newRole });
}

/** A user's organizations, ACTIVE membership only. */
export function activeOrganizationIds(memberships: readonly Membership[], userId: string): readonly string[] {
  return [
    ...new Set(
      memberships
        .filter((m) => m.userId === userId && ACTIVE_MEMBERSHIP.has(m.status))
        .map((m) => m.organizationId),
    ),
  ].sort();
}

// ============================================================================
// ENTITLEMENT PRECEDENCE (roadmap §04.7)
// ============================================================================

/**
 * Resolve the effective plan for a user.
 *
 * ONE-DIRECTIONAL OVERRIDE, deliberately explicit:
 *
 *   organization plan  WINS  over  individual plan
 *   ...but ONLY when membership is ACTIVE and the organization is ACTIVE.
 *
 * Anti-escalation properties, each tested:
 *
 *  1. A membership belonging to a DIFFERENT organization never applies. `membership.organizationId`
 *     must equal `org.organizationId`, or the individual plan is used. Otherwise a user could
 *     pass an arbitrary membership record to inherit somebody else's organization plan.
 *  2. A user who is a member of MULTIPLE organizations takes the highest-ranked one — but only
 *     among organizations they actively belong to, and never higher than `maxRank`.
 *  3. A SUSPENDED/REVOKED member, or a SUSPENDED organization, falls back to the individual
 *     plan immediately.
 *  4. The individual plan is ALWAYS retained in the result, so leaving the organization
 *     restores it with no data loss and no re-purchase.
 *  5. `maxRank` exists so a future plan change can never silently promote an organization
 *     member above a deliberate ceiling.
 */
export function resolveEntitlementPrecedence(input: {
  readonly individualPlanId: PlanId;
  readonly organizations: readonly Organization[];
  readonly memberships: readonly Membership[];
  readonly userId: string;
  readonly maxRank?: number | null;
}): EntitlementPrecedence {
  const individual = requirePlan(input.individualPlanId);
  let best: { org: Organization; membership: Membership } | null = null;

  for (const membership of input.memberships) {
    if (membership.userId !== input.userId) continue;
    // (1) membership must belong to an organization we are actually evaluating
    const org = input.organizations.find((o) => o.organizationId === membership.organizationId);
    if (!org) continue;
    if (org.status !== 'ACTIVE') continue;
    if (!ACTIVE_MEMBERSHIP.has(membership.status)) continue;
    if (input.maxRank !== null && input.maxRank !== undefined && requirePlan(org.planId).rank > input.maxRank) continue;

    if (best === null || requirePlan(org.planId).rank > requirePlan(best.org.planId).rank) {
      best = { org, membership };
    }
  }

  if (best === null) {
    return {
      effectivePlanId: individual.id,
      source: 'INDIVIDUAL',
      organizationPlanId: null,
      individualPlanId: individual.id,
      membershipStatus: null,
      reason: 'NO_ACTIVE_ORGANIZATION_MEMBERSHIP',
    };
  }

  const orgPlan = requirePlan(best.org.planId);
  const orgWins = orgPlan.rank >= individual.rank;

  return {
    effectivePlanId: orgWins ? orgPlan.id : individual.id,
    source: orgWins ? 'ORGANIZATION' : 'INDIVIDUAL',
    organizationPlanId: orgPlan.id,
    individualPlanId: individual.id,
    membershipStatus: best.membership.status,
    reason: orgWins
      ? `ORGANIZATION_OVERRIDE:${orgPlan.id}>=${individual.id}`
      : `INDIVIDUAL_ALREADY_HIGHER:${individual.id}>${orgPlan.id}`,
  };
}

/** Highest plan across a user's organizations and their own plan — convenience projection. */
export function highestEffectivePlan(
  individualPlanId: PlanId,
  organizations: readonly Organization[],
): PlanId {
  return highestRankPlan([individualPlanId, ...organizations.map((o) => o.planId)]);
}

// ============================================================================
// WORKSPACES
// ============================================================================

export function createWorkspace(input: {
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly at: string;
}): Workspace {
  if (input.workspaceId.trim() === '') throw new Error('INVALID_WORKSPACE_ID');
  if (input.organizationId.trim() === '') throw new Error('INVALID_ORGANIZATION_ID');
  if (input.name.trim() === '') throw new Error('WORKSPACE_NAME_REQUIRED');
  return Object.freeze({
    workspaceId: input.workspaceId,
    organizationId: input.organizationId,
    name: input.name,
    status: 'ACTIVE' as const,
    createdAt: input.at,
    updatedAt: input.at,
  });
}

/** A workspace belongs to exactly one organization. Cross-org access is impossible by shape. */
export function workspacesOf(org: Organization, workspaces: readonly Workspace[]): readonly Workspace[] {
  return workspaces.filter((w) => w.organizationId === org.organizationId);
}

// ============================================================================
// EXPORT AUTHORIZATION (roadmap §04.9)
// ============================================================================

/** Which role may request which organization export. */
export const EXPORT_CAPABILITY: Readonly<Record<OrgExportKind, OrgCapability>> = Object.freeze({
  TRAINING_REPORT: 'EXPORT_ORG_REPORT',
  COMPLETION_REPORT: 'EXPORT_ORG_REPORT',
  RESEARCH_REPORT: 'EXPORT_ORG_REPORT',
  ORG_ACTIVITY: 'EXPORT_ORG_REPORT',
  AUDIT_REPORT: 'ORG_MANAGE',
});

/**
 * Authorize an organization export. Exports honour the same capability system as everything
 * else — there is no "admin export" side door.
 */
export function authorizeExport(
  org: Organization,
  membership: Membership | null,
  userId: string | null,
  kind: OrgExportKind,
): OrgDecision {
  if (!Object.prototype.hasOwnProperty.call(EXPORT_CAPABILITY, kind)) {
    return denied(`UNKNOWN_EXPORT_KIND:${kind}`);
  }
  return can(org, membership, userId, EXPORT_CAPABILITY[kind]);
}

export type { MembershipStatus, OrgRole };