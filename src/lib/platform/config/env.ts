/**
 * PLATFORM-05 — CONFIGURATION + ENVIRONMENT VALIDATION (§41/§42)
 *
 * Rules:
 *  - separate development / test / production profiles
 *  - NEVER hardcode a password, API key, secret, DB credential or session secret
 *  - missing critical configuration → EXPLICIT STARTUP FAILURE, never a silent fallback
 *
 * The loader is pure and takes an env record, so every rule is testable without
 * touching `process.env` or the real environment.
 */

export type Environment = 'development' | 'test' | 'production';

export interface PlatformConfig {
  readonly env: Environment;
  readonly nodeEnv: string;
  readonly port: number;
  readonly logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  /** Never serialised, never logged — presence is tracked instead. */
  readonly secrets: Readonly<Record<string, string>>;
  readonly secretPresence: Readonly<Record<string, boolean>>;
  readonly database: { readonly host: string | null; readonly user: string | null; readonly database: string | null };
  readonly features: { readonly aiProvider: 'gemini' | 'none'; readonly externalAuth: 'firebase' | 'none' };
}

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`CONFIG_INVALID:${issues.join(',')}`);
    this.name = 'ConfigError';
  }
}

export type EnvRecord = Record<string, string | undefined>;

const KNOWN_ENVIRONMENTS: readonly Environment[] = ['development', 'test', 'production'];

/** Secrets required in production. Development may run without them (documented gap). */
const PRODUCTION_REQUIRED_SECRETS: readonly string[] = ['GEMINI_API_KEY', 'SQL_PASSWORD'];

function requireString(env: EnvRecord, key: string, issues: string[]): string | null {
  const v = env[key];
  if (v === undefined || v.trim() === '') {
    issues.push(`missing:${key}`);
    return null;
  }
  return v;
}

/**
 * Validates and builds the platform config.
 * Throws ConfigError listing every problem (not just the first).
 */
export function loadConfig(env: EnvRecord = {}): PlatformConfig {
  const issues: string[] = [];
  const rawEnv = env.NODE_ENV?.trim() || 'development';
  if (!KNOWN_ENVIRONMENTS.includes(rawEnv as Environment)) {
    issues.push(`invalid:NODE_ENV=${rawEnv}`);
  }
  const environment = (KNOWN_ENVIRONMENTS.includes(rawEnv as Environment) ? rawEnv : 'development') as Environment;

  const portRaw = env.PORT?.trim();
  const port = portRaw ? Number(portRaw) : 3000;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) issues.push(`invalid:PORT=${portRaw}`);

  const logLevel = (env.LOG_LEVEL?.trim() || 'INFO') as PlatformConfig['logLevel'];
  if (!['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(logLevel)) issues.push(`invalid:LOG_LEVEL=${logLevel}`);

  const secretKeys = ['GEMINI_API_KEY', 'SQL_PASSWORD', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'SESSION_SECRET'];
  const secrets: Record<string, string> = {};
  const secretPresence: Record<string, boolean> = {};
  for (const key of secretKeys) {
    const value = env[key];
    const present = typeof value === 'string' && value.trim().length > 0;
    secretPresence[key] = present;
    if (present) secrets[key] = value!;
  }

  if (environment === 'production') {
    for (const key of PRODUCTION_REQUIRED_SECRETS) {
      if (!secretPresence[key]) issues.push(`missing_production_secret:${key}`);
    }
  }
  if (environment === 'production' && logLevel === 'DEBUG') {
    // DEBUG in production routinely leaks payloads into log storage.
    issues.push('invalid_production_log_level:DEBUG');
  }

  const database = {
    host: requireString(env, 'SQL_HOST', environment === 'production' ? issues : []) ?? null,
    user: requireString(env, 'SQL_USER', environment === 'production' ? issues : []) ?? null,
    database: requireString(env, 'SQL_DB_NAME', environment === 'production' ? issues : []) ?? null,
  };

  if (issues.length > 0) throw new ConfigError(issues);

  return {
    env: environment,
    nodeEnv: rawEnv,
    port,
    logLevel,
    secrets,
    secretPresence,
    database,
    features: {
      aiProvider: secretPresence.GEMINI_API_KEY ? 'gemini' : 'none',
      externalAuth: secretPresence.FIREBASE_SERVICE_ACCOUNT_JSON ? 'firebase' : 'none',
    },
  };
}

/**
 * Startup gate (§42). Returns the config on success; throws otherwise.
 * Call this before binding a port so a misconfigured deployment fails loudly.
 */
export function assertStartupReady(env: EnvRecord = {}): PlatformConfig {
  return loadConfig(env);
}

/** Safe view for logs/health output: presence only, never values. */
export function configPublicView(config: PlatformConfig): Record<string, unknown> {
  return {
    env: config.env,
    port: config.port,
    logLevel: config.logLevel,
    features: config.features,
    secretPresence: config.secretPresence,
    databaseConfigured: Boolean(config.database.host && config.database.user && config.database.database),
  };
}