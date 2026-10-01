/**
 * PHASE 24 — EARNINGS & FINANCIAL STATEMENTS INTELLIGENCE: PUBLIC API
 * =================================================================
 * Canonical domain contracts and deterministic engines.
 *
 * Architecture mirrors the repository convention (Phase 21/22/23):
 *   src/lib/earnings/**     — domain types + deterministic engines
 *   src/services/earnings/** — data provider + cached intelligence service
 */

export * from './types.ts';
export * from './helpers.ts';
export * from './FinancialPeriodEngine.ts';
export * from './factLookup.ts';
export * from './lineage.ts';
export * from './IncomeStatementEngine.ts';
export * from './BalanceSheetEngine.ts';
export * from './CashFlowEngine.ts';
export * from './EpsEngine.ts';
export * from './EarningsGrowthEngine.ts';
export * from './MarginEngine.ts';
export * from './EarningsQualityEngine.ts';
export * from './EarningsCalendarEngine.ts';
export * from './RestatementEngine.ts';
export * from './EarningsSnapshotBuilder.ts';
