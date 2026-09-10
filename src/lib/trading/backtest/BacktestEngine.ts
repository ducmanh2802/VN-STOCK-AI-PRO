/**
 * PHASE 18.2 — BACKTEST ENGINE
 * =============================
 * Production-grade backtesting engine with strict anti-lookahead protection,
 * next-open execution, Vietnamese board lot sizing, intrabar stop/target monitoring,
 * and seamless integration with Phase 18.1 RiskManager.
 */

import type { CandleInput } from '../../analysis/common/types.ts';
import { StockAnalysisEngine } from '../../analysis/technical/StockAnalysisEngine.ts';
import { RecommendationEngine } from '../../analysis/strategy/RecommendationEngine.ts';
import type { InvestmentHorizon } from '../../../types/recommendation.ts';
import { RiskManager } from '../risk/RiskManager.ts';
import type {
  RiskConfig,
  RiskContext,
} from '../types/risk.ts';
import { DEFAULT_RISK_CONFIG } from '../types/risk.ts';
import type {
  TradingSignal,
  TradingMarketData,
} from '../types/trading.ts';
import { BacktestDataProvider } from './BacktestDataProvider.ts';
import { BacktestMetrics } from './BacktestMetrics.ts';
import {
  BacktestCandle,
  BacktestConfig,
  BacktestPosition,
  BacktestTrade,
  EquityPoint,
  BacktestPortfolioState,
  BacktestResult,
  PendingOrder,
  BacktestDataError,
} from './BacktestTypes.ts';

export class BacktestEngine {
  private config: Required<
    Omit<BacktestConfig, 'startDate' | 'endDate' | 'strategy' | 'riskConfig'>
  > & {
    startDate?: string;
    endDate?: string;
    strategy: InvestmentHorizon | ((context: any) => TradingSignal | null);
    riskConfig: Partial<RiskConfig>;
  };

  private riskManager: RiskManager;

  constructor(config: BacktestConfig) {
    if (!config.symbol || typeof config.symbol !== 'string') {
      throw new BacktestDataError('Symbol is required for BacktestEngine', 'DATA_UNAVAILABLE');
    }
    if (config.initialCapital === undefined || config.initialCapital <= 0) {
      throw new BacktestDataError('initialCapital must be a positive number', 'INSUFFICIENT_CASH');
    }

    this.config = {
      symbol: config.symbol.toUpperCase().trim(),
      startDate: config.startDate,
      endDate: config.endDate,
      initialCapital: config.initialCapital,
      timeframe: config.timeframe ?? '1D',
      strategy: config.strategy ?? 'SHORT_TERM',
      riskConfig: config.riskConfig ?? {},
      emergencyStop: config.emergencyStop ?? false,
      tradingEnabled: config.tradingEnabled ?? true,
      commissionRate: config.commissionRate ?? 0.0015, // 0.15% brokerage fee
      sellFeeRate: config.sellFeeRate ?? 0.0015, // 0.15% brokerage fee on sell
      taxRate: config.taxRate ?? 0.0010, // 0.10% Vietnam statutory stock sell tax
      slippageRate: config.slippageRate ?? 0.0010, // 0.10% slippage
      allowFractionalShares: config.allowFractionalShares ?? false,
      lotSize: config.lotSize ?? 100, // standard HOSE/HNX lot
      executeOnNextOpen: config.executeOnNextOpen ?? true,
      minWarmupBars: config.minWarmupBars ?? 25,
      closeAtEnd: config.closeAtEnd ?? false,
      riskFreeRate: config.riskFreeRate ?? 0.04,
    };

    this.riskManager = new RiskManager({
      ...DEFAULT_RISK_CONFIG,
      lotSize: this.config.lotSize,
      buyFeeRate: this.config.commissionRate,
      sellTaxRate: this.config.taxRate,
      slippageRate: this.config.slippageRate,
      maxStaleTimeMs: Infinity, // Historical bars are in the past; avoid false staleness rejection against Date.now()
      ...this.config.riskConfig,
    });
  }

  /**
   * Runs the backtest using provided candles or fetches real KBS data.
   */
  async run(providedCandles?: BacktestCandle[]): Promise<BacktestResult> {
    let candles: BacktestCandle[];

    if (providedCandles && providedCandles.length > 0) {
      candles = BacktestDataProvider.validateCandles(providedCandles);
    } else {
      if (!this.config.startDate || !this.config.endDate) {
        throw new BacktestDataError(
          'startDate and endDate are required when candles are not directly provided',
          'DATA_UNAVAILABLE'
        );
      }
      candles = await BacktestDataProvider.getHistoricalData(
        this.config.symbol,
        this.config.startDate,
        this.config.endDate
      );
    }

    return this.executeSimulation(candles);
  }

