import { describe, expect, it } from 'vitest';
import { AuthorizationService } from '../authorizationService.ts';
import {
  ALL_PERMISSIONS,
  InMemoryMembershipStore,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  type Role,
} from '../types.ts';

const WS = 'ws-1';
const WS_OTHER = 'ws-2';

function seeded() {
  const store = new InMemoryMembershipStore();
  const authz = new AuthorizationService(store);
  store.put({ userId: 'owner', organizationId: 'org-1', workspaceId: WS, role: 'OWNER' });
  store.put({ userId: 'admin', organizationId: 'org-1', workspaceId: WS, role: 'ADMIN' });
  store.put({ userId: 'member', organizationId: 'org-1', workspaceId: WS, role: 'MEMBER' });
  store.put({ userId: 'viewer', organizationId: 'org-1', workspaceId: WS, role: 'VIEWER' });
  store.put({ userId: 'member', organizationId: 'org-2', workspaceId: WS_OTHER, role: 'OWNER' });
  return { store, authz };
}

const can = (authz: AuthorizationService, userId: string | null, permission: (typeof ALL_PERMISSIONS)[number], resource = null as any) =>
  authz.authorize({ userId, workspaceId: WS, permission, resource });

describe('§20 role matrix', () => {
  it('each role receives only its intended permissions', () => {
    const { authz } = seeded();
    // OWNER: everything
    for (const p of ALL_PERMISSIONS) expect(can(authz, 'owner', p).allowed).toBe(true);
    // ADMIN: everything except workspace.delete
    expect(can(authz, 'admin', 'admin.manage_users').allowed).toBe(true);
    expect(can(authz, 'admin', 'workspace.delete')).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    // MEMBER: writes product data, cannot administer or read audit
    expect(can(authz, 'member', 'journal.write').allowed).toBe(true);
    expect(can(authz, 'member', 'paper_replay.run').allowed).toBe(true);
    expect(can(authz, 'member', 'admin.manage_users').allowed).toBe(false);
    expect(can(authz, 'member', 'audit.read').allowed).toBe(false);
    // VIEWER: read-only, no writes at all
    for (const p of ALL_PERMISSIONS.filter((x) => x.endsWith('.write') || x.endsWith('.run'))) {
      expect(can(authz, 'viewer', p).allowed).toBe(false);
    }
    expect(can(authz, 'viewer', 'portfolio.read').allowed).toBe(true);
  });

  it('VIEWER holds no write/run permission in the matrix itself', () => {
    expect(ROLE_PERMISSIONS.VIEWER.some((p) => p.endsWith('.write') || p.endsWith('.run'))).toBe(false);
  });

  it('unauthenticated callers are rejected before any role check', () => {
    const { authz } = seeded();
    expect(can(authz, null, 'portfolio.read')).toMatchObject({ allowed: false, code: 'NOT_AUTHENTICATED' });
  });

  it('non-members are forbidden even with a valid identity', () => {
    const { authz } = seeded();
    expect(can(authz, 'stranger', 'portfolio.read')).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
  });
});

describe('§19 IDOR protection', () => {
  it('User A cannot read User B personal resources of every product type', () => {
    const { authz } = seeded();
    const types = ['journal', 'portfolio', 'research', 'decision', 'scenario', 'paper_replay', 'alert', 'learning'] as const;
    for (const type of types) {
      const ref = { type, id: `${type}-b`, workspaceId: WS, ownerUserId: 'member' };
      const decision = authz.authorizeResource({ userId: 'viewer', workspaceId: WS, resource: ref, operation: 'read' });
      expect(decision).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    }
  });

  it('even an ADMIN cannot read another member private journal (no silent escalation)', () => {
    const { authz } = seeded();
    const ref = { type: 'journal' as const, id: 'j-b', workspaceId: WS, ownerUserId: 'member' };
    expect(authz.authorizeResource({ userId: 'admin', workspaceId: WS, resource: ref, operation: 'read' })).toMatchObject({
      allowed: false,
      code: 'FORBIDDEN',
    });
  });

  it('the owner of a personal resource may read and write it', () => {
    const { authz } = seeded();
    const ref = { type: 'journal' as const, id: 'j-a', workspaceId: WS, ownerUserId: 'viewer' };
    expect(authz.authorizeResource({ userId: 'viewer', workspaceId: WS, resource: ref, operation: 'read' }).allowed).toBe(true);
  });

  it('cross-workspace access is always FORBIDDEN', () => {
    const { authz } = seeded();
    const ref = { type: 'portfolio' as const, id: 'p-1', workspaceId: WS_OTHER, ownerUserId: null };
    // `member` owns the OTHER workspace but is only a MEMBER here.
    expect(authz.authorizeResource({ userId: 'member', workspaceId: WS, resource: ref, operation: 'read' })).toMatchObject({
      allowed: false,
      code: 'FORBIDDEN',
    });
    // and the foreign OWNER cannot reach into the first workspace
    expect(authz.authorizeResource({ userId: 'member', workspaceId: WS_OTHER, resource: { ...ref, workspaceId: WS }, operation: 'read' })).toMatchObject({
      allowed: false,
      code: 'FORBIDDEN',
    });
  });

  it('workspace-level (non-personal) resources are readable by any member with the permission', () => {
    const { authz } = seeded();
    const ref = { type: 'research' as const, id: 'r-1', workspaceId: WS, ownerUserId: null };
    expect(authz.authorizeResource({ userId: 'member', workspaceId: WS, resource: ref, operation: 'read' }).allowed).toBe(true);
  });

  it('unknown resource types fail closed', () => {
    const { authz } = seeded();
    expect(authz.authorizeResource({ userId: 'owner', workspaceId: WS, resource: { type: 'ledger' as any, id: 'x', workspaceId: WS, ownerUserId: null }, operation: 'read' })).toMatchObject({
      allowed: false,
      code: 'FORBIDDEN',
    });
  });
});

