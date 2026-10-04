import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { AuthorizationService } from '../../authorization/authorizationService.ts';
import { InMemoryMembershipStore, type ResourceRef } from '../../authorization/types.ts';
import { requirePrincipal, requireResource } from '../../../../middleware/platform/requirePermission.ts';

const WS = 'ws-1';
const WS_OTHER = 'ws-2';

let server: ReturnType<express.Express['listen']>;
let base = '';

beforeAll(async () => {
  const memberships = new InMemoryMembershipStore();
  const authz = new AuthorizationService(memberships);
  memberships.put({ userId: 'member-a', organizationId: 'org-1', workspaceId: WS, role: 'MEMBER' });
  memberships.put({ userId: 'admin-a', organizationId: 'org-1', workspaceId: WS, role: 'ADMIN' });
  memberships.put({ userId: 'member-b', organizationId: 'org-2', workspaceId: WS_OTHER, role: 'OWNER' });

  // Ownership registry: every journal/portfolio id belongs to a specific user+workspace.
  const owners: Record<string, ResourceRef> = {
    'j-a': { type: 'journal', id: 'j-a', workspaceId: WS, ownerUserId: 'member-a' },
    'j-b': { type: 'journal', id: 'j-b', workspaceId: WS, ownerUserId: 'member-b' },
    'j-other-ws': { type: 'journal', id: 'j-other-ws', workspaceId: WS_OTHER, ownerUserId: 'member-b' },
    'p-a': { type: 'portfolio', id: 'p-a', workspaceId: WS, ownerUserId: 'member-a' },
  };

  const app = express();
  app.use(express.json());
  // The principal comes from the session token, never from a client-supplied user id.
  app.use(requirePrincipal((req) => {
    const token = req.headers['x-test-user'];
    if (typeof token !== 'string' || token.length === 0) return null;
    return { userId: token, sessionId: `sess-${token}` };
  }));
  app.get(
    '/journal/:id',
    requireResource({
      authz,
      resource: (req) => owners[String(req.params.id)] ?? null,
      operation: 'read',
      workspaceIdFrom: (req) => String(req.headers['x-test-workspace'] ?? ''),
    }),
    (req, res) => res.json({ ok: true, id: req.params.id }),
  );
  app.post(
    '/journal/:id',
    requireResource({
      authz,
      resource: (req) => owners[String(req.params.id)] ?? null,
      operation: 'write',
      workspaceIdFrom: (req) => String(req.headers['x-test-workspace'] ?? ''),
    }),
    (req, res) => res.json({ ok: true, written: true }),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

async function call(method: 'GET' | 'POST', path: string, user?: string, workspace?: string) {
  const headers: Record<string, string> = {};
  if (user) headers['x-test-user'] = user;
  if (workspace) headers['x-test-workspace'] = workspace;
  const res = await fetch(`${base}${path}`, { method, headers });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

describe('§19 IDOR at the HTTP boundary', () => {
  it('owner may read their own journal', async () => {
    expect(await call('GET', '/journal/j-a', 'member-a', WS)).toMatchObject({ status: 200 });
  });

  it('user A reading user B journal is FORBIDDEN (403)', async () => {
    const res = await call('GET', '/journal/j-b', 'member-a', WS);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('ADMIN does not bypass personal-resource isolation', async () => {
    expect((await call('GET', '/journal/j-b', 'admin-a', WS)).status).toBe(403);
  });

  it('cross-workspace read is FORBIDDEN even for that workspace owner', async () => {
    expect((await call('GET', '/journal/j-other-ws', 'member-b', WS)).status).toBe(403);
  });

  it('unauthenticated is 401, not 403 (and never a data leak)', async () => {
    const res = await call('GET', '/journal/j-a', undefined, WS);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('missing resource is 404 with no ownership information', async () => {
    const res = await call('GET', '/journal/does-not-exist', 'member-a', WS);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('write is refused for a resource the caller cannot read', async () => {
    expect((await call('POST', '/journal/j-b', 'member-a', WS)).status).toBe(403);
    expect((await call('POST', '/journal/j-a', 'member-a', WS)).status).toBe(200);
  });

  it('non-member of the target workspace is 403', async () => {
    expect((await call('GET', '/journal/j-a', 'member-b', WS)).status).toBe(403);
  });
});