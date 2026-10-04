/**
 * PLATFORM-02 — AUTHORIZATION TYPES (pure)
 *
 * §18 every protected resource answers: WHO / CAN / DO WHAT / TO WHICH RESOURCE / IN WHICH SCOPE.
 * §19 IDOR protection is a *server-side* decision — never a hidden UI element.
 */

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type Permission =
  | 'workspace.read'
  | 'workspace.write'
  | 'workspace.delete'
  | 'research.read'
  | 'research.write'
  | 'portfolio.read'
  | 'portfolio.write'
  | 'decision.read'
  | 'decision.write'
  | 'journal.read'
  | 'journal.write'
  | 'scenario.run'
  | 'paper_replay.run'
  | 'learning.read'
  | 'learning.write'
  | 'alert.read'
  | 'alert.write'
  | 'admin.manage_users'
  | 'admin.manage_workspace'
  | 'audit.read';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'workspace.read',
  'workspace.write',
  'workspace.delete',
  'research.read',
  'research.write',
  'portfolio.read',
  'portfolio.write',
  'decision.read',
  'decision.write',
  'journal.read',
  'journal.write',
  'scenario.run',
  'paper_replay.run',
  'learning.read',
  'learning.write',
  'alert.read',
  'alert.write',
  'admin.manage_users',
  'admin.manage_workspace',
  'audit.read',
];

/** §16 minimal role model — no role proliferation without a requirement. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((p) => p !== 'workspace.delete'),
  MEMBER: [
    'workspace.read',
    'research.read',
    'research.write',
    'portfolio.read',
    'portfolio.write',
    'decision.read',
    'decision.write',
    'journal.read',
    'journal.write',
    'scenario.run',
    'paper_replay.run',
    'learning.read',
    'learning.write',
    'alert.read',
    'alert.write',
  ],
  VIEWER: [
    'workspace.read',
    'research.read',
    'portfolio.read',
    'decision.read',
    'journal.read',
    'learning.read',
    'alert.read',
  ],
};

/** Role ordering used to block privilege escalation (a role may not exceed the granter's). */
export const ROLE_RANK: Readonly<Record<Role, number>> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };

/** §15 User → Organization → Workspace → Resources. */
export interface AccessScope {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly workspaceId: string;
  readonly role: Role;
}

export type ResourceType =
  | 'workspace'
  | 'research'
  | 'portfolio'
  | 'decision'
  | 'journal'
  | 'scenario'
  | 'paper_replay'
  | 'learning'
  | 'alert'
  | 'audit';

export interface ResourceRef {
  readonly type: ResourceType;
  readonly id: string;
  readonly workspaceId: string;
  /** Present for personal (non-shared) resources. */
  readonly ownerUserId: string | null;
}

export type AccessCode = 'OK' | 'NOT_AUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND';

export interface AccessDecision {
  readonly allowed: boolean;
  readonly code: AccessCode;
  readonly reason: string | null;
}

export const ALLOW: AccessDecision = { allowed: true, code: 'OK', reason: null };

export function deny(code: AccessCode, reason: string): AccessDecision {
  return { allowed: false, code, reason };
}

/** §21 ownership is introduced by reference; product entities are never duplicated. */
export interface MembershipStore {
  get(scope: { userId: string; workspaceId: string }): AccessScope | null;
  listByUser(userId: string): readonly AccessScope[];
  listByWorkspace(workspaceId: string): readonly AccessScope[];
  put(scope: AccessScope): void;
  remove(userId: string, workspaceId: string): void;
}

export class InMemoryMembershipStore implements MembershipStore {
  private readonly byKey = new Map<string, AccessScope>();

  private key(userId: string, workspaceId: string): string {
    return `${userId}::${workspaceId}`;
  }

  get(scope: { userId: string; workspaceId: string }): AccessScope | null {
    return this.byKey.get(this.key(scope.userId, scope.workspaceId)) ?? null;
  }

  listByUser(userId: string): readonly AccessScope[] {
    return [...this.byKey.values()].filter((s) => s.userId === userId);
  }

  listByWorkspace(workspaceId: string): readonly AccessScope[] {
    return [...this.byKey.values()].filter((s) => s.workspaceId === workspaceId);
  }

  put(scope: AccessScope): void {
    this.byKey.set(this.key(scope.userId, scope.workspaceId), scope);
  }

  remove(userId: string, workspaceId: string): void {
    this.byKey.delete(this.key(userId, workspaceId));
  }
}