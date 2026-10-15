/**
 * PLATFORM-03 — PATH TRAVERSAL / FILE SAFETY (§52)
 *
 * No upload feature exists in the repo today, so this module is a guard for future
 * platform file operations rather than a retrofit. It is pure and tested so the rule
 * is enforced by construction when those endpoints are added.
 */
import path from 'node:path';

export interface PathCheck {
  readonly safe: boolean;
  readonly resolved: string | null;
  readonly reason: string | null;
}

/**
 * Resolves `candidate` strictly inside `baseDir`.
 * Rejects absolute paths, `..` traversal, NUL bytes, and symlink-style separators.
 */
export function resolveWithin(baseDir: string, candidate: string): PathCheck {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return { safe: false, resolved: null, reason: 'empty_path' };
  }
  if (candidate.includes('\0')) return { safe: false, resolved: null, reason: 'nul_byte' };
  const base = path.resolve(baseDir);
  const target = path.resolve(base, candidate);
  const rel = path.relative(base, target);
  if (rel === '') return { safe: true, resolved: target, reason: null };
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { safe: false, resolved: null, reason: 'path_traversal' };
  }
  return { safe: true, resolved: target, reason: null };
}

/** Conservative extension allow-list — client MIME type is never trusted (§52). */
export const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = ['.csv', '.json', '.md', '.txt', '.png', '.jpg', '.jpeg'];

export interface UploadCheck {
  readonly ok: boolean;
  readonly reason: string | null;
}

export function validateUploadFilename(filename: string, maxBytes: number, sizeBytes: number): UploadCheck {
  if (typeof filename !== 'string' || filename.length === 0 || filename.length > 255) {
    return { ok: false, reason: 'invalid_filename' };
  }
  if (filename.includes('/') || filename.includes('\\') || filename.includes('\0') || filename.includes('..')) {
    return { ok: false, reason: 'invalid_filename' };
  }
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) return { ok: false, reason: 'extension_not_allowed' };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) return { ok: false, reason: 'size_exceeded' };
  return { ok: true, reason: null };
}