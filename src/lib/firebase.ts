/**
 * Client-side Firebase bootstrap — ENVIRONMENT-ONLY configuration.
 *
 * The previous version imported '../../firebase-applet-config.json'. That file is
 * gitignored (it holds a deployment-local web API key), so it never exists in
 * Google AI Studio / CI / a fresh clone. The config now comes from VITE_* build
 * variables, which is the only mechanism that can safely reach a browser bundle.
 *
 * Per the no-secret rule: only the public web config values are read here. No
 * private key, service account, or admin credential is ever referenced from
 * client code.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

interface FirebaseWebConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

function readPublicConfig(): FirebaseWebConfig {
  const env = import.meta.env;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

/**
 * Why client auth is unavailable, or null when it is configured. Explicit state
 * instead of an import-time crash, so the SPA still boots and the UI can render
 * the reason rather than a blank screen.
 */
export function firebaseClientUnconfiguredReason(): string | null {
  const config = readPublicConfig();
  return config.apiKey && config.projectId
    ? null
    : 'VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID are not set; Firebase sign-in is unavailable.';
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function firebaseApp(): FirebaseApp {
  if (app) return app;
  const reason = firebaseClientUnconfiguredReason();
  if (reason) throw new Error(`FIREBASE_CLIENT_CONFIGURATION_REQUIRED: ${reason}`);
  app = initializeApp(readPublicConfig());
  return app;
}

export function firebaseAuth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(firebaseApp());
  return authInstance;
}

export const googleAuthProvider = new GoogleAuthProvider();

/**
 * NOTE: `auth` is intentionally resolved lazily through a getter-backed proxy so
 * that merely importing this module never throws in an unconfigured environment.
 * Callers keep the `auth.currentUser` / `onAuthStateChanged` surface they had.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    const instance = firebaseAuth() as unknown as Record<string | symbol, unknown>;
    const value = instance[prop as string];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  },
});
