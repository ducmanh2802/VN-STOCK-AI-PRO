/**
 * RESEARCH-01 — EXPERIMENT + DATASET FOUNDATION
 * ==============================================
 * Reproducible experiments: explicit versions/parameters, validated dataset
 * spec (PIT rules + universe definition required — hidden current-state
 * universe rejected), deterministic fingerprint via stable stringify.
 * Pure + deterministic. Timestamps injected.
 */

import type { ResearchDataset, ResearchExperiment } from './types.ts';
import { RESEARCH_VERSION } from './types.ts';

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}}`;
}

export function experimentFingerprint(e: ResearchExperiment): string {
  const core = {
    dataset: e.dataset,
    strategy: e.strategy,
    strategyVersion: e.strategyVersion,
    parameters: e.parameters,
    executionModelVersion: e.executionModelVersion,
    riskModelVersion: e.riskModelVersion,
    seed: e.seed,
  };
  const s = stableStringify(core);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `EXP_${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export interface CreateExperimentInput {
  readonly experimentId: string;
  readonly name: string;
  readonly description?: string;
  readonly strategy: string;
  readonly strategyVersion: string;
  readonly executionModelVersion?: string;
  readonly riskModelVersion?: string;
  readonly dataVersion: string;
  readonly dataset: ResearchDataset;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
  readonly createdAt: string;
  readonly seed?: number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ExperimentEngine {
  static validateDataset(d: ResearchDataset): readonly string[] {
    const errors: string[] = [];
    if (d.instruments.length === 0) errors.push('EMPTY_UNIVERSE');
    if (!DATE_RE.test(d.startDate) || !DATE_RE.test(d.endDate)) errors.push('INVALID_RANGE');
    if (d.startDate > d.endDate) errors.push('INVERTED_RANGE');
    if (d.dataSources.length === 0) errors.push('NO_SOURCES');
    if (d.pointInTimeRules.length === 0) errors.push('NO_PIT_RULES');
    if (!d.universeDefinition || !d.universeDefinition.trim()) errors.push('UNIVERSE_UNDEFINED');
    if (d.universeAsOf === null) errors.push('UNIVERSE_VINTAGE_MISSING');
    return errors;
  }

  static create(input: CreateExperimentInput): ResearchExperiment {
    if (!input.experimentId) throw new Error('EXPERIMENT_ID_REQUIRED');
    if (!input.strategy) throw new Error('STRATEGY_REQUIRED');
    const errors = ExperimentEngine.validateDataset(input.dataset);
    if (errors.length > 0) throw new Error(`INVALID_DATASET:${errors.join(',')}`);
    return {
      experimentId: input.experimentId,
      name: input.name,
      description: input.description ?? '',
      strategy: input.strategy,
      strategyVersion: input.strategyVersion,
      universe: [...input.dataset.instruments],
      startDate: input.dataset.startDate,
      endDate: input.dataset.endDate,
      asOfSemantics: input.dataset.pointInTimeRules.join(';'),
      dataVersion: input.dataVersion,
      executionModelVersion: input.executionModelVersion ?? 'v1.0.0-research-exec',
      riskModelVersion: input.riskModelVersion ?? 'v1.0.0-risk',
      parameters: { ...input.parameters },
      createdAt: input.createdAt,
      status: 'DRAFT',
      dataset: {
        ...input.dataset,
        instruments: [...input.dataset.instruments],
        dataSources: [...input.dataset.dataSources],
        pointInTimeRules: [...input.dataset.pointInTimeRules],
      },
      seed: input.seed ?? null,
    };
  }

  static reproducibilityKey(e: ResearchExperiment): string {
    return experimentFingerprint(e);
  }
}

export { RESEARCH_VERSION };