  /**
   * Deterministic event-driven simulation loop with strict anti-lookahead protection.
   */
  private executeSimulation(candles: BacktestCandle[]): BacktestResult {
    const {
      symbol,
      initialCapital,
      commissionRate,
      sellFeeRate,
      taxRate,
      slippageRate,
      minWarmupBars,
      closeAtEnd,
      riskFreeRate,
    } = this.config;

    const portfolio: BacktestPortfolioState = {
      cash: initialCapital,
      equity: initialCapital,
      marketValue: 0,
      positions: [],
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalFees: 0,
      totalTax: 0,
      totalSlippageCost: 0,
      dailyRealizedLoss: 0,
    };

    const trades: BacktestTrade[] = [];
    const equityCurve: EquityPoint[] = [];
    let pendingOrder: PendingOrder | null = null;
    let tradeCounter = 0;
    let peakEquity = initialCapital;

    // Daily tracking
    let currentDayStr = '';

    for (let t = 0; t < candles.length; t++) {
      const candle = candles[t];
      const candleDay = String(candle.timestamp).substring(0, 10);

      // Reset daily realized loss on new calendar day
      if (candleDay !== currentDayStr) {
        currentDayStr = candleDay;
        portfolio.dailyRealizedLoss = 0;
      }

      // =========================================================================
      // STEP 1: EXECUTE PENDING ORDERS AT OPEN[t]
      // =========================================================================
      if (pendingOrder) {
        if (pendingOrder.side === 'BUY') {
          // BUY Execution at OPEN[t]
          const openPrice = candle.open;
          const executionPrice = Number((openPrice * (1 + slippageRate)).toFixed(2));
          const slippagePerShare = executionPrice - openPrice;

          // Price limit check
          let priceLimitViolation = false;
          if (candle.ceilingPrice && executionPrice > candle.ceilingPrice) {
            priceLimitViolation = true;
          }
          if (candle.floorPrice && executionPrice < candle.floorPrice) {
            priceLimitViolation = true;
          }

          if (!priceLimitViolation) {
            const quantity = pendingOrder.plannedQuantity;
            const grossValue = quantity * executionPrice;
            const buyFee = Number((grossValue * commissionRate).toFixed(2));
            const totalRequiredCash = grossValue + buyFee;

            if (totalRequiredCash <= portfolio.cash && quantity >= this.config.lotSize) {
              portfolio.cash -= totalRequiredCash;
              portfolio.totalFees += buyFee;
              portfolio.totalSlippageCost += slippagePerShare * quantity;

              const position: BacktestPosition = {
                symbol,
                quantity,
                averageCost: executionPrice,
                entryPrice: executionPrice,
                stopLoss: pendingOrder.stopLoss,
                targetPrice: pendingOrder.targetPrice,
                entryTimestamp: candle.timestamp,
                realizedPnL: 0,
                unrealizedPnL: 0,
                fees: buyFee,
                tax: 0,
                slippageCost: slippagePerShare * quantity,
              };
              portfolio.positions.push(position);

              tradeCounter++;
              trades.push({
                tradeId: `T-${tradeCounter}`,
                symbol,
                side: 'BUY',
                signalTimestamp: pendingOrder.signalTimestamp,
                executionTimestamp: candle.timestamp,
                signalPrice: pendingOrder.signalPrice,
                executionPrice,
                quantity,
                stopLoss: pendingOrder.stopLoss,
                targetPrice: pendingOrder.targetPrice,
                grossValue,
                fees: buyFee,
                tax: 0,
                slippage: slippagePerShare * quantity,
                realizedPnL: 0,
                returnPercent: 0,
              });
            }
            // If cash insufficient or quantity invalid, the pending order fails cleanly
          }
        } else if (pendingOrder.side === 'SELL') {
          // SELL Execution at OPEN[t] (triggered by signal at t-1)
          const posIndex = portfolio.positions.findIndex((p) => p.symbol === symbol);
          if (posIndex >= 0) {
            const pos = portfolio.positions[posIndex];
            const openPrice = candle.open;
            let executionPrice = Number((openPrice * (1 - slippageRate)).toFixed(2));
            const slippagePerShare = openPrice - executionPrice;

            // Price limit bounds
            if (candle.floorPrice && executionPrice < candle.floorPrice) {
              executionPrice = candle.floorPrice;
            }
            if (candle.ceilingPrice && executionPrice > candle.ceilingPrice) {
              executionPrice = candle.ceilingPrice;
            }

            const grossValue = pos.quantity * executionPrice;
            const sellTax = Number((grossValue * taxRate).toFixed(2));
            const sellFee = Number((grossValue * sellFeeRate).toFixed(2));
            const netProceeds = grossValue - sellTax - sellFee;
            const totalBuyCost = pos.quantity * pos.averageCost + pos.fees;
            const realizedPnL = Number((netProceeds - totalBuyCost).toFixed(2));
            const returnPercent = totalBuyCost > 0 ? Number(((realizedPnL / totalBuyCost) * 100).toFixed(2)) : 0;

            portfolio.cash += netProceeds;
            portfolio.realizedPnL += realizedPnL;
            portfolio.totalFees += sellFee;
            portfolio.totalTax += sellTax;
            portfolio.totalSlippageCost += slippagePerShare * pos.quantity;

            if (realizedPnL < 0) {
              portfolio.dailyRealizedLoss += Math.abs(realizedPnL);
            }

            tradeCounter++;
            trades.push({
              tradeId: `T-${tradeCounter}`,
              symbol,
              side: 'SELL',
              signalTimestamp: pendingOrder.signalTimestamp,
              executionTimestamp: candle.timestamp,
              signalPrice: pendingOrder.signalPrice,
              executionPrice,
              quantity: pos.quantity,
              stopLoss: pos.stopLoss,
              targetPrice: pos.targetPrice,
              grossValue,
              fees: sellFee,
              tax: sellTax,
              slippage: slippagePerShare * pos.quantity,
              realizedPnL,
              returnPercent,
              exitReason: pendingOrder.exitReason ?? 'SIGNAL',
            });

            portfolio.positions.splice(posIndex, 1);
          }
        }
        pendingOrder = null;
      }

      // =========================================================================
      // STEP 2: INTRABAR STOP LOSS & TARGET MONITORING
      // =========================================================================
      const posIndex = portfolio.positions.findIndex((p) => p.symbol === symbol);
      if (posIndex >= 0) {
        const pos = portfolio.positions[posIndex];
        const stopTriggered = candle.low <= pos.stopLoss;
        const targetTriggered = candle.high >= pos.targetPrice;

        if (stopTriggered || targetTriggered) {
          // CONSERVATIVE RULE:
          // If a candle hits both Stop Loss and Target, STOP LOSS MUST TAKE PRECEDENCE.
          // Because the intrabar sequence of highs/lows is unknowable from OHLCV alone,
          // sound risk management dictates assuming adverse movement occurred first.
          const isStopLoss = stopTriggered; // If both triggered, stopTriggered wins first

          let rawExitPrice: number;
          let exitReason: 'STOP_LOSS' | 'TARGET';

          if (isStopLoss) {
            exitReason = 'STOP_LOSS';
            // If the bar opened below stopLoss (gap down), fill at open; otherwise fill at stopLoss
            rawExitPrice = candle.open < pos.stopLoss ? candle.open : pos.stopLoss;
          } else {
            exitReason = 'TARGET';
            // If the bar opened above targetPrice (gap up), fill at open; otherwise fill at targetPrice
            rawExitPrice = candle.open > pos.targetPrice ? candle.open : pos.targetPrice;
          }

          // Apply slippage on sell
          let executionPrice = Number((rawExitPrice * (1 - slippageRate)).toFixed(2));
          if (candle.floorPrice && executionPrice < candle.floorPrice) {
            executionPrice = candle.floorPrice;
          }
          if (candle.ceilingPrice && executionPrice > candle.ceilingPrice) {
            executionPrice = candle.ceilingPrice;
          }

          const slippagePerShare = Math.max(0, rawExitPrice - executionPrice);
          const grossValue = pos.quantity * executionPrice;
          const sellTax = Number((grossValue * taxRate).toFixed(2));
          const sellFee = Number((grossValue * sellFeeRate).toFixed(2));
          const netProceeds = grossValue - sellTax - sellFee;
          const totalBuyCost = pos.quantity * pos.averageCost + pos.fees;
          const realizedPnL = Number((netProceeds - totalBuyCost).toFixed(2));
          const returnPercent = totalBuyCost > 0 ? Number(((realizedPnL / totalBuyCost) * 100).toFixed(2)) : 0;

          portfolio.cash += netProceeds;
          portfolio.realizedPnL += realizedPnL;
          portfolio.totalFees += sellFee;
          portfolio.totalTax += sellTax;
          portfolio.totalSlippageCost += slippagePerShare * pos.quantity;

          if (realizedPnL < 0) {
            portfolio.dailyRealizedLoss += Math.abs(realizedPnL);
          }

          tradeCounter++;
          trades.push({
            tradeId: `T-${tradeCounter}`,
            symbol,
            side: 'SELL',
            signalTimestamp: pos.entryTimestamp,
            executionTimestamp: candle.timestamp,
            signalPrice: rawExitPrice,
            executionPrice,
            quantity: pos.quantity,
            stopLoss: pos.stopLoss,
            targetPrice: pos.targetPrice,
            grossValue,
            fees: sellFee,
            tax: sellTax,
            slippage: slippagePerShare * pos.quantity,
            realizedPnL,
            returnPercent,
            exitReason,
          });

          portfolio.positions.splice(posIndex, 1);
        }
      }

      // =========================================================================
      // STEP 3: RECORD EQUITY SNAPSHOT AT CLOSE[t]
      // =========================================================================
      let currentPositionValue = 0;
      for (const pos of portfolio.positions) {
        currentPositionValue += pos.quantity * candle.close;
        pos.unrealizedPnL = pos.quantity * candle.close - (pos.quantity * pos.averageCost);
      }
      portfolio.marketValue = currentPositionValue;
      portfolio.equity = Number((portfolio.cash + currentPositionValue).toFixed(2));

      if (portfolio.equity > peakEquity) {
        peakEquity = portfolio.equity;
      }
      const currentDrawdown = peakEquity > 0 ? (portfolio.equity - peakEquity) / peakEquity : 0;

      equityCurve.push({
        timestamp: candle.timestamp,
        cash: portfolio.cash,
        positionValue: currentPositionValue,
        equity: portfolio.equity,
        drawdown: currentDrawdown,
      });

      // =========================================================================
      // STEP 4: SIGNAL GENERATION AT CLOSE[t] (FOR EXECUTION AT OPEN[t+1])
      // =========================================================================
      // Warmup check: need sufficient history for technical indicators
      if (t < minWarmupBars) {
        continue;
      }

      // CRITICAL ANTI-LOOKAHEAD RULE:
      // If t is the final candle (t === candles.length - 1), there is no t+1 bar.
      // Therefore, signal cannot execute on next open. NO_EXECUTION.
      if (t === candles.length - 1) {
        continue;
      }

      // Strategy only receives history up to index t: candles[0...t]
      const visibleCandles = candles.slice(0, t + 1);
      const hasOpenPosition = portfolio.positions.some((p) => p.symbol === symbol);

      let signal: TradingSignal | null = null;

      if (typeof this.config.strategy === 'function') {
        signal = this.config.strategy({
          symbol,
          candles: visibleCandles,
          currentIndex: t,
          currentCandle: candle,
          portfolio: Object.freeze({ ...portfolio }),
        });
      } else {
        // Standard AI Strategy & Technical Analysis Engine
        signal = this.generateStrategySignal(visibleCandles, candle, this.config.strategy);
      }

      if (!signal) continue;

      if (signal.signal === 'BUY' && !hasOpenPosition) {
        const marketData: TradingMarketData = {
          symbol,
          price: candle.close,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          referencePrice: candle.referencePrice ?? candle.open,
          ceilingPrice: candle.ceilingPrice ?? Math.round(candle.open * 1.07),
          floorPrice: candle.floorPrice ?? Math.round(candle.open * 0.93),
          // Omit timestamp from TradingMarketData to prevent real-time staleness check against Date.now()
          dataSource: 'KBS',
        };

        const riskContext: RiskContext = {
          accountEquity: portfolio.equity,
          availableCash: portfolio.cash,
          currentExposure: portfolio.marketValue,
          openPositionsCount: portfolio.positions.length,
          dailyRealizedLoss: portfolio.dailyRealizedLoss,
          tradingEnabled: this.config.tradingEnabled ?? true,
          emergencyStop: this.config.emergencyStop ?? false,
          isMarketOpen: true,
          existingSymbols: portfolio.positions.map((p) => p.symbol),
        };

        const decision = this.riskManager.evaluateTrade(signal, marketData, riskContext);

        if (
          decision.decision === 'APPROVED_TRADE' &&
          decision.signal === 'BUY' &&
          decision.quantity >= this.config.lotSize
        ) {
          pendingOrder = {
            orderId: `ORD-${t + 1}`,
            symbol,
            side: 'BUY',
            plannedQuantity: decision.quantity,
            signalPrice: candle.close,
            stopLoss: signal.stopLoss,
            targetPrice: signal.targetPrice,
            signalTimestamp: candle.timestamp,
            reasons: signal.reasons,
          };
        }
      } else if (signal.signal === 'SELL' && hasOpenPosition) {
        const pos = portfolio.positions.find((p) => p.symbol === symbol);
        if (pos) {
          pendingOrder = {
            orderId: `ORD-${t + 1}`,
            symbol,
            side: 'SELL',
            plannedQuantity: pos.quantity,
            signalPrice: candle.close,
            stopLoss: pos.stopLoss,
            targetPrice: pos.targetPrice,
            signalTimestamp: candle.timestamp,
            reasons: signal.reasons,
            exitReason: 'SIGNAL',
          };
        }
      }
    }

    // Optional: force close open positions at end of backtest if configured
    if (closeAtEnd && portfolio.positions.length > 0) {
      const lastCandle = candles[candles.length - 1];
      for (const pos of [...portfolio.positions]) {
        let executionPrice = Number((lastCandle.close * (1 - slippageRate)).toFixed(2));
        if (lastCandle.floorPrice && executionPrice < lastCandle.floorPrice) {
          executionPrice = lastCandle.floorPrice;
        }
        const grossValue = pos.quantity * executionPrice;
        const sellTax = Number((grossValue * taxRate).toFixed(2));
        const sellFee = Number((grossValue * sellFeeRate).toFixed(2));
        const netProceeds = grossValue - sellTax - sellFee;
        const totalBuyCost = pos.quantity * pos.averageCost + pos.fees;
        const realizedPnL = Number((netProceeds - totalBuyCost).toFixed(2));
        const returnPercent = totalBuyCost > 0 ? Number(((realizedPnL / totalBuyCost) * 100).toFixed(2)) : 0;

        portfolio.cash += netProceeds;
        portfolio.realizedPnL += realizedPnL;
        portfolio.totalFees += sellFee;
        portfolio.totalTax += sellTax;

        tradeCounter++;
        trades.push({
          tradeId: `T-${tradeCounter}`,
          symbol,
          side: 'SELL',
          signalTimestamp: pos.entryTimestamp,
          executionTimestamp: lastCandle.timestamp,
          signalPrice: lastCandle.close,
          executionPrice,
          quantity: pos.quantity,
          stopLoss: pos.stopLoss,
          targetPrice: pos.targetPrice,
          grossValue,
          fees: sellFee,
          tax: sellTax,
          slippage: (lastCandle.close - executionPrice) * pos.quantity,
          realizedPnL,
          returnPercent,
          exitReason: 'END_OF_BACKTEST',
        });
      }
      portfolio.positions = [];
      portfolio.marketValue = 0;
      portfolio.equity = portfolio.cash;
    }

    return BacktestMetrics.compute({
      symbol,
      initialCapital,
      finalEquity: portfolio.equity,
      trades,
      equityCurve,
      totalFees: portfolio.totalFees,
      totalTax: portfolio.totalTax,
      totalSlippageCost: portfolio.totalSlippageCost,
      riskFreeRate,
    });
  }

