/**
 * PLATFORM-05 — SECRET LEAKAGE SCAN (§43) + MIGRATION SAFETY (§44)
 *
 * These are executable guards rather than prose: they fail the build if a credential
 * is committed, or if a migration is renumbered/destructive.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.sql', '.md', '.yml', '.yaml', '.env', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite', '.next']);

/** Credential shapes that must never be committed. */
export const SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'openai-style-key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'postgres-uri-with-password', re: /postgres(ql)?:\/\/[^\s:@/]+:[^\s:@/]+@/i },
  { name: 'jwt-literal', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'hardcoded-password-assignment', re: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/i },
  { name: 'hardcoded-api-key-assignment', re: /(?:api[_-]?key|apikey|secret)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]/i },
  { name: 'service-account-private-key', re: /"private_key"\s*:\s*"/ },
  { name: 'service-account-type', re: /"type"\s*:\s*"service_account"/ },
];

export interface Finding {
  readonly file: string;
  readonly pattern: string;
  readonly line: number;
  readonly excerpt: string;
}

/**
 * Patterns that only ever appear as synthetic fixtures inside test files. A test that
 * asserts "this password is never logged" must contain a fake password; that is not a
 * credential leak. Real secret shapes (private keys, JWTs, service accounts) are NEVER
 * allowlisted by path.
 */
const TEST_FIXTURE_ONLY: ReadonlySet<string> = new Set([
  'hardcoded-password-assignment',
  'hardcoded-api-key-assignment',
]);

/**
 * `AIza…` is a Firebase **Web** API key: by Firebase's design it identifies the project in
 * client bundles and is not an authorization credential (the Admin SDK authenticates with
 * service-account credentials, never with this key). It is therefore allowlisted ONLY in
 * the deployment-local Firebase web config and the bundle that imports it — while service
 * account keys and private keys remain hard failures. The file itself is gitignored.
 */
const PUBLIC_FIREBASE_WEB_KEY_PATTERNS: ReadonlySet<string> = new Set(['google-api-key']);

function isTestFixture(file: string): boolean {
  return file.includes('__tests__') || file.endsWith('.test.ts') || file.endsWith('.test.tsx');
}

function isFirebaseWebConfigPath(file: string): boolean {
  return file.endsWith('firebase-applet-config.json') || file.endsWith('firebase-applet-config.example.json') || file.startsWith('dist/');
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

/** Scans tracked source + build output for committed credential material. */
export function scanForSecrets(targets: readonly string[]): readonly Finding[] {
  const findings: Finding[] = [];
  for (const target of targets) {
    const abs = path.isAbsolute(target) ? target : path.join(ROOT, target);
    let files: string[];
    try {
      files = statSync(abs).isDirectory() ? walk(abs) : [abs];
    } catch {
      continue;
    }
    for (const file of files) {
      const ext = path.extname(file) || path.basename(file);
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const relPath = path.relative(ROOT, file).replace(/\\/g, '/');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        for (const { name, re } of SECRET_PATTERNS) {
          if (!re.test(lines[i]!)) continue;
          if (TEST_FIXTURE_ONLY.has(name) && isTestFixture(relPath)) continue;
          if (PUBLIC_FIREBASE_WEB_KEY_PATTERNS.has(name) && isFirebaseWebConfigPath(relPath)) continue;
          // In the Firebase web config / its bundle, an `apiKey:` assignment is allowed
          // only when the value is literally a Firebase Web key (AIza…); any other
          // credential assigned to apiKey still fails.
          if (
            name === 'hardcoded-api-key-assignment' &&
            isFirebaseWebConfigPath(relPath) &&
            /api[_-]?key\s*[:=]\s*['"]AIza/i.test(lines[i]!)
          ) {
            continue;
          }
          findings.push({
            file: relPath,
            pattern: name,
            line: i + 1,
            // Never echo the secret itself into a report.
            excerpt: lines[i]!.slice(0, 60).replace(/['"][^'"]{6,}['"]/g, '"[REDACTED]"'),
          });
        }
      }
    }
  }
  return findings;
}

export interface MigrationReport {
  readonly files: readonly string[];
  readonly ordered: boolean;
  readonly duplicates: readonly string[];
  readonly gaps: readonly string[];
  readonly destructive: ReadonlyArray<{ file: string; statement: string }>;
}

/** §44 migration safety: sequential IDs, no gaps/duplicates, additive-only changes. */
export function auditMigrations(dir = path.join(ROOT, 'drizzle')): MigrationReport {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return { files: [], ordered: true, duplicates: [], gaps: [], destructive: [] };
  }
  const ids = files.map((f) => f.slice(0, 4));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  let ordered = true;
  const gaps: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (Number(ids[i]) !== i) ordered = false;
    if (i > 0 && Number(ids[i]) !== Number(ids[i - 1]) + 1) gaps.push(`${ids[i - 1]}→${ids[i]}`);
  }
  const destructive: Array<{ file: string; statement: string }> = [];
  for (const f of files) {
    const content = readFileSync(path.join(dir, f), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const upper = line.toUpperCase();
      if (/\bDROP\s+TABLE\b/.test(upper) || /\bTRUNCATE\b/.test(upper) || /\bDELETE\s+FROM\b/.test(upper)) {
        destructive.push({ file: f, statement: line.trim().slice(0, 80) });
      }
      if (/^\s*ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN/i.test(line)) {
        destructive.push({ file: f, statement: line.trim().slice(0, 80) });
      }
    }
  }
  return { files, ordered, duplicates, gaps, destructive };
}