/**
 * PHASE 25/26 — STRATEGY CONTEXT AGGREGATOR
 * ==========================================
 * Orchestrates multi-snapshot retrieval across certified Phases 20–26.
 * Enforces temporal alignment and mandatory lookahead protection.
 *
 * LOOKAHEAD-BIAS PROTECTION (P0 Invariant):
 *   If any ingested snapshot has a publication timestamp or asOfDate
 *   occurring AFTER the evaluation point, the context is marked as
 *   `lookaheadRejected = true` and strategies must fail closed.
 */

import type { AssetClass, StrategyContext } from './types.ts';
import { MarketIntelligenceService } from '../../services/market/MarketIntelligenceService.ts';
import { DerivativesIntelligenceService } from '../../services/derivatives/DerivativesIntelligenceService.ts';
import { EtfIntelligenceService } from '../../services/etf/EtfIntelligenceService.ts';
import { CorporateActionIntelligenceService } from '../../services/corporate-actions/CorporateActionIntelligenceService.ts';
import { EarningsIntelligenceService } from '../../services/earnings/EarningsIntelligenceService.ts';
import { PolicyIntelligenceService } from '../../services/capital-cycle/PolicyIntelligenceService.ts';
import { MacroRegimeService } from '../../services/macro-regime/MacroRegimeService.ts';

export interface BuildStrategyContextOptions {
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly asOfDate?: string; // YYYY-MM-DD
  readonly evaluatedAt?: string; // ISO-8601
  readonly currentPrice?: number | null;
  readonly forceRefresh?: boolean;
  // Direct snapshot injection for deterministic testing / offline simulation
  readonly marketSnapshotOverride?: StrategyContext['marketSnapshot'];
  readonly derivativesSnapshotOverride?: StrategyContext['derivativesSnapshot'];
  readonly etfSnapshotOverride?: StrategyContext['etfSnapshot'];
  readonly corporateActionSnapshotOverride?: StrategyContext['corporateActionSnapshot'];
  readonly earningsSnapshotOverride?: StrategyContext['earningsSnapshot'];
  readonly capitalCycleSnapshotOverride?: StrategyContext['capitalCycleSnapshot'];
  readonly macroRegimeSnapshotOverride?: StrategyContext['macroRegimeSnapshot'];
}

export class StrategyContextAggregator {
  /**
   * Aggregates relevant intelligence snapshots for the specified symbol & asset class.
   */
  public static async buildContext(
    options: BuildStrategyContextOptions
  ): Promise<StrategyContext> {
    const symbol = options.symbol.trim().toUpperCase();
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
    const assetClass = options.assetClass;

    let marketSnapshot = options.marketSnapshotOverride ?? null;
    let derivativesSnapshot = options.derivativesSnapshotOverride ?? null;
    let etfSnapshot = options.etfSnapshotOverride ?? null;
    let corporateActionSnapshot = options.corporateActionSnapshotOverride ?? null;
    let earningsSnapshot = options.earningsSnapshotOverride ?? null;
    let capitalCycleSnapshot = options.capitalCycleSnapshotOverride ?? null;
    let macroRegimeSnapshot = options.macroRegimeSnapshotOverride ?? null;

    // Concurrently fetch required upstream snapshots based on asset class if not injected
    const fetchPromises: Promise<void>[] = [];

    if (!marketSnapshot && (assetClass === 'EQUITY' || assetClass === 'CROSS_ASSET')) {
      fetchPromises.push(
        MarketIntelligenceService.getSnapshot({
          forceRefresh: options.forceRefresh,
        })
          .then((res) => {
            marketSnapshot = res;
          })
          .catch(() => {
            marketSnapshot = null;
          })
      );
    }

    if (!derivativesSnapshot && (assetClass === 'DERIVATIVE' || assetClass === 'CROSS_ASSET')) {
      fetchPromises.push(
        DerivativesIntelligenceService.getSnapshot({
          underlying: 'VN30',
          forceRefresh: options.forceRefresh,
          asOfDate,
        })
          .then((res) => {
            derivativesSnapshot = res;
          })
          .catch(() => {
            derivativesSnapshot = null;
          })
      );
    }

    if (!etfSnapshot && assetClass === 'ETF') {
      fetchPromises.push(
        EtfIntelligenceService.getSnapshot({
          symbol,
          forceRefresh: options.forceRefresh,
        })
          .then((res) => {
            etfSnapshot = res;
          })
          .catch(() => {
            etfSnapshot = null;
          })
      );
    }

    if (!corporateActionSnapshot && (assetClass === 'EQUITY' || assetClass === 'CROSS_ASSET')) {
      fetchPromises.push(
        CorporateActionIntelligenceService.getSnapshot(symbol, {
          asOfDate,
          forceRefresh: options.forceRefresh,
        })
          .then((res) => {
            corporateActionSnapshot = res;
          })
          .catch(() => {
            corporateActionSnapshot = null;
          })
      );
    }

    if (!earningsSnapshot && (assetClass === 'EQUITY' || assetClass === 'CROSS_ASSET')) {
      fetchPromises.push(
        EarningsIntelligenceService.getSnapshot(symbol, {
          asOfDate,
          forceRefresh: options.forceRefresh,
        })
          .then((res) => {
            earningsSnapshot = res;
          })
          .catch(() => {
            earningsSnapshot = null;
          })
      );
    }

    if (!capitalCycleSnapshot && (assetClass === 'EQUITY' || assetClass === 'CROSS_ASSET')) {
      fetchPromises.push(
        PolicyIntelligenceService.getSnapshot({
          symbol,
          asOfDate,
          forceRefresh: options.forceRefresh,
        })
          .then((res) => {
            capitalCycleSnapshot = res;
          })
          .catch(() => {
            capitalCycleSnapshot = null;
          })
      );
    }

    if (!macroRegimeSnapshot && (assetClass === 'EQUITY' || assetClass === 'CROSS_ASSET')) {
      fetchPromises.push(
        MacroRegimeService.getSnapshot({
          asOfDate,
          forceRefresh: options.forceRefresh,
        })
          .then((res) => {
            macroRegimeSnapshot = res;
          })
          .catch(() => {
            macroRegimeSnapshot = null;
          })
      );
    }

    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
    }

