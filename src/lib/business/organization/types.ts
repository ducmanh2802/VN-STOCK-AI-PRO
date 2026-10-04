/**
 * BUSINESS-04 — ORGANIZATION / WORKSPACE DOMAIN TYPES
 * ====================================================
 * PHASE 0 §2.5 established that organization, workspace, team, member and seat do NOT exist
 * anywhere in this repository. They are created here.
 *
 * ROLE SYSTEM BOUNDARY (roadmap §04.1, §04.4)
 *   "Reuse PLATFORM authorization architecture. Do NOT create a second role system."
 *
 *   These types therefore define *commercial* scope and *seat* state, NOT authentication
 *   roles. An `OrgRole` answers "what may this person do inside this organization", which is
 *   a resource-scoping question. It does not answer "who is this person", which PLATFORM
 *   owns. Where a role implies a moderation capability, the business layer CONSUMES the
 *   PLATFORM decision rather than redefining it — see `resolveOrgCapabilities`.
 */

import type { PlanId } from '../types.ts';

// ============================================================================
// ORGANIZATION
// ============================================================================

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSING' | 'CLOSED';

export const ORGANIZATION_TRANSITIONS: Readonly<Record<OrganizationStatus, readonly OrganizationStatus[]>> =
  Object.freeze({
    ACTIVE: ['SUSPENDED', 'CLOSING'],
    SUSPENDED: ['ACTIVE', 'CLOSING'],
    CLOSING: ['CLOSED', 'ACTIVE'],
    CLOSED: [],
  });

