/**
 * PHASE 24 — SHARED TEST FIXTURES
 * ===============================
 * Deterministic canonical-fact builders for the Phase 24 test suites.
 * These are TEST-ONLY helpers and are not part of the production execution path.
 */

import type {
  CanonicalFinancialFact,
  EarningsStatementType,
  EarningsReportType,
  FinancialPeriod,
  SourceTier,
  RestatementStatus,
} from '../types.ts';

export interface FactOptions {
  symbol?: string;
  statementType?: EarningsStatementType;
  reportType?: EarningsReportType;
  currency?: string;
  unit?: string;
  auditStatus?: 'AUDITED' | 'REVIEWED' | 'UNAUDITED';
  restatementStatus?: RestatementStatus;
  restatementVersion?: number;
  source?: string;
  sourceTier?: SourceTier;
  freshness?: CanonicalFinancialFact['freshness'];
  reportId?: string;
  statementId?: string;
  publicationDate?: string | null;
}

/** Builds a canonical fact with deterministic defaults. */
export function makeFact(
  metric: string,
  period: FinancialPeriod,
  value: number | null,
  options: FactOptions = {}
): CanonicalFinancialFact {
  const symbol = options.symbol ?? 'HPG';
  const statementType = options.statementType ?? 'INCOME_STATEMENT';
  const reportType = options.reportType ?? 'CONSOLIDATED';
  const auditStatus = options.auditStatus ?? 'AUDITED';
  return {
    symbol,
    metric,
    statementType,
    reportType,
    period,
    value,
    currency: options.currency ?? 'VND',
    unit: options.unit ?? 'VND',
    audited: auditStatus === 'AUDITED',
    auditStatus,
    restatementStatus: options.restatementStatus ?? 'ORIGINAL',
    restatementVersion: options.restatementVersion ?? 0,
    reportId: options.reportId ?? `R-${symbol}-${period.id}`,
    statementId: options.statementId ?? `S-${symbol}-${period.id}`,
    publicationDate: options.publicationDate ?? '2024-03-15',
    source: options.source ?? 'HOSE',
    sourceTier: options.sourceTier ?? 'TIER_2_EXCHANGE',
    freshness: options.freshness ?? 'CURRENT',
    validationStatus: 'VALIDATED',
    lineage: {
      sources: [options.source ?? 'HOSE'],
      engine: 'TestFixture',
      calculationVersion: '24.0.0-TEST',
    },
  };
}
