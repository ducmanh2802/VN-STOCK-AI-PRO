/**
 * PLATFORM-01 — EXTERNAL IDENTITY ADAPTERS (provider boundary)
 *
 * The repo already verifies Firebase ID tokens in src/middleware/auth.ts. Platform
 * identity does NOT reimplement that; it defines the port so that:
 *   - existing Firebase users keep working unchanged (no duplicate identity model)
 *   - core identity logic stays deterministic and offline-testable
 *   - any future provider (OIDC/SAML) drops in without touching identity rules
 */
import type { UserStatus } from './types.ts';

export interface ExternalIdentity {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly disabled: boolean;
}

export interface TokenVerifier {
  readonly name: string;
  verify(idToken: string): Promise<ExternalIdentity | null>;
}

/** Test/dev double: token string → identity map. Never used in production wiring. */
export class StaticTokenVerifier implements TokenVerifier {
  readonly name = 'static-test-verifier';
  private readonly map = new Map<string, ExternalIdentity>();

  constructor(tokens: Record<string, ExternalIdentity> = {}) {
    for (const [t, id] of Object.entries(tokens)) this.map.set(t, id);
  }

  async verify(idToken: string): Promise<ExternalIdentity | null> {
    return this.map.get(idToken) ?? null;
  }
}

export function statusFromExternal(id: ExternalIdentity): UserStatus {
  return id.disabled ? 'DISABLED' : 'ACTIVE';
}