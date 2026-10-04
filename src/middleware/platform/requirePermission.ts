/**
 * PLATFORM-02 — SERVER-SIDE ENFORCEMENT MIDDLEWARE
 *
 * §18: "Do not rely only on frontend route hiding. Authorization must be enforced
 * server-side." Every protected route goes through `requirePermission` /
 * `requireResource`, which resolve the principal from the request (never from a
 * client-supplied user id) and consult the AuthorizationService.
 */
import type { NextFunction, Request, Response } from 'express';
import type { AuthorizationService } from '../../lib/platform/authorization/authorizationService.ts';
import { deny, type AccessDecision, type Permission, type ResourceRef } from '../../lib/platform/authorization/types.ts';
import type { ResourceOperation } from '../../lib/platform/authorization/authorizationService.ts';
import type { RateLimiter } from '../../lib/platform/security/rateLimiter.ts';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the platform auth middleware; never trusted from client input. */
    platformPrincipal?: { userId: string; sessionId: string } | null;
  }
}

/** HTTP mapping: FORBIDDEN/NOT_AUTHENTICATED never leak which one applied internally. */
function send(res: Response, decision: AccessDecision): void {
  if (decision.code === 'NOT_AUTHENTICATED') {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.status(403).json({ error: 'forbidden' });
}

export function requirePrincipal(
  authenticate: (req: Request) => { userId: string; sessionId: string } | null,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.platformPrincipal = authenticate(req);
    next();
  };
}

export function requirePermission(input: {
  readonly authz: AuthorizationService;
  readonly permission: Permission;
  readonly workspaceIdFrom?: (req: Request) => string;
  readonly limiter?: RateLimiter;
  readonly bucket?: 'public' | 'auth' | 'expensive';
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const workspaceId = (input.workspaceIdFrom ?? (() => ''))(req);
    const decision = input.authz.authorize({
      userId: req.platformPrincipal?.userId ?? null,
      workspaceId,
      permission: input.permission,
    });
    if (!decision.allowed) {
      send(res, decision);
      return;
    }
    if (input.limiter && !input.limiter.allow(`perm:${input.permission}:${req.platformPrincipal?.userId ?? 'anon'}`, req, input.bucket ?? 'auth').allowed) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}

/** Resource-aware variant — this is the IDOR gate for object routes. */
export function requireResource(input: {
  readonly authz: AuthorizationService;
  readonly resource: (req: Request) => ResourceRef | null;
  readonly operation: ResourceOperation;
  readonly workspaceIdFrom?: (req: Request) => string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resource = input.resource(req);
    if (!resource) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const workspaceId = (input.workspaceIdFrom ?? (() => resource.workspaceId))(req);
    const decision = input.authz.authorizeResource({
      userId: req.platformPrincipal?.userId ?? null,
      workspaceId,
      resource,
      operation: input.operation,
    });
    if (!decision.allowed) {
      send(res, decision);
      return;
    }
    next();
  };
}

export { deny };