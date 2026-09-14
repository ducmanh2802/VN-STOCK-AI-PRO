/**
 * PHASE 17.6 — TRADE SIMULATOR
 * ==============================
 * Simulates trade execution and position lifecycle deterministically.
 * 
 * STRICT EXECUTION INVARIANTS:
 *   - Signal at Candle T Close -> Queued -> Execution at Candle T+1 Open.
 *   - Commission & Slippage applied explicitly on both Entry and Exit.
 *   - Vietnam Sell Tax applied on Exit.
 *   - Strict Board Lot constraint (default 100 shares in VN market).
 *   - Cash balance strictly non-negative (no unbacked margin).
 */

import type {
  BacktestConfig,
  BacktestExitReason,
  BacktestSignal,
  BacktestTrade,
  EquityPoint,
  HistoricalCandle,
} from './types.ts';

interface OpenPosition {
  readonly id: string;
  readonly symbol: string;
  readonly entryIndex: number;
  readonly entryDate: string;
  readonly entryPrice: number;
  readonly entryGrossValue: number;
  readonly entryCommission: number;
  readonly quantity: number;
  readonly stopLossPrice?: number | null;
  readonly takeProfitPrice?: number | null;
}

interface QueuedOrder {
  readonly action: 'BUY' | 'SELL';
  readonly reason: string;
  readonly stopLoss?: number | null;
  readonly takeProfit?: number | null;
}

export class TradeSimulator {
  private readonly config: Required<BacktestConfig>;
  private cash: number;
  private currentPosition: OpenPosition | null = null;
  private queuedOrder: QueuedOrder | null = null;
  private readonly completedTrades: BacktestTrade[] = [];
  private readonly equityCurve: EquityPoint[] = [];

  constructor(config: BacktestConfig) {
    this.config = {
      symbol: config.symbol,
      initialCapital: config.initialCapital,
      commissionRate: config.commissionRate ?? 0.0015, // 0.15%
      slippageRate: config.slippageRate ?? 0.0010,     // 0.10%
      sellTaxRate: config.sellTaxRate ?? 0.0010,       // 0.10%
      positionSizePct: config.positionSizePct ?? 1.0, // 100% of available cash
      maxHoldingDays: config.maxHoldingDays ?? 250,
      stopLossPct: config.stopLossPct ?? 0.07,         // 7% stop loss
      takeProfitPct: config.takeProfitPct ?? 0.20,     // 20% take profit
      boardLot: config.boardLot ?? 100,
      timeframe: config.timeframe ?? '1D',
    };

    this.cash = this.config.initialCapital;
  }

  /**
   * Processes a single candlestick in historical sequence.
   * 
   * @param candle The current candle being processed
   * @param index Current bar index
   * @param signal Signal generated at this candle's close (or null)
   */
  public processBar(
    candle: HistoricalCandle,
    index: number,
    signal: BacktestSignal | null
  ): void {
    // 1. First: Execute any pending queued orders from previous candle's close at this candle's OPEN
    this.executeQueuedOrders(candle, index);

    // 2. Intra-bar checks for open position (Stop Loss / Take Profit / Max Holding)
    this.checkIntraBarExits(candle, index);

    // 3. Queue new order based on current candle's signal (to be executed at next candle OPEN)
    this.queueSignal(signal);

    // 4. Record Mark-to-Market Equity Point at this bar's close
    const positionValue = this.currentPosition
      ? this.currentPosition.quantity * candle.close
      : 0;
    const totalEquity = Number((this.cash + positionValue).toFixed(2));

    this.equityCurve.push({
      date: candle.timestamp,
      cash: Number(this.cash.toFixed(2)),
      positionValue: Number(positionValue.toFixed(2)),
      totalEquity,
      drawdownPct: 0, // Will be computed in post-metrics
    });
  }

