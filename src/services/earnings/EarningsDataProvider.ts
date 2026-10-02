/**
 * PHASE 24 — EARNINGS DATA PROVIDER
 * =================================
 * Bridges the authoritative Phase 19.6 financial-document pipeline into Phase 24
 * canonical facts. This is a REAL consumer of the existing pipeline (it does not
 * introduce a second parser).
 *
 * Fail-closed: when no authoritative document / raw payload is available the
 * provider returns an empty fact set with a UNAVAILABLE reason — it never
 * fabricates facts or falls back to mock data.
 */

import {
  AuthoritativeDocumentPipeline,
  type DocumentPipelineResult,
  type RawDocumentPayload,
  type SecondarySourceMetric,
  type FinancialReportType,
  type FinancialStatementType,
} from '../financialDocuments/index.ts';
import type {
  CanonicalFinancialFact,
  DataFreshnessStatus,
  EarningsReportType,
  EarningsStatementType,
  FinancialPeriod,
  SourceTier,
} from '../../lib/earnings/types.ts';
import { FinancialPeriodEngine } from '../../lib/earnings/FinancialPeriodEngine.ts';
import { EARNINGS_ENGINE_NAME, EARNINGS_CALCULATION_VERSION } from '../../lib/earnings/helpers.ts';

export interface EarningsFactRequest {
  readonly symbol: string;
  /** Raw authoritative period string (e.g. `FY_2024`, `Q3_2024`). */
  readonly period: string;
  readonly fiscalYear: number;
  readonly reportType?: FinancialReportType;
  readonly rawPayload?: RawDocumentPayload;
  readonly secondarySources?: Record<string, SecondarySourceMetric[]>;
}

export interface EarningsFactResult {
  readonly symbol: string;
  readonly facts: readonly CanonicalFinancialFact[];
  readonly freshness: DataFreshnessStatus;
  readonly reportType: EarningsReportType;
  readonly period: FinancialPeriod | null;
  readonly presentation: 'DIRECT' | 'INDIRECT' | 'UNKNOWN';
  readonly issues: readonly string[];
  readonly pipelineResult: DocumentPipelineResult | null;
}

/** Deterministic source → tier mapping (authoritative hierarchy). */
export function sourceTierOf(source: string): SourceTier {
  switch (source) {
    case 'SSC':
      return 'TIER_1_PRIMARY';
    case 'HOSE':
    case 'HNX':
      return 'TIER_2_EXCHANGE';
    case 'ISSUER_IR':
      return 'TIER_3_ISSUER';
    default:
      return 'TIER_4_BROKER_CROSS_CHECK';
  }
}

function statementTypeOf(source: FinancialStatementType): EarningsStatementType | null {
  switch (source) {
    case 'INCOME_STATEMENT':
      return 'INCOME_STATEMENT';
    case 'BALANCE_SHEET':
      return 'BALANCE_SHEET';
    case 'CASH_FLOW_DIRECT':
    case 'CASH_FLOW_INDIRECT':
      return 'CASH_FLOW';
    default:
      return null;
  }
}

/** Combines freshnesses with INVALID > CURRENT > STALE > UNAVAILABLE hierarchy. */
export function combineFreshness(statuses: readonly DataFreshnessStatus[]): DataFreshnessStatus {
  if (statuses.length === 0) return 'UNAVAILABLE';
  if (statuses.some((s) => s === 'INVALID')) return 'INVALID';
  if (statuses.some((s) => s === 'CURRENT')) return 'CURRENT';
  if (statuses.some((s) => s === 'STALE')) return 'STALE';
  return 'UNAVAILABLE';
}

export class EarningsDataProvider {
  private readonly pipeline: AuthoritativeDocumentPipeline;

  constructor(pipeline?: AuthoritativeDocumentPipeline) {
    this.pipeline = pipeline ?? new AuthoritativeDocumentPipeline();
  }

