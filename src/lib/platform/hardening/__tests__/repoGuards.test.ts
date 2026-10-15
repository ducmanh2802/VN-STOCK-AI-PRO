import { describe, expect, it } from 'vitest';
import { auditMigrations, scanForSecrets, SECRET_PATTERNS } from '../repoGuards.ts';

function report(findings: readonly { file: string; pattern: string; line: number }[]): string {
  return findings.map((f) => `${f.file}:${f.line} [${f.pattern}]`).join('\n');
}

/**
 * §43 Secrets must not appear in Git / logs / API responses / bundles.
 * Scans the source tree and the build output. Failures here are P0 by definition.
 */
describe('§43 secret leakage scan', () => {
  it('finds no committed credential material in src, server.ts or drizzle', () => {
    const findings = scanForSecrets(['src', 'server.ts', 'drizzle', 'scripts', 'firebase-applet-config.json']);
    expect(report(findings)).toBe('');
  });

  it('finds no credential material in build output when a build exists', () => {
    const findings = scanForSecrets(['dist']);
    expect(report(findings)).toBe('');
  });

  it('detects every credential shape it claims to detect', () => {
    // Sample strings are assembled at runtime so this test file does not itself
    // contain literal credential shapes (the scanner scans test files too).
    const samples: Array<[string, string]> = [
      ['private-key-block', `-----BEGIN ${'RSA'} PRIVATE KEY-----`],
      ['google-api-key', `const k = "${'AIza'}SyD-1234567890abcdefghijklmnopqrstu";`],
      ['openai-style-key', `const k = "${'sk-'}abcdefghijklmnopqrstuvwx";`],
      ['aws-access-key', `const id = "${'AKIA'}IOSFODNN7EXAMPLE";`],
      ['postgres-uri-with-password', `const url = '${'postgres'}://user:${'sup3rsecret'}@localhost:5432/db';`],
      ['jwt-literal', `const t = "${'eyJ'}hbGciOiJIUzI1NiJ9.${'eyJ'}zdWIiOiIxMjM0NTY3ODkwIn0.${'doz'}jgNryP4J3jVmNHl0w5N"`],
      ['hardcoded-password-assignment', `const ${'password'} = '${'hunter2000'}';`],
      ['hardcoded-api-key-assignment', `const ${'apiKey'} = '${'abcdef1234567890'}';`],
    ];
    for (const [pattern, line] of samples) {
      const hit = SECRET_PATTERNS.find((p) => p.name === pattern)!.re.test(line);
      expect(hit, `${pattern} should be detected`).toBe(true);
    }
  });

  it('does not flag ordinary code that merely mentions config keys', () => {
    const benign = [
      "const apiKey = process.env.GEMINI_API_KEY ?? '';",
      "if (!config.database.password) throw new Error('missing');",
      "// never log the password field",
      "res.json({ error: 'unauthorized' });",
    ];
    for (const line of benign) {
      const hit = SECRET_PATTERNS.some((p) => p.re.test(line));
      expect(hit, `should not flag: ${line}`).toBe(false);
    }
  });
});

/** §44 migration ordering / ownership / production safety. */
describe('§44 migration safety', () => {
  const report = auditMigrations();

  it('migration files exist and are numbered sequentially from 0000', () => {
    expect(report.files.length).toBeGreaterThan(0);
    expect(report.ordered).toBe(true);
    expect(report.duplicates).toEqual([]);
    expect(report.gaps).toEqual([]);
  });

  it('no migration is destructive (no DROP TABLE / TRUNCATE / DELETE FROM / DROP COLUMN)', () => {
    expect(report.destructive).toEqual([]);
  });

  it('the platform identity migration is present and additive', () => {
    expect(report.files).toContain('0007_platform_identity.sql');
  });
});