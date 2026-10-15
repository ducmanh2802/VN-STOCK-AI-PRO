/**
 * PLATFORM-03 — SECRET REDACTION (§28/§43)
 *
 * Single chokepoint used by the audit log, the structured logger and error reporting.
 * Redaction is applied BEFORE persistence — secrets are never written and then hidden.
 *
 * Defence is layered: exact-key matching for known secret names, plus value-shape
 * detection for bearer/JWT/private-key material that could appear under any key.
 */

export const REDACTED = '[REDACTED]';

const SECRET_KEY_PATTERN =
  /(pass(word|wd)?|secret|token|api[-_]?key|apikey|authorization|auth[-_]?header|cookie|session[-_]?id|credential|private[-_]?key|bearer|refresh|access[-_]?token|client[-_]?secret|otp|mfa|pin)/i;

const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[A-Fa-f0-9]{64,}\b/g, // long hex (hashes/token hashes are fine to redact)
  /\b[A-Za-z0-9_-]{40,}\b/g, // long opaque secrets
];

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactString(value: string): string {
  let out = value;
  for (const re of SECRET_VALUE_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags), REDACTED);
  }
  return out;
}

/** Recursively redacts a metadata object. Keys are also truncated to bound record size. */
export function redact<T>(input: T, maxDepth = 6): T {
  const walk = (value: unknown, depth: number): unknown => {
    if (depth > maxDepth) return '[TRUNCATED]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return redactString(value.length > 2000 ? `${value.slice(0, 2000)}…` : value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 100).map((v) => walk(v, depth + 1));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
        out[k.slice(0, 128)] = isSecretKey(k) ? REDACTED : walk(v, depth + 1);
      }
      return out;
    }
    return '[UNSERIALIZABLE]';
  };
  return walk(input, 0) as T;
}