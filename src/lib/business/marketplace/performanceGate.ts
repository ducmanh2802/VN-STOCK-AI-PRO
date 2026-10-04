/**
 * BUSINESS-03 — PERFORMANCE GATE
 * ===============================
 * The ONLY way to obtain a displayable performance figure (roadmap §03.2).
 *
 * A metric becomes displayable when, and only when, all six provenance fields resolve:
 *
 *     dataset | period | strategyVersion | costModel | executionModel | validationState
 *
 * If any field is missing the result is `NOT_AVAILABLE` — never a partial render, never a
 * default, never a value sourced from anywhere else. There is deliberately no code path that
 * returns a number with a missing provenance field, because that is the exact failure the
 * roadmap forbids: "+37.4%" shown with no idea where it came from.
 *
 * This gate is also why a marketplace listing can exist without ever displaying a return: an
 * author may publish methodology, rules and provenance while their own performance evidence
 * is incomplete. The listing then reads `PERFORMANCE: NOT_AVAILABLE`, which is a truthful and
 * publishable state.
 */

import {
  noEvidence,
  type DisplayableMetric,
  type PerformanceEvidence,
  type PerformanceMetricValue,
  type ResolvedProvenance,
} from './types.ts';

export type PerformanceGateResult<T> =
  | { readonly displayable: true; readonly value: T; readonly provenance: ResolvedProvenance }
  | {
      readonly displayable: false;
      readonly marker: 'NOT_AVAILABLE';
      /** Which provenance fields are missing. Reported so the gap is actionable. */
      readonly missing: readonly string[];
    };

const REQUIRED_FIELDS = [
  'dataset',
  'period',
  'strategyVersion',
  'costModel',
  'executionModel',
  'validationState',
] as const;

/** Which provenance fields are unresolved. Total and deterministic. */
export function missingProvenance(p: PerformanceEvidence): readonly string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (p[field].state !== 'PRESENT') missing.push(field);
  }
  return missing;
}

export function provenanceComplete(p: PerformanceEvidence): boolean {
  return missingProvenance(p).length === 0;
}

/**
 * Resolve provenance, or explain why it cannot be resolved.
 * Narrowing is only possible on the `displayable: true` branch, which is what makes
 * "display a number without provenance" a type error rather than a review question.
 */
export function gateProvenance(p: PerformanceEvidence): PerformanceGateResult<ResolvedProvenance> {
  const missing = missingProvenance(p);
  if (missing.length > 0) return { displayable: false, marker: 'NOT_AVAILABLE', missing };

  // Every field is PRESENT here; re-read them through the narrowing branch.
  if (p.dataset.state !== 'PRESENT') throw new Error('UNREACHABLE_PROVENANCE');
  if (p.period.state !== 'PRESENT') throw new Error('UNREACHABLE_PROVENANCE');
  if (p.strategyVersion.state !== 'PRESENT') throw new Error('UNREACHABLE_PROVENANCE');
  if (p.costModel.state !== 'PRESENT') throw new Error('UNREACHABLE_PROVENANCE');
  if (p.executionModel.state !== 'PRESENT') throw new Error('UNREACHABLE_PROVENANCE');
  if (p.validationState.state !== 'PRESENT') throw new Error('UNREACHABLE_PROVENANCE');

  return {
    displayable: true,
    provenance: {
      dataset: p.dataset.value,
      period: p.period.value,
      strategyVersion: p.strategyVersion.value,
      costModel: p.costModel.value,
      executionModel: p.executionModel.value,
      validationState: p.validationState.value,
    },
    value: {
      dataset: p.dataset.value,
      period: p.period.value,
      strategyVersion: p.strategyVersion.value,
      costModel: p.costModel.value,
      executionModel: p.executionModel.value,
      validationState: p.validationState.value,
    },
  };
}

/**
 * Gate a single metric. A metric is only produced when provenance is complete AND the value
 * is finite. A NaN, Infinity, or non-finite value is treated as unavailable rather than
 * rendered — a broken backtest must not surface as a number.
 */
export function gateMetric(
  metric: PerformanceMetricValue,
  provenance: PerformanceEvidence,
): PerformanceGateResult<DisplayableMetric> {
  const gated = gateProvenance(provenance);
  if (gated.displayable === false) return { displayable: false, marker: 'NOT_AVAILABLE', missing: gated.missing };

  if (!Number.isFinite(metric.value)) {
    return { displayable: false, marker: 'NOT_AVAILABLE', missing: ['nonFiniteValue'] };
  }
  return {
    displayable: true,
    provenance: gated.provenance,
    value: { metric: metric.metric, value: metric.value, provenance: gated.provenance },
  };
}

/** Gate every metric on a version. Either all render, or none do. */
export function gateAllMetrics(
  metrics: readonly PerformanceMetricValue[],
  provenance: PerformanceEvidence,
): {
  readonly metrics: readonly DisplayableMetric[];
  readonly marker: 'AVAILABLE' | 'NOT_AVAILABLE';
  readonly missing: readonly string[];
  readonly provenance: ResolvedProvenance | null;
} {
  const gated = gateProvenance(provenance);
  if (gated.displayable === false) return { metrics: [], marker: 'NOT_AVAILABLE', missing: gated.missing, provenance: null };

  const out: DisplayableMetric[] = [];
  for (const m of metrics) {
    if (!Number.isFinite(m.value)) continue;
    out.push({ metric: m.metric, value: m.value, provenance: gated.provenance });
  }
  return { metrics: out, marker: 'AVAILABLE', missing: [], provenance: gated.provenance };
}

/** An empty, fully-marked evidence set. The honest default for a new version. */
export function emptyEvidence(): PerformanceEvidence {
  return {
    dataset: noEvidence('no dataset recorded'),
    period: noEvidence('no period recorded'),
    strategyVersion: noEvidence('no strategy version recorded'),
    costModel: noEvidence('no cost model recorded'),
    executionModel: noEvidence('no execution model recorded'),
    validationState: noEvidence('no validation state recorded'),
  };
}

/**
 * A listing's performance, as the API returns it. Exactly one of the two shapes.
 * There is no field that could hold a bare number without provenance beside it.
 */
export type ListingPerformance =
  | {
      readonly status: 'AVAILABLE';
      readonly metrics: readonly DisplayableMetric[];
      readonly provenance: ResolvedProvenance;
    }
  | { readonly status: 'NOT_AVAILABLE'; readonly missing: readonly string[]; readonly reason: string };