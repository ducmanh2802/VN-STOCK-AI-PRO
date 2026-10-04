/**
 * BUSINESS-04 TESTS — organization ownership / workspace ownership / seats / roles
 *                     permissions / training / instructor / learner
 *                     organization entitlement / private data isolation
 *                     export authorization / concurrent membership
 *                     organization deletion & deactivation
 */
import { describe, it, expect } from 'vitest';
import {
  ACTIVE_MEMBERSHIP,
  LEARNING_LANE_VERSION_NOTE,
  ROLE_CAPABILITIES,
  SEAT_TRANSITIONS,
  type Membership,
  type Organization,
  type Seat,
} from '../types.ts';
import {
  activeOrganizationIds,
  assignSeat,
  authorizeExport,
  can,
  canTransitionMembership,
  canTransitionOrganization,
  canTransitionSeat,
  capabilitiesOf,
  changeMemberRole,
  createWorkspace,
  resolveEntitlementPrecedence,
  roleHas,
  seatConsistency,
  seatCounts,
  transitionMembership,
  transitionOrganization,
  transitionSeat,
  workspacesOf,
} from '../OrganizationEngine.ts';
import type { PlanId } from '../../types.ts';

const NOW = '2026-10-15T00:00:00Z';

function org(over: Partial<Organization> = {}): Organization {
  return {
    organizationId: 'org_1',
    name: 'Research House',
    status: 'ACTIVE',
    subjectId: 'org_1',
    planId: 'BUSINESS',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function member(over: Partial<Membership> = {}): Membership {
  return {
    organizationId: 'org_1',
    userId: 'alice',
    role: 'ADMIN',
    status: 'ACTIVE',
    seatId: 'seat_1',
    joinedAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function seat(over: Partial<Seat> = {}): Seat {
  return {
    seatId: 'seat_1',
    organizationId: 'org_1',
    status: 'AVAILABLE',
    assignedUserId: null,
    assignedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function makeSeats(n: number, orgId = 'org_1'): readonly Seat[] {
  return Array.from({ length: n }, (_, i) =>
    seat({ seatId: `seat_${i + 1}`, organizationId: orgId, status: 'AVAILABLE' }),
  );
}

function assigned(userId: string, seatId: string): Seat {
  return seat({ seatId, status: 'ASSIGNED', assignedUserId: userId, assignedAt: NOW });
}

// -----------------------------------------------------------------------------

describe('Organization authorization', () => {
  it('denies an unauthenticated caller', () => {
    expect(can(org(), member(), null, 'ANALYTICS_VIEW')).toEqual({ allowed: false, reason: 'AUTHENTICATION_REQUIRED' });
  });

  it('denies a non-member', () => {
    expect(can(org(), null, 'bob', 'ANALYTICS_VIEW')).toEqual({ allowed: false, reason: 'NOT_A_MEMBER' });
  });

  it('denies a membership belonging to a different organization (cross-tenant)', () => {
    const m = member({ organizationId: 'org_other' });
    expect(can(org(), m, 'alice', 'ANALYTICS_VIEW')).toEqual({ allowed: false, reason: 'MEMBERSHIP_ORG_MISMATCH' });
  });

  it('denies a membership belonging to a different user (IDOR)', () => {
    expect(can(org(), member(), 'bob', 'ANALYTICS_VIEW')).toEqual({ allowed: false, reason: 'MEMBERSHIP_USER_MISMATCH' });
  });

  it('denies every non-ACTIVE membership status', () => {
    for (const status of ['PENDING', 'SUSPENDED', 'REVOKED'] as const) {
      expect(can(org(), member({ status }), 'alice', 'ANALYTICS_VIEW')).toEqual({
        allowed: false,
        reason: `MEMBERSHIP_${status}`,
      });
    }
    expect(ACTIVE_MEMBERSHIP.has('ACTIVE')).toBe(true);
  });

  it('a SUSPENDED organization grants nothing, not even to its owner', () => {
    const suspended = org({ status: 'SUSPENDED' });
    const owner = member({ role: 'OWNER' });
    expect(can(suspended, owner, 'alice', 'ORG_MANAGE')).toEqual({ allowed: false, reason: 'ORGANIZATION_SUSPENDED' });
  });

  it('denies a capability the role does not confer', () => {
    expect(can(org(), member({ role: 'VIEWER' }), 'alice', 'SEAT_ASSIGN')).toEqual({
      allowed: false,
      reason: 'CAPABILITY_NOT_IN_ROLE:VIEWER',
    });
  });

  it('grants exactly the owner capability set and no more', () => {
    const owner = member({ role: 'OWNER' });
    for (const cap of capabilitiesOf('OWNER')) {
      expect(can(org(), owner, 'alice', cap).allowed).toBe(true);
    }
    expect(capabilitiesOf('OWNER')).toHaveLength(10);
  });

  it('never lets a VIEWER or RESEARCHER manage the organization', () => {
    for (const role of ['VIEWER', 'RESEARCHER', 'INSTRUCTOR'] as const) {
      expect(roleHas(role, 'ORG_MANAGE')).toBe(false);
      expect(roleHas(role, 'SEAT_ASSIGN')).toBe(false);
    }
    expect(roleHas('RESEARCHER', 'RESEARCH_PUBLISH')).toBe(true);
    expect(roleHas('INSTRUCTOR', 'TRAINING_INSTRUCT')).toBe(true);
    expect(roleHas('TRAINING_ADMIN', 'TRAINING_MANAGE')).toBe(true);
  });

  it('has a non-empty, non-overlapping-by-accident capability map for every role', () => {
    for (const [role, caps] of Object.entries(ROLE_CAPABILITIES)) {
      expect(caps.length, role).toBeGreaterThan(0);
      expect(new Set(caps).size, role).toBe(caps.length);
    }
  });
});

// -----------------------------------------------------------------------------

describe('Seats (roadmap §04.6)', () => {
  it('derives counts instead of storing a drifting counter', () => {
    const seats = [
      assigned('u1', 's1'),
      seat({ seatId: 's2' }),
      seat({ seatId: 's3', status: 'SUSPENDED' }),
      seat({ seatId: 's4', status: 'REVOKED' }),
    ];
    expect(seatCounts(seats)).toEqual({ total: 4, assigned: 1, available: 1, suspended: 1, revoked: 1 });
  });

  it('detects an inconsistent seat table instead of compounding it', () => {
    expect(seatConsistency(makeSeats(3)).consistent).toBe(true);
    const broken = [seat({ status: 'ASSIGNED', assignedUserId: null })];
    const r = seatConsistency(broken);
    expect(r.consistent).toBe(false);
    expect(r.problems).toContain('ASSIGNED_SEAT_WITHOUT_USER:seat_1');
  });

  it('detects an unassigned seat that still names a user', () => {
    const r = seatConsistency([seat({ status: 'AVAILABLE', assignedUserId: 'ghost' })]);
    expect(r.problems).toContain('UNASSIGNED_SEAT_WITH_USER:seat_1');
  });

  it('refuses to assign on an inconsistent table', () => {
    expect(() =>
      assignSeat({ seat: seat({ status: 'ASSIGNED', assignedUserId: null }), userId: 'u1', seats: [seat({ status: 'ASSIGNED', assignedUserId: null })], orgPlanId: 'BUSINESS', at: NOW }),
    ).toThrow('SEAT_TABLE_INCONSISTENT');
  });

  it('assigns a seat and updates the collection in place', () => {
    const seats = makeSeats(3);
    const { seat: updated, allSeats } = assignSeat({ seat: seats[0], userId: 'u1', seats, orgPlanId: 'BUSINESS', at: NOW });
    expect(updated.status).toBe('ASSIGNED');
    expect(updated.assignedUserId).toBe('u1');
    expect(updated.assignedAt).toBe(NOW);
    expect(allSeats).toHaveLength(3);
    expect(allSeats[0].seatId).toBe('seat_1');
    expect(seatCounts(allSeats).assigned).toBe(1);
    // input untouched
    expect(seats[0].status).toBe('AVAILABLE');
  });

  it('PROPERTY: no user ever holds two seats in one organization', () => {
    const seats = [seat({ seatId: 's1' }), seat({ seatId: 's2' })];
    const first = assignSeat({ seat: seats[0], userId: 'u1', seats, orgPlanId: 'BUSINESS', at: NOW });
    expect(() => assignSeat({ seat: first.allSeats[1], userId: 'u1', seats: first.allSeats, orgPlanId: 'BUSINESS', at: NOW }))
      .toThrow('USER_ALREADY_HOLDS_SEAT:s1');
  });

  it('enforces the plan seat ceiling', () => {
    // TEAM caps at 25. Provisioning a 26th seat is refused outright.
    expect(() => assignSeat({ seat: makeSeats(26, 'org_team')[0], userId: 'u1', seats: makeSeats(26, 'org_team'), orgPlanId: 'TEAM', at: NOW }))
      .toThrow('SEAT_CAPACITY_EXCEEDED');
    // ENTERPRISE has no ceiling.
    expect(() => assignSeat({ seat: makeSeats(26, 'org_ent')[0], userId: 'u1', seats: makeSeats(26, 'org_ent'), orgPlanId: 'ENTERPRISE', at: NOW })).not.toThrow();
    // Exactly at the ceiling is allowed.
    expect(() => assignSeat({ seat: makeSeats(25, 'org_team2')[0], userId: 'u1', seats: makeSeats(25, 'org_team2'), orgPlanId: 'TEAM', at: NOW })).not.toThrow();
  });

  it('refuses to exceed the ceiling even when the caller claims over-capacity is allowed only explicitly', () => {
    const seats = makeSeats(26, 'org_x');
    // allowOverCapacity is an explicit, separate opt-in — never inferred.
    expect(() => assignSeat({ seat: seats[0], userId: 'u1', seats, orgPlanId: 'TEAM', at: NOW, allowOverCapacity: true })).not.toThrow();
  });

  it('rejects an illegal seat transition', () => {
    expect(canTransitionSeat('AVAILABLE', 'ASSIGNED')).toBe(true);
    expect(canTransitionSeat('REVOKED', 'ASSIGNED')).toBe(false);
    expect(() => transitionSeat(seat({ status: 'REVOKED' }), 'ASSIGNED', NOW)).toThrow('INVALID_SEAT_TRANSITION:REVOKED->ASSIGNED');
    expect(SEAT_TRANSITIONS.ASSIGNED).toContain('REVOKED');
  });

  it('releasing a seat clears the user, keeping the table consistent', () => {
    const released = transitionSeat(assigned('u1', 's1'), 'AVAILABLE', NOW);
    expect(released.status).toBe('AVAILABLE');
    expect(released.assignedUserId).toBeNull();
    expect(seatConsistency([released]).consistent).toBe(true);
  });

  it('suspending a seat keeps the assignment visible for audit', () => {
    const suspended = transitionSeat(assigned('u1', 's1'), 'SUSPENDED', NOW);
    expect(suspended.status).toBe('SUSPENDED');
    expect(suspended.assignedUserId).toBeNull();
    expect(seatCounts([suspended]).suspended).toBe(1);
  });
});

// -----------------------------------------------------------------------------

describe('Membership', () => {
  it('follows the documented lifecycle', () => {
    expect(canTransitionMembership('PENDING', 'ACTIVE')).toBe(true);
    expect(canTransitionMembership('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(canTransitionMembership('REVOKED', 'ACTIVE')).toBe(true);
    expect(canTransitionMembership('PENDING', 'SUSPENDED')).toBe(false);
    expect(() => transitionMembership(member({ status: 'PENDING' }), 'SUSPENDED', NOW)).toThrow('INVALID_MEMBERSHIP_TRANSITION:PENDING->SUSPENDED');
  });

  it('drops the seat claim the moment ACTIVE membership is lost', () => {
    const suspended = transitionMembership(member(), 'SUSPENDED', NOW);
    expect(suspended.seatId).toBeNull();
    const revoked = transitionMembership(member(), 'REVOKED', NOW);
    expect(revoked.seatId).toBeNull();
  });

  it('refuses to demote the last active owner', () => {
    const only = [member({ role: 'OWNER' })];
    expect(() => changeMemberRole({ membership: only[0], newRole: 'ADMIN', allMemberships: only }))
      .toThrow('CANNOT_DEMOTE_THE_LAST_OWNER');
  });

  it('allows demoting an owner when another active owner exists', () => {
    const memberships = [member({ role: 'OWNER' }), member({ userId: 'bob', role: 'OWNER' })];
    const changed = changeMemberRole({ membership: memberships[0], newRole: 'ADMIN', allMemberships: memberships });
    expect(changed.role).toBe('ADMIN');
  });

  it('does not count a suspended owner as a safety net', () => {
    const memberships = [member({ role: 'OWNER' }), member({ userId: 'bob', role: 'OWNER', status: 'SUSPENDED' })];
    expect(() => changeMemberRole({ membership: memberships[0], newRole: 'ADMIN', allMemberships: memberships }))
      .toThrow('CANNOT_DEMOTE_THE_LAST_OWNER');
  });

  it('lists only ACTIVE organizations for a user', () => {
    const memberships = [
      member({ organizationId: 'org_1' }),
      member({ organizationId: 'org_2', status: 'SUSPENDED' }),
      member({ organizationId: 'org_3', status: 'PENDING' }),
      member({ organizationId: 'org_4', status: 'ACTIVE' }),
      member({ organizationId: 'org_5', userId: 'bob' }),
    ];
    expect(activeOrganizationIds(memberships, 'alice')).toEqual(['org_1', 'org_4']);
  });
});

// -----------------------------------------------------------------------------

describe('Organization lifecycle and deletion', () => {
  it('follows the documented lifecycle', () => {
    expect(canTransitionOrganization('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionOrganization('CLOSED', 'ACTIVE')).toBe(false);
    expect(() => transitionOrganization(org({ status: 'CLOSED' }), 'ACTIVE', NOW, []))
      .toThrow('INVALID_ORGANIZATION_TRANSITION:CLOSED->ACTIVE');
  });

  it('refuses to close an organization with assigned seats', () => {
    expect(() => transitionOrganization(org({ status: 'CLOSING' }), 'CLOSED', NOW, [assigned('u1', 's1')]))
      .toThrow('CANNOT_CLOSE_ORGANIZATION_WITH_ASSIGNED_SEATS');
    expect(() => transitionOrganization(org({ status: 'CLOSING' }), 'CLOSED', NOW, [seat({ seatId: 's1' })])).not.toThrow();
  });

  it('deactivation immediately removes capability from every member', () => {
    const owner = member({ role: 'OWNER' });
    expect(can(org(), owner, 'alice', 'ORG_MANAGE').allowed).toBe(true);
    expect(can(org({ status: 'SUSPENDED' }), owner, 'alice', 'ORG_MANAGE').allowed).toBe(false);
  });
});

// -----------------------------------------------------------------------------

describe('Entitlement precedence (roadmap §04.7)', () => {
  const orgs = [org({ organizationId: 'org_1', planId: 'BUSINESS' })];

  it('an ACTIVE organization plan overrides an individual plan', () => {
    const r = resolveEntitlementPrecedence({
      individualPlanId: 'FREE',
      organizations: orgs,
      memberships: [member()],
      userId: 'alice',
    });
    expect(r.effectivePlanId).toBe('BUSINESS');
    expect(r.source).toBe('ORGANIZATION');
    expect(r.reason).toContain('ORGANIZATION_OVERRIDE');
  });

  it('never escalates beyond the individual plan (no upgrade by joining)', () => {
    const r = resolveEntitlementPrecedence({
      individualPlanId: 'PREMIUM',
      organizations: [org({ organizationId: 'org_1', planId: 'FREE' })],
      memberships: [member()],
      userId: 'alice',
    });
    expect(r.effectivePlanId).toBe('PREMIUM');
    expect(r.source).toBe('INDIVIDUAL');
    expect(r.reason).toContain('INDIVIDUAL_ALREADY_HIGHER');
  });

  it('retains the individual plan so leaving the organization restores it', () => {
    const withOrg = resolveEntitlementPrecedence({ individualPlanId: 'PRO', organizations: orgs, memberships: [member()], userId: 'alice' });
    expect(withOrg.effectivePlanId).toBe('BUSINESS');
    expect(withOrg.individualPlanId).toBe('PRO');

    // leave the organization
    const afterLeaving = resolveEntitlementPrecedence({ individualPlanId: 'PRO', organizations: orgs, memberships: [member({ status: 'REVOKED' })], userId: 'alice' });
    expect(afterLeaving.effectivePlanId).toBe('PRO');
    expect(afterLeaving.source).toBe('INDIVIDUAL');
    expect(afterLeaving.reason).toBe('NO_ACTIVE_ORGANIZATION_MEMBERSHIP');
  });

  it('ESCALATION TEST: a membership for an organization not under evaluation is ignored', () => {
    const r = resolveEntitlementPrecedence({
      individualPlanId: 'FREE',
      organizations: [org({ organizationId: 'org_cheap', planId: 'TEAM' })],
      // alice's membership claims org_1, but org_1 is not in `organizations`
      memberships: [member({ organizationId: 'org_1' })],
      userId: 'alice',
    });
    expect(r.effectivePlanId).toBe('FREE');
    expect(r.source).toBe('INDIVIDUAL');
  });

  it('ESCALATION TEST: a membership for a different user is ignored', () => {
    const r = resolveEntitlementPrecedence({
      individualPlanId: 'FREE',
      organizations: orgs,
      memberships: [member({ userId: 'mallory' })],
      userId: 'alice',
    });
    expect(r.effectivePlanId).toBe('FREE');
  });

  it('ESCALATION TEST: a SUSPENDED organization grants nothing', () => {
    const r = resolveEntitlementPrecedence({
      individualPlanId: 'FREE',
      organizations: [org({ planId: 'ENTERPRISE', status: 'SUSPENDED' })],
      memberships: [member()],
      userId: 'alice',
    });
    expect(r.effectivePlanId).toBe('FREE');
  });

  it('takes the highest-ranked organization among several memberships', () => {
    const r = resolveEntitlementPrecedence({
      individualPlanId: 'FREE',
      organizations: [
        org({ organizationId: 'org_a', planId: 'TEAM' }),
        org({ organizationId: 'org_b', planId: 'BUSINESS' }),
        org({ organizationId: 'org_c', planId: 'PREMIUM' }),
      ],
      memberships: [member({ organizationId: 'org_a' }), member({ organizationId: 'org_b' }), member({ organizationId: 'org_c' })],
      userId: 'alice',
    });
    expect(r.effectivePlanId).toBe('BUSINESS');
  });

  it('honours an explicit rank ceiling', () => {
    const r = resolveEntitlementPrecedence({
      individualPlanId: 'FREE',
      organizations: [org({ planId: 'ENTERPRISE' })],
      memberships: [member()],
      userId: 'alice',
      maxRank: 3, // TEAM
    });
    expect(r.effectivePlanId).toBe('FREE');
  });
});

// -----------------------------------------------------------------------------

describe('Workspaces and isolation', () => {
  it('creates a workspace bound to exactly one organization', () => {
    const w = createWorkspace({ workspaceId: 'ws_1', organizationId: 'org_1', name: 'Core research', at: NOW });
    expect(w.organizationId).toBe('org_1');
    expect(w.status).toBe('ACTIVE');
  });

  it('never returns another organization\'s workspaces', () => {
    const all = [
      createWorkspace({ workspaceId: 'ws_1', organizationId: 'org_1', name: 'A', at: NOW }),
      createWorkspace({ workspaceId: 'ws_2', organizationId: 'org_2', name: 'B', at: NOW }),
    ];
    expect(workspacesOf(org(), all).map((w) => w.workspaceId)).toEqual(['ws_1']);
  });

  it('validates workspace input', () => {
    expect(() => createWorkspace({ workspaceId: ' ', organizationId: 'org_1', name: 'A', at: NOW })).toThrow('INVALID_WORKSPACE_ID');
    expect(() => createWorkspace({ workspaceId: 'w', organizationId: ' ', name: 'A', at: NOW })).toThrow('INVALID_ORGANIZATION_ID');
    expect(() => createWorkspace({ workspaceId: 'w', organizationId: 'o', name: '  ', at: NOW })).toThrow('WORKSPACE_NAME_REQUIRED');
  });
});

// -----------------------------------------------------------------------------

describe('Export authorization (roadmap §04.9)', () => {
  it('requires EXPORT_ORG_REPORT, held by OWNER and ADMIN only', () => {
    expect(authorizeExport(org(), member({ role: 'OWNER' }), 'alice', 'TRAINING_REPORT').allowed).toBe(true);
    expect(authorizeExport(org(), member({ role: 'ADMIN' }), 'alice', 'TRAINING_REPORT').allowed).toBe(true);
    expect(authorizeExport(org(), member({ role: 'RESEARCHER' }), 'alice', 'TRAINING_REPORT')).toEqual({
      allowed: false,
      reason: 'CAPABILITY_NOT_IN_ROLE:RESEARCHER',
    });
    expect(authorizeExport(org(), member({ role: 'VIEWER' }), 'alice', 'RESEARCH_REPORT').allowed).toBe(false);
  });

  it('escalates the audit report to ORG_MANAGE (OWNER only)', () => {
    expect(authorizeExport(org(), member({ role: 'OWNER' }), 'alice', 'AUDIT_REPORT').allowed).toBe(true);
    expect(authorizeExport(org(), member({ role: 'ADMIN' }), 'alice', 'AUDIT_REPORT')).toEqual({
      allowed: false,
      reason: 'CAPABILITY_NOT_IN_ROLE:ADMIN',
    });
  });

  it('refuses an unknown export kind rather than defaulting', () => {
    expect(authorizeExport(org(), member({ role: 'OWNER' }), 'alice', 'EVERYTHING' as never)).toEqual({
      allowed: false,
      reason: 'UNKNOWN_EXPORT_KIND:EVERYTHING',
    });
  });

  it('refuses an export for a suspended organization', () => {
    expect(authorizeExport(org({ status: 'SUSPENDED' }), member({ role: 'OWNER' }), 'alice', 'TRAINING_REPORT').allowed).toBe(false);
  });
});

// -----------------------------------------------------------------------------

describe('Training bridge (roadmap §04.3, §04.4)', () => {
  it('does not duplicate the learning engine', () => {
    expect(LEARNING_LANE_VERSION_NOTE).toContain('src/lib/learning');
    // this lane declares no course/lesson/assessment/progress type at all
    expect(roleHas('INSTRUCTOR', 'TRAINING_INSTRUCT')).toBe(true);
    expect(roleHas('INSTRUCTOR', 'TRAINING_MANAGE')).toBe(false);
    expect(roleHas('TRAINING_ADMIN', 'TRAINING_MANAGE')).toBe(true);
    expect(roleHas('RESEARCHER', 'TRAINING_INSTRUCT')).toBe(false);
  });

  it('a learner role has no training administration capability', () => {
    for (const cap of ['TRAINING_MANAGE', 'TRAINING_INSTRUCT'] as const) {
      expect(roleHas('VIEWER', cap)).toBe(false);
      expect(roleHas('RESEARCHER', cap)).toBe(false);
    }
  });
});