describe('§20 privilege escalation', () => {
  it('only holders of admin.manage_workspace may assign roles', () => {
    const { authz } = seeded();
    expect(authz.assignRole({ actorUserId: 'member', workspaceId: WS, targetUserId: 'viewer', role: 'MEMBER' })).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    expect(authz.assignRole({ actorUserId: 'viewer', workspaceId: WS, targetUserId: 'viewer', role: 'MEMBER' }).allowed).toBe(false);
    expect(authz.assignRole({ actorUserId: 'admin', workspaceId: WS, targetUserId: 'viewer', role: 'MEMBER' }).allowed).toBe(true);
  });

  it('a role can never be granted at or above the granter rank', () => {
    const { authz } = seeded();
    expect(authz.assignRole({ actorUserId: 'admin', workspaceId: WS, targetUserId: 'viewer', role: 'ADMIN' })).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    expect(authz.assignRole({ actorUserId: 'admin', workspaceId: WS, targetUserId: 'viewer', role: 'OWNER' })).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    expect(authz.assignRole({ actorUserId: 'owner', workspaceId: WS, targetUserId: 'viewer', role: 'ADMIN' }).allowed).toBe(true);
    expect(ROLE_RANK.OWNER).toBeGreaterThan(ROLE_RANK.ADMIN);
  });

  it('a member of another workspace cannot change roles here', () => {
    const { authz } = seeded();
    expect(authz.assignRole({ actorUserId: 'member', workspaceId: WS, targetUserId: 'viewer', role: 'VIEWER' }).code).toBe('FORBIDDEN');
    expect(authz.assignRole({ actorUserId: null, workspaceId: WS, targetUserId: 'viewer', role: 'VIEWER' }).code).toBe('NOT_AUTHENTICATED');
  });
});

describe('§15 membership lifecycle', () => {
  it('a workspace must always retain an owner', () => {
    const { authz, store } = seeded();
    expect(authz.wouldOrphanOwners('owner', WS)).toBe(true);
    expect(authz.canRemoveMember('admin', WS, 'owner')).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    expect(authz.canRemoveMember('owner', WS, 'viewer').allowed).toBe(true);
    expect(authz.removeMember('viewer', WS)).toBe(true);
    expect(store.get({ userId: 'viewer', workspaceId: WS })).toBeNull();
    expect(authz.canRemoveMember('owner', WS, 'ghost')).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('personal (no organization) workspaces are supported', () => {
    const store = new InMemoryMembershipStore();
    const authz = new AuthorizationService(store);
    store.put({ userId: 'solo', organizationId: null, workspaceId: 'personal-solo', role: 'OWNER' });
    expect(authz.scopeFor('solo', 'personal-solo')).toMatchObject({ organizationId: null, role: 'OWNER' });
    expect(authz.authorize({ userId: 'solo', workspaceId: 'personal-solo', permission: 'journal.write' }).allowed).toBe(true);
    expect(authz.organizationScope('solo', 'org-1')).toBeNull();
  });

  it('lists memberships by user and by workspace', () => {
    const { authz } = seeded();
    expect(authz.workspacesFor('member').map((s) => s.workspaceId).sort()).toEqual([WS, WS_OTHER]);
    expect(authz.membersOf(WS)).toHaveLength(4);
  });
});

describe('determinism', () => {
  it('identical inputs → identical decisions', () => {
    const a = seeded();
    const b = seeded();
    for (const role of ['owner', 'admin', 'member', 'viewer'] as unknown as Role[]) {
      expect(a.authz.authorize({ userId: role, workspaceId: WS, permission: 'portfolio.write' }))
        .toEqual(b.authz.authorize({ userId: role, workspaceId: WS, permission: 'portfolio.write' }));
    }
  });
});