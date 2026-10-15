/// <reference types="vite/client" />

/**
 * Public, browser-visible build variables.
 *
 * Only non-secret Firebase *web* values belong here — a VITE_* variable is inlined
 * into the client bundle. Private keys, service accounts, database passwords and
 * GEMINI_API_KEY must stay server-side (see .env.example).
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
