/**
 * Server-side Firebase Admin bootstrap — ENVIRONMENT-ONLY configuration.
 *
 * Why this module exists in this shape
 * ------------------------------------
 * The previous version did `import firebaseConfig from '../../firebase-applet-config.json'`.
 * That file is deployment-local and gitignored, so it is absent in Google AI Studio,
 * in CI, and in any fresh clone. The single static import therefore broke THREE
 * independent entrypoints at once:
 *   - `tsx server.ts`      -> ERR_MODULE_NOT_FOUND (server could not boot at all)
 *   - `esbuild server.ts`  -> "Could not resolve" (production build failed)
 *   - `tsc --noEmit`       -> TS2307 (typecheck failed)
 *
 * Configuration is now resolved lazily from process.env so importing this module can
 * never throw. Auth is also never bypassed: an unconfigured deployment DENIES access.
 *
 *   configured    -> real ID-token verification (Application Default Credentials on Cloud Run)
 *   unconfigured  -> requireAuth answers 401 AUTH_CONFIGURATION_REQUIRED
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';

export type AdminAuthState =
  | { readonly status: 'READY'; readonly auth: Auth }
  | { readonly status: 'AUTH_CONFIGURATION_REQUIRED'; readonly reason: string };

/** Raised when token verification cannot be attempted because admin auth is unconfigured. */
export class AdminAuthUnavailableError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = 'AdminAuthUnavailableError';
    this.reason = reason;
  }
}

function resolveProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    undefined
  );
}

let cached: AdminAuthState | null = null;

/**
 * Resolve the admin auth state exactly once per process. Never throws: an
 * unconfigured or uninitialisable environment is reported as an explicit state.
 */
export function getAdminAuthState(): AdminAuthState {
  if (cached) return cached;

  const projectId = resolveProjectId();
  if (!projectId) {
    cached = {
      status: 'AUTH_CONFIGURATION_REQUIRED',
      reason:
        'FIREBASE_PROJECT_ID (or GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT) is not set. ' +
        'Set it and provide Application Default Credentials to enable Firebase ID-token verification.',
    };
    return cached;
  }

  try {
    if (!getApps().length) initializeApp({ projectId });
    cached = { status: 'READY', auth: getAuth() };
  } catch (error) {
    cached = {
      status: 'AUTH_CONFIGURATION_REQUIRED',
      reason: `Firebase Admin initialisation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  return cached;
}

/**
 * Narrow surface consumed by src/middleware/auth.ts. Deliberately not the raw
 * firebase-admin Auth instance so an unconfigured deployment surfaces as an
 * explicit 401 state instead of an opaque internal error.
 */
export const adminAuth = {
  async verifyIdToken(token: string): Promise<DecodedIdToken> {
    const state = getAdminAuthState();
    if (state.status !== 'READY') throw new AdminAuthUnavailableError(state.reason);
    return state.auth.verifyIdToken(token);
  },
};

/** Test seam: drop the memoised state so a test can re-resolve configuration. */
export function resetAdminAuthState(): void {
  cached = null;
}