export interface Organization {
  readonly organizationId: string;
  readonly name: string;
  readonly status: OrganizationStatus;
  /** The commercial subject for the whole organization. */
  readonly subjectId: string;
  readonly planId: PlanId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ============================================================================
// MEMBERSHIP (roadmap §04.1)
// ============================================================================

/**
 * Commercial roles. NOT a replacement for PLATFORM roles — this is the set of capabilities
 * that are meaningful inside one organization's resources.
 */
export type OrgRole = 'OWNER' | 'ADMIN' | 'RESEARCHER' | 'VIEWER' | 'TRAINING_ADMIN' | 'INSTRUCTOR';

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'PENDING';

export interface Membership {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: OrgRole;
  readonly status: MembershipStatus;
  readonly seatId: string | null;
  readonly joinedAt: string;
  readonly updatedAt: string;
}

/** Membership statuses that grant access. Everything else grants nothing. */
export const ACTIVE_MEMBERSHIP: ReadonlySet<MembershipStatus> = new Set<MembershipStatus>(['ACTIVE']);

// ============================================================================
// WORKSPACES
// ============================================================================

export interface Workspace {
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ============================================================================
// SEATS (roadmap §04.6)
// ============================================================================

export type SeatStatus = 'AVAILABLE' | 'ASSIGNED' | 'SUSPENDED' | 'REVOKED';

export const SEAT_TRANSITIONS: Readonly<Record<SeatStatus, readonly SeatStatus[]>> = Object.freeze({
  AVAILABLE: ['ASSIGNED', 'SUSPENDED'],
  ASSIGNED: ['SUSPENDED', 'REVOKED', 'AVAILABLE'],
  SUSPENDED: ['ASSIGNED', 'REVOKED', 'AVAILABLE'],
  REVOKED: ['AVAILABLE'],
});

export interface Seat {
  readonly seatId: string;
  readonly organizationId: string;
  readonly status: SeatStatus;
  readonly assignedUserId: string | null;
  readonly assignedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ============================================================================
// CAPABILITIES
// ============================================================================

/**
 * The capability set a role confers. This is a COMMERCIAL/RESOURCE capability map, and it is
 * consulted only after PLATFORM has established who the principal is.
 */
export type OrgCapability =
  | 'ORG_MANAGE'
  | 'MEMBER_INVITE'
  | 'MEMBER_REMOVE'
  | 'SEAT_ASSIGN'
  | 'WORKSPACE_CREATE'
  | 'RESEARCH_PUBLISH'
  | 'TRAINING_MANAGE'
  | 'TRAINING_INSTRUCT'
  | 'ANALYTICS_VIEW'
  | 'EXPORT_ORG_REPORT';

export const ROLE_CAPABILITIES: Readonly<Record<OrgRole, readonly OrgCapability[]>> = Object.freeze({
  OWNER: [
    'ORG_MANAGE', 'MEMBER_INVITE', 'MEMBER_REMOVE', 'SEAT_ASSIGN', 'WORKSPACE_CREATE',
    'RESEARCH_PUBLISH', 'TRAINING_MANAGE', 'TRAINING_INSTRUCT', 'ANALYTICS_VIEW', 'EXPORT_ORG_REPORT',
  ],
  ADMIN: [
    'MEMBER_INVITE', 'MEMBER_REMOVE', 'SEAT_ASSIGN', 'WORKSPACE_CREATE',
    'RESEARCH_PUBLISH', 'TRAINING_MANAGE', 'ANALYTICS_VIEW', 'EXPORT_ORG_REPORT',
  ],
  RESEARCHER: ['RESEARCH_PUBLISH', 'ANALYTICS_VIEW'],
  VIEWER: ['ANALYTICS_VIEW'],
  TRAINING_ADMIN: ['TRAINING_MANAGE', 'TRAINING_INSTRUCT', 'ANALYTICS_VIEW'],
  INSTRUCTOR: ['TRAINING_INSTRUCT', 'ANALYTICS_VIEW'],
});

// ============================================================================
// ENTITLEMENT PRECEDENCE (roadmap §04.7)
// ============================================================================

/**
 * The ONE place organization-vs-individual entitlement precedence is decided, and it is
 * explicit rather than accidental.
 *
 * Policy: an ORGANIZATION subscription OVERRIDES the individual's own plan, and the
 * individual plan is RETAINED for use after they leave the organization.
 *
 * Why override rather than union/intersection:
 *  - UNION would let a FREE individual keep FREE entitlements while holding a BUSINESS org
 *    seat — an organization paying for 50 seats would have no effect on what those users can
 *    actually do. That is commercially incoherent.
 *  - INTERSECTION would mean an organization cannot grant a capability its own plan does not
 *    include, so an organization could never lift a user above their personal tier — also
 *    commercially wrong.
 *
 * The override is one-directional (organization wins) and is evaluated ONLY for a subject the
 * viewer has ACTIVE membership in. A SUSPENDED or REVOKED member falls back to their
 * individual plan immediately, so a leaver loses organization entitlements on revocation
 * rather than at some later sweep.
 *
 * Both plans are always returned so the decision is auditable, and both are recorded.
 */
export interface EntitlementPrecedence {
  readonly effectivePlanId: PlanId;
  readonly source: 'ORGANIZATION' | 'INDIVIDUAL';
  readonly organizationPlanId: PlanId | null;
  readonly individualPlanId: PlanId;
  readonly membershipStatus: MembershipStatus | null;
  readonly reason: string;
}

// ============================================================================
// B2B ANALYTICS / EXPORT (roadmap §04.8, §04.9)
// ============================================================================

export type OrgMetric =
  | 'SEATS_ASSIGNED'
  | 'SEATS_AVAILABLE'
  | 'ACTIVE_MEMBERS'
  | 'RESEARCH_ARTIFACTS'
  | 'TRAINING_ENROLLMENTS'
  | 'TRAINING_COMPLETIONS';

/**
 * Organization analytics. Aggregate counts only.
 *
 * There is deliberately no per-user activity field here. Roadmap §04.8: "Do not expose
 * private user information beyond organization policy." A per-member activity feed belongs
 * behind an explicit, separately-authorized policy decision that does not exist yet; until it
 * does, the aggregate is the only thing the organization layer can see.
 */
export interface OrgAnalytics {
  readonly organizationId: string;
  readonly metrics: readonly { readonly metric: OrgMetric; readonly value: number }[];
  readonly computedAt: string;
}

export type OrgExportKind = 'TRAINING_REPORT' | 'COMPLETION_REPORT' | 'RESEARCH_REPORT' | 'ORG_ACTIVITY' | 'AUDIT_REPORT';

// ============================================================================
// TRAINING BRIDGE (roadmap §04.3, §04.4)
// ============================================================================

/**
 * Bridge to the existing LEARNING lane. This lane has NO courses, paths, lessons, exercises,
 * assessments or progress engine of its own — it references them by id and version only.
 * The LEARNING lane remains the single owner of learning content (roadmap §04.3: "Do not
 * duplicate Learning engines").
 */
export interface TrainingAssignment {
  readonly assignmentId: string;
  readonly organizationId: string;
  /** Path/course id owned by the LEARNING lane. */
  readonly learningPathId: string;
  readonly learningPathVersion: string;
  readonly assignedByUserId: string;
  readonly assignedAt: string;
}

export const LEARNING_LANE_VERSION_NOTE =
  'Learning content, progress and certification remain owned by src/lib/learning. The business lane references them by id and version and never duplicates the engine.';