  /**
   * Maps a Phase 19.6 pipeline result into Phase 24 canonical, versioned facts.
   */
  public toCanonicalFacts(
    symbol: string,
    results: readonly DocumentPipelineResult[]
  ): { facts: CanonicalFinancialFact[]; issues: string[]; presentation: 'DIRECT' | 'INDIRECT' | 'UNKNOWN' } {
    const sym = symbol.trim().toUpperCase();
    const facts: CanonicalFinancialFact[] = [];
    const issues: string[] = [];
    let presentation: 'DIRECT' | 'INDIRECT' | 'UNKNOWN' = 'UNKNOWN';

    for (const res of results) {
      const period = FinancialPeriodEngine.parse(res.period) ?? FinancialPeriodEngine.cumulative(res.fiscalYear, 'FY');
      const reportType: EarningsReportType = res.reportType;

      for (const [metricKey, metric] of Object.entries(res.metrics)) {
        const statementType = statementTypeOf(metric.statementType);
        if (!statementType) continue;

        if (metric.statementType === 'CASH_FLOW_DIRECT') presentation = 'DIRECT';
        else if (metric.statementType === 'CASH_FLOW_INDIRECT') presentation = 'INDIRECT';

        const periodForMetric = FinancialPeriodEngine.parse(metric.period) ?? period;

        const freshness: DataFreshnessStatus =
          metric.value === null
            ? 'UNAVAILABLE'
            : metric.validationStatus === 'REJECTED'
            ? 'INVALID'
            : 'CURRENT';

        const fact: CanonicalFinancialFact = {
          symbol: sym,
          metric: metricKey,
          statementType,
          reportType,
          period: periodForMetric,
          value: metric.value,
          currency: metric.currency,
          unit: metric.unit,
          audited: metric.audited,
          auditStatus: metric.audited ? 'AUDITED' : 'UNAUDITED',
          restatementStatus: 'ORIGINAL',
          restatementVersion: 0,
          reportId: metric.sourceDocumentId || `REPORT_${sym}_${res.period}`,
          statementId: metric.sourceDocumentId || `STMT_${sym}_${res.period}`,
          publicationDate: metric.sourcePublishedAt || null,
          source: res.document.source,
          sourceTier: sourceTierOf(res.document.source),
          freshness,
          validationStatus: metric.validationStatus,
          unavailableReason: metric.unavailableReason,
          notes: metric.notes,
          lineage: {
            sources: [res.document.source],
            engine: EARNINGS_ENGINE_NAME,
            calculationVersion: EARNINGS_CALCULATION_VERSION,
            reportId: metric.sourceDocumentId || null,
            periodStart: periodForMetric.periodStart,
            periodEnd: periodForMetric.periodEnd,
            publicationDate: metric.sourcePublishedAt || null,
            auditStatus: metric.audited ? 'AUDITED' : 'UNAUDITED',
            restatementVersion: 0,
          },
        };
        facts.push(Object.freeze(fact));
      }
    }

    return { facts, issues, presentation };
  }

  /**
   * Retrieves canonical facts for one authoritative period. Requires a real
   * document payload / discovered document; otherwise fails closed.
   */
  public async getFacts(request: EarningsFactRequest): Promise<EarningsFactResult> {
    const sym = request.symbol.trim().toUpperCase();
    const pipelineResult = this.pipeline.execute({
      discoveryQuery: {
        symbol: sym,
        period: request.period,
        fiscalYear: request.fiscalYear,
        reportType: request.reportType,
      },
      rawPayload: request.rawPayload,
      secondarySources: request.secondarySources,
    });

    const { facts, issues, presentation } = this.toCanonicalFacts(sym, [pipelineResult]);
    const period = FinancialPeriodEngine.parse(pipelineResult.period) ?? null;

    if (facts.length === 0) {
      issues.push(
        pipelineResult.errors[0] ??
          `No canonical facts available for ${sym} ${request.period} (fail-closed).`
      );
    }

    return {
      symbol: sym,
      facts: Object.freeze(facts),
      freshness: combineFreshness(facts.map((f) => f.freshness)),
      reportType: pipelineResult.reportType,
      period,
      presentation,
      issues: Object.freeze(issues),
      pipelineResult,
    };
  }
}
