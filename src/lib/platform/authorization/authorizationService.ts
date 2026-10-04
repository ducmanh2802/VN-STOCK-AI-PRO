/**
 * PLATFORM-02 — AUTHORIZATION SERVICE (pure, no I/O)
 *
 * Three independent gates, all evaluated server-side:
 *   1. AUTHENTICATION  — is there a principal at all?
 *   2. ROLE            — does the role hold the required permission?
 *   3. SCOPE / OWNERSHIP — is the resource inside the caller's workspace, and (for
 *      personal resources) owned by the caller?  ← this is the IDOR gate (§19)
 *
 * A missing resource is reported as NOT_FOUND only when the caller could otherwise see
 * it; otherwise FORBIDDEN is returned so the API never confirms the existence of
 * another tenant's object.
 */
import {
  ALLOW,
  deny,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  type AccessDecision,
  type AccessScope,
  type MembershipStore,
  type Permission,
  type ResourceRef,
  type Role,
} from './types.ts';

/** Permission required per resource type for read and write operations. */
const RESOURCE_PERMISSIONS: Readonly<Record<string, { read: Permission; write: Permission }>> = {
  workspace: { read: 'workspace.read', write: 'workspace.write' },
  research: { read: 'research.read', write: 'research.write' },
  portfolio: { read: 'portfolio.read', write: 'portfolio.write' },
  decision: { read: 'decision.read', write: 'decision.write' },
  journal: { read: 'journal.read', write: 'journal.write' },
  scenario: { read: 'scenario.run', write: 'scenario.run' },
  paper_replay: { read: 'paper_replay.run', write: 'paper_replay.run' },
  learning: { read: 'learning.read', write: 'learning.write' },
  alert: { read: 'alert.read', write: 'alert.write' },
  audit: { read: 'audit.read', write: 'audit.read' },
};

export type ResourceOperation = 'read' | 'write';

export class AuthorizationService {
  constructor(private readonly memberships: MembershipStore) {}

  /** Resolves the caller's scope in a workspace, or null when they are not a member. */
  scopeFor(userId: string, workspaceId: string): AccessScope | null {
    return this.memberships.get({ userId, workspaceId });
  }

  /** Organization-wide authority (any workspace the org owns). */
  organizationScope(userId: string, organizationId: string): AccessScope | null {
    return this.memberships.listByUser(userId).find((s) => s.organizationId === organizationId) ?? null;
  }

  /**
   * §20 can(role, permission, operation, resource) with explicit scope checking.
   */
  authorize(input: {
    readonly userId: string | null;
    readonly workspaceId: string;
    readonly permission: Permission;
    readonly resource?: ResourceRef | null;
    readonly operation?: ResourceOperation;
  }): AccessDecision {
    if (!input.userId) return deny('NOT_AUTHENTICATED', 'no authenticated principal');

    const scope = this.scopeFor(input.userId, input.workspaceId);
    if (!scope) return deny('FORBIDDEN', 'not a member of this workspace');

    const granted = ROLE_PERMISSIONS[scope.role] ?? [];
    if (!granted.includes(input.permission)) {
      return deny('FORBIDDEN', `role ${scope.role} lacks ${input.permission}`);
    }

    if (input.resource) {
      // §19 IDOR: cross-workspace access is always FORBIDDEN.
      if (input.resource.workspaceId !== input.workspaceId) {
        return deny('FORBIDDEN', 'resource belongs to another workspace');
      }
      // Personal resources are readable only by their owner (admins included:
      // a role never grants access to another member's private journal/portfolio).
      if (input.resource.ownerUserId !== null && input.resource.ownerUserId !== input.userId) {
        return deny('FORBIDDEN', 'resource belongs to another user');
      }
    }

    return ALLOW;
  }

  /** Permission implied by a resource type + operation (used by the HTTP layer). */
  permissionFor(resourceType: keyof typeof RESOURCE_PERMISSIONS | string, operation: ResourceOperation): Permission | null {
    const row = RESOURCE_PERMISSIONS[resourceType];
    if (!row) return null;
    return operation === 'read' ? row.read : row.write;
  }

  authorizeResource(input: {
    readonly userId: string | null;
    readonly workspaceId: string;
    readonly resource: ResourceRef;
    readonly operation: ResourceOperation;
  }): AccessDecision {
    const permission = this.permissionFor(input.resource.type, input.operation);
    if (!permission) return deny('FORBIDDEN', `unknown resource type ${input.resource.type}`);
    return this.authorize({
      userId: input.userId,
      workspaceId: input.workspaceId,
      permission,
      resource: input.resource,
      operation: input.operation,
    });
  }

  /**
   * §20 privilege-escalation guard: a member may only grant roles strictly below their
   * own, and only holders of `admin.manage_workspace` may change roles at all.
   */
  assignRole(input: {
    readonly actorUserId: string | null;
    readonly workspaceId: string;
    readonly targetUserId: string;
    readonly role: Role;
    readonly organizationId?: string | null;
  }): AccessDecision {
    const actor = input.actorUserId ? this.scopeFor(input.actorUserId, input.workspaceId) : null;
    if (!actor) return deny('NOT_AUTHENTICATED', 'no authenticated principal');
    const actorPerms = ROLE_PERMISSIONS[actor.role] ?? [];
    if (!actorPerms.includes('admin.manage_workspace')) {
      return deny('FORBIDDEN', `role ${actor.role} cannot manage workspace roles`);
    }
    if (ROLE_RANK[input.role] >= ROLE_RANK[actor.role]) {
      return deny('FORBIDDEN', 'cannot grant a role at or above your own rank');
    }
    return ALLOW;
  }

  /** Applies a role assignment (call `assignRole` first — this method assumes authorization). */
  applyRole(scope: AccessScope): void {
    this.memberships.put(scope);
  }

  removeMember(userId: string, workspaceId: string): boolean {
    if (!this.memberships.get({ userId, workspaceId })) return false;
    this.memberships.remove(userId, workspaceId);
    return true;
  }

  /** Owner protection: a workspace always keeps at least one OWNER. */
  wouldOrphanOwners(userId: string, workspaceId: string): boolean {
    const members = this.memberships.listByWorkspace(workspaceId);
    const target = members.find((m) => m.userId === userId);
    if (!target || target.role !== 'OWNER') return false;
    return members.filter((m) => m.role === 'OWNER').length <= 1;
  }

  canRemoveMember(actorUserId: string | null, workspaceId: string, targetUserId: string): AccessDecision {
    const actor = actorUserId ? this.scopeFor(actorUserId, workspaceId) : null;
    if (!actor) return deny('NOT_AUTHENTICATED', 'no authenticated principal');
    const target = this.scopeFor(targetUserId, workspaceId);
    if (!target) return deny('NOT_FOUND', 'member not found');
    if (targetUserId === actorUserId) return deny('FORBIDDEN', 'self-removal is not permitted here');
    if (this.wouldOrphanOwners(targetUserId, workspaceId)) return deny('FORBIDDEN', 'workspace must retain an owner');
    return ALLOW;
  }

  membersOf(workspaceId: string): readonly AccessScope[] {
    return this.memberships.listByWorkspace(workspaceId);
  }

  workspacesFor(userId: string): readonly AccessScope[] {
    return this.memberships.listByUser(userId);
  }
}