import type { Request, Response, NextFunction } from 'express';
import type { AuthorizationService, ResourceOperation } from '../../lib/platform/authorization/authorizationService.ts';
import type { Permission, ResourceRef } from '../../lib/platform/authorization/types.ts';

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId?: string;
  readonly organizationId?: string;
}

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal | null;
    }
  }
}

export type PrincipalResolver = (
  req: Request
) => AuthenticatedPrincipal | null | Promise<AuthenticatedPrincipal | null>;

export function requirePrincipal(resolver?: PrincipalResolver) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (resolver) {
      req.principal = await resolver(req);
    }
    next();
  };
}

export interface RequireResourceOptions {
  readonly authz: AuthorizationService;
  readonly resource: (req: Request) => ResourceRef | null | Promise<ResourceRef | null>;
  readonly operation: ResourceOperation;
  readonly workspaceIdFrom: (req: Request) => string;
}

export function requireResource(options: RequireResourceOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principal = req.principal;
    if (!principal || !principal.userId) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const resource = await options.resource(req);
    if (!resource) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const workspaceId = options.workspaceIdFrom(req);
    const decision = options.authz.authorizeResource({
      userId: principal.userId,
      workspaceId,
      resource,
      operation: options.operation,
    });

    if (!decision.allowed) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    next();
  };
}

export interface RequirePermissionOptions {
  readonly authz: AuthorizationService;
  readonly permission: Permission;
  readonly workspaceIdFrom: (req: Request) => string;
}

export function requirePermission(options: RequirePermissionOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principal = req.principal;
    if (!principal || !principal.userId) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const workspaceId = options.workspaceIdFrom(req);
    const decision = options.authz.authorize({
      userId: principal.userId,
      workspaceId,
      permission: options.permission,
    });

    if (!decision.allowed) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    next();
  };
}
