/**
 * PHASE 18.3.2 — DETERMINISTIC CANONICAL SERIALIZATION & HASHING
 * ===============================================================
 * Deterministic JSON serialization and pure SHA-256 hashing.
 *
 * Rules:
 *   - Stable, sorted dictionary key ordering.
 *   - Deterministic handling of undefined (omitted) and null.
 *   - Deterministic number formatting (rejects NaN / Infinity).
 *   - Synchronous, pure, zero external dependencies.
 *   - Works identically across Node.js, Vite client builds, and test runners.
 */

// SHA-256 Round Constants K (first 32 bits of fractional parts of cube roots of first 64 primes)
const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotR(val: number, n: number): number {
  return (val >>> n) | (val << (32 - n));
}

/**
 * Standard, pure TypeScript SHA-256 implementation (FIPS PUB 180-4).
 * Returns lowercase 64-character hexadecimal digest.
 */
export function sha256(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;

  let H0 = 0x6a09e667;
  let H1 = 0xbb67ae85;
  let H2 = 0x3c6ef372;
  let H3 = 0xa54ff53a;
  let H4 = 0x510e527f;
  let H5 = 0x9b05688c;
  let H6 = 0x1f83d9ab;
  let H7 = 0x5be0cd19;

  const bitLength = bytes.length * 8;
  const newLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(newLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(newLength - 4, bitLength >>> 0, false);
  view.setUint32(newLength - 8, Math.floor(bitLength / 0x100000000), false);

  const W = new Uint32Array(64);

  for (let offset = 0; offset < newLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotR(W[i - 15], 7) ^ rotR(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotR(W[i - 2], 17) ^ rotR(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let a = H0;
    let b = H1;
    let c = H2;
    let d = H3;
    let e = H4;
    let f = H5;
    let g = H6;
    let h = H7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotR(e, 6) ^ rotR(e, 11) ^ rotR(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotR(a, 2) ^ rotR(a, 13) ^ rotR(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H0 = (H0 + a) >>> 0;
    H1 = (H1 + b) >>> 0;
    H2 = (H2 + c) >>> 0;
    H3 = (H3 + d) >>> 0;
    H4 = (H4 + e) >>> 0;
    H5 = (H5 + f) >>> 0;
    H6 = (H6 + g) >>> 0;
    H7 = (H7 + h) >>> 0;
  }

  return [H0, H1, H2, H3, H4, H5, H6, H7]
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Deterministically serializes any JavaScript structure to canonical JSON string.
 *
 * Properties:
 *   - Recursively sorts dictionary keys in lexicographical order.
 *   - Drops properties whose value is strictly `undefined` (matching standard JSON serialization).
 *   - Normalizes numbers and strictly rejects NaN or +/-Infinity.
 *   - Preserves array index sequence.
 */
export function canonicalSerialize(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        throw new Error(`Cannot canonically serialize non-finite number: ${val}`);
      }
      return Object.is(val, -0) ? '0' : String(val);
    }
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const items = val.map((item) => canonicalSerialize(item === undefined ? null : item));
    return `[${items.join(',')}]`;
  }

  // Dictionary object
  const keys = Object.keys(val as Record<string, unknown>).sort();
  const pairs: string[] = [];
  for (const k of keys) {
    const v = (val as Record<string, unknown>)[k];
    if (v !== undefined) {
      pairs.push(`${JSON.stringify(k)}:${canonicalSerialize(v)}`);
    }
  }
  return `{${pairs.join(',')}}`;
}

/**
 * Computes deterministic SHA-256 fingerprint from canonical serialization of payload.
 */
export function computeSnapshotHash(payload: unknown): string {
  return sha256(canonicalSerialize(payload));
}

/**
 * Computes deterministic content-addressed Snapshot ID: SNAP_<SHA256_HEX>.
 */
export function computeSnapshotId(payloadWithoutIdAndHash: unknown): string {
  const hash = computeSnapshotHash(payloadWithoutIdAndHash);
  return `SNAP_${hash.toUpperCase()}`;
}