    // Lookahead Protection Verification
    const lookaheadViolations: string[] = [];

    if (marketSnapshot?.timestamp && marketSnapshot.timestamp.slice(0, 10) > asOfDate) {
      lookaheadViolations.push(
        `Market snapshot timestamp (${marketSnapshot.timestamp.slice(0, 10)}) > evaluation date (${asOfDate})`
      );
    }

    if (derivativesSnapshot?.timestamp && derivativesSnapshot.timestamp.slice(0, 10) > asOfDate) {
      lookaheadViolations.push(
        `Derivatives snapshot timestamp (${derivativesSnapshot.timestamp.slice(0, 10)}) > evaluation date (${asOfDate})`
      );
    }

    if (etfSnapshot?.timestamp && etfSnapshot.timestamp.slice(0, 10) > asOfDate) {
      lookaheadViolations.push(
        `ETF snapshot timestamp (${etfSnapshot.timestamp.slice(0, 10)}) > evaluation date (${asOfDate})`
      );
    }

    if (corporateActionSnapshot?.asOfDate && corporateActionSnapshot.asOfDate > asOfDate) {
      lookaheadViolations.push(
        `Corporate action snapshot date (${corporateActionSnapshot.asOfDate}) > evaluation date (${asOfDate})`
      );
    }

    if (earningsSnapshot?.asOfDate && earningsSnapshot.asOfDate > asOfDate) {
      lookaheadViolations.push(
        `Earnings snapshot date (${earningsSnapshot.asOfDate}) > evaluation date (${asOfDate})`
      );
    }

    if (capitalCycleSnapshot?.asOfDate && capitalCycleSnapshot.asOfDate > asOfDate) {
      lookaheadViolations.push(
        `Capital cycle snapshot date (${capitalCycleSnapshot.asOfDate}) > evaluation date (${asOfDate})`
      );
    }

    if (macroRegimeSnapshot?.asOfDate && macroRegimeSnapshot.asOfDate > asOfDate) {
      lookaheadViolations.push(
        `Macro regime snapshot date (${macroRegimeSnapshot.asOfDate}) > evaluation date (${asOfDate})`
      );
    }

    const lookaheadRejected = lookaheadViolations.length > 0;

    return Object.freeze({
      symbol,
      assetClass,
      asOfDate,
      evaluatedAt,
      currentPrice: options.currentPrice ?? null,
      marketSnapshot,
      derivativesSnapshot,
      etfSnapshot,
      corporateActionSnapshot,
      earningsSnapshot,
      capitalCycleSnapshot,
      macroRegimeSnapshot,
      lookaheadRejected,
      lookaheadDetails: Object.freeze(lookaheadViolations),
    });
  }
}
