# PLATFORM-02 — AUTHORIZATION / ROLES / ORGANIZATIONS: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Discovery
No authorization layer existed: `requireAuth` proved *who* a caller was, nothing decided *what they
may do*. There were no roles, permissions, workspaces, organizations, or membership records, and no
IDOR tests. Existing product entities (journal, research, decisions, alerts, learning progress) have
**no ownership field**, so ownership is introduced by reference, never by duplicating them (§21).

## Architecture (three server-side gates)
```text
request
  → requirePrincipal()        WHO        (from the session token only, never a client-supplied id)
  → requirePermission()       CAN DO     (role → permission matrix)
  → requireResource()         TO WHICH   (resource type → permission)
                               IN WHICH SCOPE (workspace + personal owner)  ← IDOR gate
  → AuthorizationService (pure) + MembershipStore (port; in-memory now)
```
```text
User → Organization → Workspace → Resource (§15)
```
Personal workspaces are first-class: `organizationId: null` with a single OWNER.

## Role model (§16, minimal on purpose)
`OWNER` (all) · `ADMIN` (all except `workspace.delete`) · `MEMBER` (product read/write, run replay,
learning, alerts) · `VIEWER` (read-only — zero `.write`/`.run` permissions).

## Permission namespaces (§17, adapted to real repo features)
`workspace.*`, `research.*`, `portfolio.*`, `decision.*`, `journal.*`, `scenario.run`,
`paper_replay.run`, `learning.*`, `alert.*`, `admin.manage_users`, `admin.manage_workspace`,
`audit.read`.

## Security decisions
1. **Three independent gates.** A role never substitutes for scope, and scope never substitutes for
   the permission — all must pass.
2. **IDOR gate.** `resource.workspaceId !== callerWorkspace` ⇒ FORBIDDEN; and for personal resources
   `resource.ownerUserId !== callerUserId` ⇒ FORBIDDEN **even for ADMIN**. An administrator can manage
   a workspace but cannot read a member's private journal — that is the §19 requirement, not an
   oversight.
3. **Privilege escalation blocked twice**: role assignment requires `admin.manage_workspace`, and the
   granted role must rank strictly below the granter's (`ROLE_RANK`). A VIEWER can never grant VIEWER.
4. **No information leakage in the response**: unauthenticated → 401, forbidden/unknown → 403/404 with
   bodies that never reveal ownership, and a resource the caller may not see is never confirmed to
   exist.
5. **Owner invariant**: a workspace can never be left without an OWNER (`wouldOrphanOwners`).
6. **Fail closed**: unknown resource type ⇒ FORBIDDEN (a new feature is denied until its permission
   is declared explicitly).

## Known limitations
- Membership store is process-local (in-memory); durable tables come with the P05 migration work.
- No organization-level role templates or invitation flow yet; `organizationScope` exists for
  org-wide checks but no API routes use it yet.
- Authorization is enforced on platform routes; the pre-existing feature routers
  (`/api/trading`, `/api/macro`, `/api/stocks/**`) are NOT yet behind `requirePermission` — see the
  full audit for the tracked finding and its severity.