  /**
   * Finalizes backtest by closing any remaining open position at the final candle's close
   */
  public finalize(lastCandle: HistoricalCandle, totalBars: number): {
    trades: readonly BacktestTrade[];
    equityCurve: readonly EquityPoint[];
    finalCapital: number;
  } {
    if (this.currentPosition) {
      this.closePosition(
        lastCandle.close,
        lastCandle.timestamp,
        totalBars - 1,
        'END_OF_DATA',
        false // Do not apply additional slippage on close of test or apply standard
      );
    }

    return {
      trades: Object.freeze([...this.completedTrades]),
      equityCurve: Object.freeze([...this.equityCurve]),
      finalCapital: Number(this.cash.toFixed(2)),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Execution Mechanics
  // ---------------------------------------------------------------------------

  private executeQueuedOrders(candle: HistoricalCandle, currentIndex: number): void {
    if (!this.queuedOrder) {
      return;
    }

    const order = this.queuedOrder;
    this.queuedOrder = null; // Clear queue

    if (order.action === 'BUY' && !this.currentPosition) {
      // Execute BUY at candle OPEN + slippage
      const executionPrice = candle.open * (1 + this.config.slippageRate);
      const allocatedCash = this.cash * this.config.positionSizePct;

      // Calculate quantity adhering to boardLot and covering commission
      const effectiveCostPerShare = executionPrice * (1 + this.config.commissionRate);
      if (effectiveCostPerShare <= 0) return;

      const rawShares = Math.floor(allocatedCash / effectiveCostPerShare);
      const lot = this.config.boardLot;
      const quantity = Math.floor(rawShares / lot) * lot;

      if (quantity <= 0) {
        return; // Insufficient cash to buy a single board lot
      }

      const grossValue = Number((quantity * executionPrice).toFixed(2));
      const commission = Number((grossValue * this.config.commissionRate).toFixed(2));
      const totalOutlay = grossValue + commission;

      if (totalOutlay > this.cash) {
        return; // Safety guard: Cannot exceed cash balance
      }

      this.cash = Number((this.cash - totalOutlay).toFixed(2));

      // Calculate stop loss / take profit prices
      let stopLossPrice = order.stopLoss ?? null;
      let takeProfitPrice = order.takeProfit ?? null;

      if (!stopLossPrice && this.config.stopLossPct > 0) {
        stopLossPrice = executionPrice * (1 - this.config.stopLossPct);
      }
      if (!takeProfitPrice && this.config.takeProfitPct > 0) {
        takeProfitPrice = executionPrice * (1 + this.config.takeProfitPct);
      }

      this.currentPosition = {
        id: `trade_${this.config.symbol}_${currentIndex}_${candle.timestamp}`,
        symbol: this.config.symbol,
        entryIndex: currentIndex,
        entryDate: candle.timestamp,
        entryPrice: Number(executionPrice.toFixed(2)),
        entryGrossValue: grossValue,
        entryCommission: commission,
        quantity,
        stopLossPrice,
        takeProfitPrice,
      };
    } else if (order.action === 'SELL' && this.currentPosition) {
      // Execute SELL at candle OPEN - slippage
      const executionPrice = candle.open * (1 - this.config.slippageRate);
      this.closePosition(
        executionPrice,
        candle.timestamp,
        currentIndex,
        'STRATEGY_SIGNAL'
      );
    }
  }

  private checkIntraBarExits(candle: HistoricalCandle, currentIndex: number): void {
    if (!this.currentPosition) {
      return;
    }

    const pos = this.currentPosition;
    const holdingDays = currentIndex - pos.entryIndex;

    // 1. Stop Loss Check (Low touches or breaches stop loss price)
    if (pos.stopLossPrice && candle.low <= pos.stopLossPrice) {
      // Conservative fill: min(Open, StopLossPrice * (1 - slippage))
      const exitPrice = Math.min(candle.open, pos.stopLossPrice * (1 - this.config.slippageRate));
      this.closePosition(exitPrice, candle.timestamp, currentIndex, 'STOP_LOSS');
      return;
    }

    // 2. Take Profit Check (High touches or breaches take profit price)
    if (pos.takeProfitPrice && candle.high >= pos.takeProfitPrice) {
      // Conservative fill: max(Open, TakeProfitPrice * (1 - slippage))
      const exitPrice = Math.max(candle.open, pos.takeProfitPrice * (1 - this.config.slippageRate));
      this.closePosition(exitPrice, candle.timestamp, currentIndex, 'TAKE_PROFIT');
      return;
    }

    // 3. Max Holding Days Check
    if (this.config.maxHoldingDays && holdingDays >= this.config.maxHoldingDays) {
      const exitPrice = candle.close * (1 - this.config.slippageRate);
      this.closePosition(exitPrice, candle.timestamp, currentIndex, 'MAX_HOLDING_REACHED');
    }
  }

  private queueSignal(signal: BacktestSignal | null): void {
    if (!signal || signal.action === 'HOLD') {
      return;
    }

    if (signal.action === 'BUY' && !this.currentPosition) {
      this.queuedOrder = {
        action: 'BUY',
        reason: signal.reason,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
      };
    } else if (signal.action === 'SELL' && this.currentPosition) {
      this.queuedOrder = {
        action: 'SELL',
        reason: signal.reason,
      };
    }
  }

  private closePosition(
    exitPrice: number,
    exitDate: string,
    exitIndex: number,
    exitReason: BacktestExitReason,
    applyTax: boolean = true
  ): void {
    if (!this.currentPosition) {
      return;
    }

    const pos = this.currentPosition;
    this.currentPosition = null;

    const grossValue = Number((pos.quantity * exitPrice).toFixed(2));
    const commission = Number((grossValue * this.config.commissionRate).toFixed(2));
    const tax = applyTax ? Number((grossValue * this.config.sellTaxRate).toFixed(2)) : 0;
    const netProceeds = Number((grossValue - commission - tax).toFixed(2));

    this.cash = Number((this.cash + netProceeds).toFixed(2));

    const totalEntryCost = pos.entryGrossValue + pos.entryCommission;
    const grossPnL = Number((grossValue - pos.entryGrossValue).toFixed(2));
    const netPnL = Number((netProceeds - totalEntryCost).toFixed(2));
    const returnPct = totalEntryCost > 0
      ? Number(((netPnL / totalEntryCost) * 100).toFixed(2))
      : 0;

    const holdingDays = Math.max(1, exitIndex - pos.entryIndex);

    this.completedTrades.push({
      id: pos.id,
      symbol: pos.symbol,
      side: 'LONG',
      entryDate: pos.entryDate,
      entryPrice: pos.entryPrice,
      entryGrossValue: pos.entryGrossValue,
      entryCommission: pos.entryCommission,
      exitDate,
      exitPrice: Number(exitPrice.toFixed(2)),
      exitGrossValue: grossValue,
      exitCommission: commission,
      exitTax: tax,
      quantity: pos.quantity,
      grossPnL,
      netPnL,
      returnPct,
      holdingDays,
      exitReason,
    });
  }
}