  /**
   * Translates candles up to t into a TradingSignal using RecommendationEngine.
   */
  private generateStrategySignal(
    visibleCandles: BacktestCandle[],
    currentCandle: BacktestCandle,
    horizon: InvestmentHorizon
  ): TradingSignal | null {
    const candleInputs: CandleInput[] = visibleCandles.map((c) => ({
      time: String(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    const analysis = StockAnalysisEngine.analyze({ candles: candleInputs });
    const supportPrice = analysis.supportResistance.supportLevels[0]?.price ?? null;
    const resistancePrice = analysis.supportResistance.resistanceLevels[0]?.price ?? null;

    const rec = RecommendationEngine.generate({
      symbol: this.config.symbol,
      strategy: horizon,
      currentPrice: currentCandle.close,
      scores: {
        technicalScore: analysis.score,
        fundamentalScore: 65,
        momentumScore: 65,
        valuationScore: 65,
        moneyFlowScore: 65,
        riskScore: 35,
      },
      supportPrice,
      resistancePrice,
      rsi: analysis.indicators.rsi14,
    });

    if (rec.signal === 'HOLD') {
      return null;
    }

    return {
      symbol: this.config.symbol,
      signal: rec.signal,
      confidence: rec.confidence,
      score: rec.score,
      entryPrice: currentCandle.close,
      targetPrice: rec.targetPrice ?? Math.round(currentCandle.close * 1.15),
      stopLoss: rec.stopLoss ?? Math.round(currentCandle.close * 0.95),
      riskReward: rec.riskReward ?? 2.5,
      strategy: horizon,
      timestamp: currentCandle.timestamp,
      reasons: rec.reasons,
      dataSource: 'KBS',
    };
  }
}
