import path from 'path';

export interface ResolveWithinResult {
  safe: boolean;
  path?: string;
  reason?: string;
}

export function resolveWithin(baseDir: string, relativePath: string): ResolveWithinResult {
  if (!relativePath || relativePath.trim() === '') {
    return { safe: false, reason: 'empty_path' };
  }
  if (relativePath.includes('\0')) {
    return { safe: false, reason: 'nul_byte' };
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, relativePath);

  if (resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return { safe: true, path: resolvedTarget };
  }

  return { safe: false, reason: 'path_traversal' };
}

export interface ValidateUploadResult {
  ok: boolean;
  reason?: string;
}

const ALLOWED_EXTENSIONS = new Set(['.csv', '.json', '.txt', '.png', '.jpg', '.jpeg', '.pdf']);

export function validateUploadFilename(
  filename: string,
  maxBytes: number,
  actualBytes: number
): ValidateUploadResult {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { ok: false, reason: 'invalid_filename' };
  }

  if (actualBytes <= 0 || actualBytes > maxBytes) {
    return { ok: false, reason: 'size_exceeded' };
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: 'extension_not_allowed' };
  }

  return { ok: true };
}
