/**
 * BUSINESS-01 — ACTOR / SUBJECT SEAM
 * ===================================
 * The single place PLATFORM identity is converted into a commercial subject.
 *
 * Roadmap §04.1 / §04.7: "Reuse PLATFORM authorization architecture. Do NOT create a second
 * role system." The Business lane therefore imports the PLATFORM `Principal` type and
 * nothing else from the platform lane. It never re-implements authentication, never
 * re-validates a token, and never invents a role.
 *
 * Authorization remains a two-layer decision and both layers are explicit:
 *
 *   1. AUTHENTICATION  (PLATFORM) — is there a valid, unrevoked, unexpired session?
 *                                Answered by `Principal`.
 *   2. AUTHORIZATION   (BUSINESS) — may this principal act on this resource?
 *                                Answered by EntitlementEngine + resource ownership.
 *
 * A valid Principal is NEVER sufficient for authorization, and a commercial entitlement is
 * NEVER sufficient for authentication. The two are not interchangeable.
 */

import type { Principal } from '../platform/identity/types.ts';
import type { CommercialSubject } from './types.ts';

/** A principal that has been accepted for commercial evaluation. */
export interface BusinessActor {
  readonly subject: CommercialSubject;
  /** The PLATFORM status of the underlying account, carried for audit/fail-closed checks. */
  readonly platformUserStatus: 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'PENDING';
}

export type ActorRejection =
  | 'NO_PRINCIPAL'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_PENDING';

/**
 * Convert a PLATFORM Principal into a BusinessActor, or reject it.
 *
 * Fail closed: any doubt produces a rejection, never an actor. A DISABLED or LOCKED account
 * can hold a live subscription commercially (data exists) but must not be able to act.
 */
export function actorFromPrincipal(
  principal: Principal | null | undefined,
  platformUserStatus: BusinessActor['platformUserStatus'],
  nowMs: number,
  correlationId: string | null,
): { ok: true; actor: BusinessActor } | { ok: false; reason: ActorRejection } {
  if (!principal) return { ok: false, reason: 'NO_PRINCIPAL' };
  if (principal.expiresAt <= nowMs) return { ok: false, reason: 'SESSION_EXPIRED' };

  if (platformUserStatus === 'DISABLED') return { ok: false, reason: 'ACCOUNT_DISABLED' };
  if (platformUserStatus === 'LOCKED') return { ok: false, reason: 'ACCOUNT_LOCKED' };
  if (platformUserStatus === 'PENDING') return { ok: false, reason: 'ACCOUNT_PENDING' };

  return {
    ok: true,
    actor: {
      subject: {
        subjectId: principal.userId,
        kind: 'USER',
        organizationId: null,
        sessionId: principal.sessionId,
        correlationId,
      },
      platformUserStatus,
    },
  };
}

/**
 * An organization subject. Organization membership itself is authorized by
 * OrganizationEngine (BUSINESS-04); this constructor only shapes the commercial subject once
 * membership has already been proven.
 */
export function organizationSubject(input: {
  readonly organizationId: string;
  readonly sessionId: string | null;
  readonly correlationId: string | null;
}): CommercialSubject {
  return {
    subjectId: input.organizationId,
    kind: 'ORGANIZATION',
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    correlationId: input.correlationId,
  };
}

/** A subject that is not authenticated. Used only for explicit public/anonymous reads. */
export function anonymousSubject(correlationId: string | null): CommercialSubject {
  return {
    subjectId: 'anonymous',
    kind: 'USER',
    organizationId: null,
    sessionId: null,
    correlationId,
  };
}