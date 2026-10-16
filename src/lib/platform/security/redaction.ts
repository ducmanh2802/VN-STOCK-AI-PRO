export const REDACTED = '[REDACTED]';

const SECRET_KEY_PATTERN = /password|token|secret|authorization|api_?key|apikey|cookie|private_?key|credential|session_?id/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

const JWT_PATTERN = /Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redactString(str: string): string {
  if (typeof str !== 'string') return str;
  let out = str;
  if (PRIVATE_KEY_PATTERN.test(out)) {
    out = out.replace(PRIVATE_KEY_PATTERN, REDACTED);
  }
  if (JWT_PATTERN.test(out)) {
    out = out.replace(JWT_PATTERN, REDACTED);
  }
  if (out.length > 2000) {
    out = out.slice(0, 2000) + '...[TRUNCATED]';
  }
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return '[TRUNCATED]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const slice = value.slice(0, 100);
    const mapped = slice.map((item) => redact(item, depth + 1));
    return mapped;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}
