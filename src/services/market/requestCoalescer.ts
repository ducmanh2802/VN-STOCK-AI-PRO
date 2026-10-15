/**
 * P27 — REQUEST DEDUPLICATION / IN-FLIGHT COALESCING (§18)
 * =========================================================
 * 20 widgets asking for the same quote in the same tick must produce ONE
 * provider request, not 20.
 *
 * Rules:
 *   - keyed single-flight: the first caller creates the promise, everyone else
 *     awaits the same promise;
 *   - a FAILED promise is never memoized — the entry is removed on settle so the
 *     next caller retries;
 *   - no persistence, no database (P27 §26).
 */

const inFlight = new Map<string, Promise<unknown>>();

/**
 * P27 §27 — deduplication is MEASURED: how many callers joined a request that
 * another caller had already started. Monotonic for the process lifetime.
 */
let coalesced = 0;

export function coalesceInFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    coalesced += 1;
    return existing as Promise<T>;
  }

  const promise = factory().finally(() => {
    // Always release the slot, success or failure: a failure must stay visible
    // to the next caller rather than being cached as a permanent result.
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Diagnostics for tests and /api/health. */
export function inflightStats(): { size: number; coalesced: number; keys: string[] } {
  return { size: inFlight.size, coalesced, keys: Array.from(inFlight.keys()) };
}

export function resetInFlight(): void {
  inFlight.clear();
}
