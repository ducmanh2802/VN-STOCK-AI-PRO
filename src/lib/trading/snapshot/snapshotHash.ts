import crypto from 'crypto';

export function canonicalSerialize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalSerialize).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalSerialize((obj as Record<string, unknown>)[k])).join(',') + '}';
}

export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}
