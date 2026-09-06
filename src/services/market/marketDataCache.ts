/**
 * Lightweight in-memory TTL cache for market-data responses (STEP 14).
 *
 * Rules:
 *   - Map<string, { value, expiresAt }> — no persistence, no database.
 *   - ONLY successful results are ever cached (the service layer calls cacheSet
 *     exclusively after a provider succeeded); errors must stay visible and are
 *     never turned into stale-but-permanent data.
 *   - Short TTLs: quotes 15s, history 60s, fundamentals 5min.
 *   - Server-process-lifetime only: a restart empties the cache.
 */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() >= hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export function cacheClear(): void {
  store.clear();
}

/** Introspection for diagnostics (exposed via /api/health in dev). */
export function cacheStats(): { size: number; keys: string[] } {
  return { size: store.size, keys: Array.from(store.keys()) };
}