/**
 * PHASE 25 — STRATEGY FACTORY
 * =============================
 * Central deterministic registry and execution factory for Multi-Asset Strategies.
 *
 * Responsibilities:
 *   - Strategy registration & discovery.
 *   - Parameter validation against strategy contracts.
 *   - Execution lifecycle with strict fail-closed guards.
 *   - Zero dynamic code evaluation or string-to-code execution.
 */

import type {
  MultiAssetStrategy,
  ParameterValidationResult,
  StrategyContext,
  StrategyParameters,
  StrategySignal,
  StrategySignalLineage,
} from './types.ts';
import { UniversalSignalNormalizer } from './UniversalSignalNormalizer.ts';
import { EarningsMomentumStrategy } from './generators/EarningsMomentumStrategy.ts';
import { FuturesBasisArbitrageStrategy } from './generators/FuturesBasisArbitrageStrategy.ts';
import { EtfNavArbitrageStrategy } from './generators/EtfNavArbitrageStrategy.ts';
import { RegimeAdaptiveStrategy } from './generators/RegimeAdaptiveStrategy.ts';
import { DividendCaptureStrategy } from './generators/DividendCaptureStrategy.ts';

export class StrategyFactory {
  private static readonly registry = new Map<string, MultiAssetStrategy>();

  static {
    // Register canonical Phase 25 strategy generators + aliases
    const earningsMomentum = new EarningsMomentumStrategy();
    const futuresBasis = new FuturesBasisArbitrageStrategy();
    const etfNav = new EtfNavArbitrageStrategy();
    const regimeAdaptive = new RegimeAdaptiveStrategy();
    const dividendCapture = new DividendCaptureStrategy();

    // Canonical IDs
    this.registry.set(earningsMomentum.id, earningsMomentum);
    this.registry.set(futuresBasis.id, futuresBasis);
    this.registry.set(etfNav.id, etfNav);
    this.registry.set(regimeAdaptive.id, regimeAdaptive);
    this.registry.set(dividendCapture.id, dividendCapture);

    // Human-readable aliases
    this.registry.set('EARNINGS_MOMENTUM_QUALITY', earningsMomentum);
    this.registry.set('FUTURES_BASIS_ARBITRAGE', futuresBasis);
    this.registry.set('ETF_NAV_ARBITRAGE', etfNav);
    this.registry.set('REGIME_ADAPTIVE', regimeAdaptive);
    this.registry.set('DIVIDEND_CAPTURE', dividendCapture);
  }

  private static readonly canonicalIds: ReadonlySet<string> = new Set([
    'STRATEGY_EQUITY_EARNINGS_MOMENTUM',
    'STRATEGY_DERIVATIVES_BASIS_ARBITRAGE',
    'STRATEGY_ETF_NAV_ARBITRAGE',
    'STRATEGY_CROSS_ASSET_REGIME_ADAPTIVE',
    'STRATEGY_EQUITY_DIVIDEND_CAPTURE',
  ]);

  /**
   * Registers a new or custom MultiAssetStrategy into the factory.
   * Fail-closed (P25-P2-2): canonical Phase 25 strategy IDs are immutable —
   * registration refuses to overwrite them so certified generators cannot be
   * hijacked at runtime.
   */
  public static register(strategy: MultiAssetStrategy): void {
    if (!strategy.id || typeof strategy.id !== 'string') {
      throw new Error('Strategy must have a valid non-empty string ID');
    }
    if (this.canonicalIds.has(strategy.id)) {
      throw new Error(
        `StrategyFactory.register: refusal to overwrite canonical strategy '${strategy.id}' (fail-closed).`
      );
    }
    this.registry.set(strategy.id, strategy);
  }

  /**
   * Retrieves a strategy by ID or alias.
   */
  public static getStrategy(id: string): MultiAssetStrategy | undefined {
    return this.registry.get(id);
  }

  /**
   * Returns all uniquely registered strategies.
   */
  public static getAllStrategies(): readonly MultiAssetStrategy[] {
    const unique = new Set<MultiAssetStrategy>(this.registry.values());
    return Array.from(unique);
  }

  /**
   * Validates parameters for a specific strategy ID.
   */
  public static validateParameters(
    strategyId: string,
    params: unknown
  ): ParameterValidationResult {
    const strategy = this.getStrategy(strategyId);
    if (!strategy) {
      return {
        valid: false,
        errors: [`Unknown strategy ID: ${strategyId}`],
      };
    }
    return strategy.validateParameters(params);
  }

  /**
   * Deterministically evaluates a strategy against the provided context.
   * Strictly fails closed if the strategy ID is unknown or parameters are invalid.
   */
  public static evaluate(
    strategyId: string,
    context: StrategyContext,
    params?: StrategyParameters
  ): StrategySignal {
    const strategy = this.getStrategy(strategyId);
    const lineage: StrategySignalLineage = {
      strategyId,
      strategyVersion: '25.0.0-PROD',
      engine: 'StrategyFactory',
      evaluatedAt: context.evaluatedAt,
      asOfDate: context.asOfDate,
      assetClass: context.assetClass,
      sourceSnapshots: {},
    };

    // 1. Unknown strategy guard
    if (!strategy) {
      return UniversalSignalNormalizer.failClosed(
        strategyId,
        context.assetClass,
        context.symbol,
        'INVALID_STRATEGY_ID',
        lineage,
        [`Strategy '${strategyId}' is not registered in StrategyFactory`]
      );
    }

    // 2. Parameter validation guard
    if (params !== undefined) {
      const validation = strategy.validateParameters(params);
      if (!validation.valid) {
        return UniversalSignalNormalizer.failClosed(
          strategy.id,
          strategy.assetClass,
          context.symbol,
          'INVALID_PARAMETERS',
          lineage,
          validation.errors
        );
      }
    }

    // 3. Execution & Normalization
    try {
      const rawSignal = strategy.evaluate(context, params as any);
      return UniversalSignalNormalizer.normalize(rawSignal);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return UniversalSignalNormalizer.failClosed(
        strategy.id,
        strategy.assetClass,
        context.symbol,
        'STRATEGY_EXECUTION_ERROR',
        lineage,
        [msg]
      );
    }
  }
}
