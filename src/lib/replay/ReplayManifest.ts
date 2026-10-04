/**
 * PAPER REPLAY — MANIFEST + FINGERPRINT
 * =====================================
 * Immutable manifest allowing another process to reproduce the replay,
 * plus deterministic FNV-1a fingerprints (manifest / replay result).
 */
import type { ReplayManifest } from './types.ts';
import { REPLAY_VERSION } from './types.ts';

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function manifestFingerprint(m: ReplayManifest): string {
  return `MF_${fnv1a(stableStringify(m))}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CreateManifestInput {
  readonly replayId: string;
  readonly createdAt: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly decisionVersion: string;
  readonly riskModelVersion: string;
  readonly positionSizingVersion: string;
  readonly executionModelVersion: string;
  readonly costModelVersion: string;
  readonly universe: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly initialCapital: number;
  readonly seed?: number | null;
  readonly mode: ReplayManifest['mode'];
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
  readonly provider?: string;
  readonly dataQuality?: string;
  readonly corporateActionPolicy?: string;
  readonly pointInTimePolicy?: string;
}

export class ReplayManifestEngine {
  static create(input: CreateManifestInput): ReplayManifest {
    if (!input.replayId) throw new Error('REPLAY_ID_REQUIRED');
    if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) throw new Error('INVALID_RANGE');
    if (input.startDate > input.endDate) throw new Error('INVERTED_RANGE');
    if (!(input.initialCapital > 0)) throw new Error('INVALID_INITIAL_CAPITAL');
    if (input.universe.length === 0) throw new Error('EMPTY_UNIVERSE');
    const m: ReplayManifest = {
      replayId: input.replayId,
      createdAt: input.createdAt,
      datasetId: input.datasetId,
      datasetVersion: input.datasetVersion,
      strategyId: input.strategyId,
      strategyVersion: input.strategyVersion,
      decisionVersion: input.decisionVersion,
      riskModelVersion: input.riskModelVersion,
      positionSizingVersion: input.positionSizingVersion,
      executionModelVersion: input.executionModelVersion,
      costModelVersion: input.costModelVersion,
      universe: [...input.universe],
      startDate: input.startDate,
      endDate: input.endDate,
      initialCapital: input.initialCapital,
      currency: 'VND',
      seed: input.seed ?? null,
      mode: input.mode,
      configuration: { ...input.configuration },
      codeVersion: REPLAY_VERSION,
      schemaVersion: REPLAY_VERSION,
      provider: input.provider ?? 'PAPER',
      dataQuality: input.dataQuality ?? 'UNKNOWN',
      corporateActionPolicy: input.corporateActionPolicy ?? 'EXPLICIT_EVENTS',
      pointInTimePolicy: input.pointInTimePolicy ?? 'publicationDate<=decisionDate',
    };
    return m;
  }

  static fingerprint(m: ReplayManifest): string {
    return manifestFingerprint(m);
  }

  static reproducible(a: ReplayManifest, b: ReplayManifest): boolean {
    return manifestFingerprint(a) === manifestFingerprint(b);
  }
}