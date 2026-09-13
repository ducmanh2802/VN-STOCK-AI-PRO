/**
 * PHASE 18.3.6 — FINANCIAL CONSERVATION INVARIANTS
 * ===============================================
 * Mathematically enforced financial conservation laws throughout Paper Trading and Replay.
 * 
 * Guarantees that financial state is strictly conserved across:
 *   Initial Account State -> Validated Order -> Execution / Partial Fills -> Fees / Taxes -> Settlement -> Final Account State
 * 
 * Invariants:
 *   1. Cash Conservation: cash_after = cash_before - buy_outflow (BUY) or cash_before + net_proceeds (SELL)
 *   2. Position Conservation: position_after = position_before + bought - sold (no short selling)
 *   3. Lot Size Conservation: quantity % 100 === 0 && quantity > 0 (board lot = 100 shares)
 *   4. Buy Value Conservation: gross_buy_value = price * quantity; outflow = gross + fee
 *   5. Sell Value Conservation: gross_sell_value = price * quantity; proceeds = gross - fee - tax
 *   6. Fee Conservation: expected_fee = Math.round(gross_value * 0.0015)
 *   7. Tax Conservation: expected_tax = Math.round(gross_value * 0.0010) for SELL; 0 for BUY
 *   8. PnL Conservation: realizedPnL = net_proceeds - costBasis (costBasis = sold_qty * avgCost)
 *   9. Equity Conservation: equity = cash + sum(pos_qty * mark_price)
 *  10. Partial Fill Conservation: sum(fills) <= ordered_quantity; sum(fills) === ordered_quantity on FILLED
 *  11. Double-Count Protection: zero duplicate fills, fees, taxes, settlements, or cash/share movements
 * 
 * PURE, DETERMINISTIC, NON-MUTATING, FAIL-CLOSED.
 */

import type {
  BrokerAccount,
  BrokerPosition,
} from '../execution/BrokerAdapter.ts';
import type {
  OrderSide,
  OrderStatus,
  TradingCostConfig,
} from '../types/trading.ts';
import { DEFAULT_TRADING_COST_CONFIG } from '../types/trading.ts';
import type {
  ReplayEvent,
  ReplayExecutionSummary,
  ReplayMismatch,
} from './types.ts';

export interface FinancialConservationOptions {
  readonly tradingCosts?: Partial<TradingCostConfig>;
  readonly orderedQuantity?: number;
  readonly referencePrice?: number;
  readonly allowOddLot?: boolean;
}

export interface FinancialValidationResult {
  readonly isValid: boolean;
  readonly mismatches: readonly ReplayMismatch[];
  readonly error?: string;
}

export interface SingleExecutionConservationInput {
  readonly side: OrderSide;
  readonly symbol: string;
  readonly requestedQuantity: number;
  readonly executedQuantity: number;
  readonly executedPrice: number | null;
  readonly fee: number;
  readonly tax: number;
  readonly status: OrderStatus;
  readonly cashBefore: number;
  readonly cashAfter?: number;
  readonly positionBefore: number;
  readonly positionAfter?: number;
  readonly averageCost?: number;
  readonly realizedPnL?: number;
  readonly equityBefore?: number;
  readonly equityAfter?: number;
  readonly markPrice?: number;
  readonly tradingCosts?: Partial<TradingCostConfig>;
}

export class FinancialConservationValidator {
  public static readonly VIETNAM_BOARD_LOT = 100;
  public static readonly DEFAULT_FEE_RATE = DEFAULT_TRADING_COST_CONFIG.buyFeeRate; // 0.0015 (0.15%)
  public static readonly DEFAULT_TAX_RATE = DEFAULT_TRADING_COST_CONFIG.sellTaxRate; // 0.0010 (0.10%)

  /**
   * Validates a single trade execution against financial conservation invariants.
   * Pure, non-mutating.
   */
  static validateSingleExecution(
    input: SingleExecutionConservationInput
  ): FinancialValidationResult {
    const mismatches: ReplayMismatch[] = [];
    const costs = {
      feeRate:
        input.side === 'BUY'
          ? (input.tradingCosts?.buyFeeRate ?? this.DEFAULT_FEE_RATE)
          : (input.tradingCosts?.sellFeeRate ?? this.DEFAULT_FEE_RATE),
      taxRate: input.tradingCosts?.sellTaxRate ?? this.DEFAULT_TAX_RATE,
    };

    // If order was rejected / cancelled without fill, executed quantity must be 0 and no fees/taxes
    if (input.status === 'REJECTED' || input.status === 'CANCELLED' || input.status === 'FAILED') {
      if (input.executedQuantity > 0) {
        mismatches.push({
          code: 'TRADE_VALUE_CONSERVATION_FAILED',
          field: 'executedQuantity',
          expected: 0,
          actual: input.executedQuantity,
          message: `Non-zero executed quantity (${input.executedQuantity}) on ${input.status} order`,
        });
      }
      if (input.fee > 0) {
        mismatches.push({
          code: 'FEE_CONSERVATION_FAILED',
          field: 'fee',
          expected: 0,
          actual: input.fee,
          message: `Unexplained fee charged (${input.fee}) on ${input.status} order`,
        });
      }
      if (input.tax > 0) {
        mismatches.push({
          code: 'TAX_CONSERVATION_FAILED',
          field: 'tax',
          expected: 0,
          actual: input.tax,
          message: `Unexplained tax charged (${input.tax}) on ${input.status} order`,
        });
      }
      if (input.cashAfter !== undefined && input.cashAfter !== input.cashBefore) {
        mismatches.push({
          code: 'CASH_CONSERVATION_FAILED',
          field: 'cashAfter',
          expected: input.cashBefore,
          actual: input.cashAfter,
          message: `Cash altered (${input.cashBefore} -> ${input.cashAfter}) on non-filled order`,
        });
      }
      if (input.positionAfter !== undefined && input.positionAfter !== input.positionBefore) {
        mismatches.push({
          code: 'POSITION_CONSERVATION_FAILED',
          field: 'positionAfter',
          expected: input.positionBefore,
          actual: input.positionAfter,
          message: `Position altered (${input.positionBefore} -> ${input.positionAfter}) on non-filled order`,
        });
      }
      const isValid = mismatches.length === 0;
      return {
        isValid,
        mismatches,
        error: isValid ? undefined : mismatches.map(m => m.message).join('; '),
      };
    }

    // Filled or partially filled execution validation
    const qty = input.executedQuantity;
    const price = input.executedPrice ?? 0;

    // 1. Lot Size Conservation
    if (qty <= 0) {
      mismatches.push({
        code: 'LOT_SIZE_CONSERVATION_FAILED',
        field: 'executedQuantity',
        expected: '> 0',
        actual: qty,
        message: `Executed quantity must be positive: received ${qty}`,
      });
    } else if (qty % this.VIETNAM_BOARD_LOT !== 0) {
      mismatches.push({
        code: 'LOT_SIZE_CONSERVATION_FAILED',
        field: 'executedQuantity',
        expected: `Multiple of ${this.VIETNAM_BOARD_LOT}`,
        actual: qty,
        message: `Board lot violation: executed quantity ${qty} must be an integer multiple of ${this.VIETNAM_BOARD_LOT}`,
      });
    }

    // 2. Trade Value Conservation
    if (price <= 0) {
      mismatches.push({
        code: 'TRADE_VALUE_CONSERVATION_FAILED',
        field: 'executedPrice',
        expected: '> 0',
        actual: price,
        message: `Executed price must be strictly positive: received ${price}`,
      });
    }

    const grossValue = qty * price;

    // 3. Fee Conservation
    const expectedFee = Math.round(grossValue * costs.feeRate);
    if (input.fee < 0) {
      mismatches.push({
        code: 'FEE_CONSERVATION_FAILED',
        field: 'fee',
        expected: '>= 0',
        actual: input.fee,
        message: `Negative fee detected: ${input.fee}`,
      });
    } else if (input.fee !== expectedFee) {
      mismatches.push({
        code: 'FEE_CONSERVATION_FAILED',
        field: 'fee',
        expected: expectedFee,
        actual: input.fee,
        message: `Fee conservation violation: expected ${expectedFee} VND (0.15%), recorded ${input.fee} VND`,
      });
    }

    // 4. Tax Conservation
    const expectedTax =
      input.side === 'SELL' ? Math.round(grossValue * costs.taxRate) : 0;
    if (input.tax < 0) {
      mismatches.push({
        code: 'TAX_CONSERVATION_FAILED',
        field: 'tax',
        expected: '>= 0',
        actual: input.tax,
        message: `Negative tax detected: ${input.tax}`,
      });
    } else if (input.side === 'BUY' && input.tax > 0) {
      mismatches.push({
        code: 'TAX_CONSERVATION_FAILED',
        field: 'tax',
        expected: 0,
        actual: input.tax,
        message: `BUY transaction incorrectly taxed: recorded ${input.tax} VND tax, expected 0 VND`,
      });
    } else if (input.side === 'SELL' && input.tax !== expectedTax) {
      mismatches.push({
        code: 'TAX_CONSERVATION_FAILED',
        field: 'tax',
        expected: expectedTax,
        actual: input.tax,
        message: `SELL tax conservation violation: expected ${expectedTax} VND (0.10%), recorded ${input.tax} VND`,
      });
    }

    // 5. Cash Conservation
    let expectedCashAfter: number;
    if (input.side === 'BUY') {
      const buyOutflow = grossValue + expectedFee;
      expectedCashAfter = input.cashBefore - buyOutflow;
    } else {
      const netProceeds = grossValue - expectedFee - expectedTax;
      expectedCashAfter = input.cashBefore + netProceeds;
    }

    if (expectedCashAfter < 0) {
      mismatches.push({
        code: 'CASH_CONSERVATION_FAILED',
        field: 'cashAfter',
        expected: '>= 0',
        actual: expectedCashAfter,
        message: `Cash conservation failure: insufficient cash for transaction, resulting in negative cash balance ${expectedCashAfter} VND`,
      });
    }

    if (input.cashAfter !== undefined && input.cashAfter !== expectedCashAfter) {
      mismatches.push({
        code: 'CASH_CONSERVATION_FAILED',
        field: 'cashAfter',
        expected: expectedCashAfter,
        actual: input.cashAfter,
        message: `Cash conservation violation: expected ${expectedCashAfter} VND, recorded ${input.cashAfter} VND (delta: ${input.cashAfter - expectedCashAfter} VND)`,
      });
    }

    // 6. Position Conservation
    let expectedPositionAfter: number;
    if (input.side === 'BUY') {
      expectedPositionAfter = input.positionBefore + qty;
    } else {
      expectedPositionAfter = input.positionBefore - qty;
    }

    if (expectedPositionAfter < 0) {
      mismatches.push({
        code: 'POSITION_CONSERVATION_FAILED',
        field: 'positionAfter',
        expected: '>= 0',
        actual: expectedPositionAfter,
        message: `Position conservation failure: short selling prohibited. Selling ${qty} from position of ${input.positionBefore} results in ${expectedPositionAfter}`,
      });
    }

    if (
      input.positionAfter !== undefined &&
      input.positionAfter !== expectedPositionAfter
    ) {
      mismatches.push({
        code: 'POSITION_CONSERVATION_FAILED',
        field: 'positionAfter',
        expected: expectedPositionAfter,
        actual: input.positionAfter,
        message: `Position conservation violation: expected ${expectedPositionAfter} shares, recorded ${input.positionAfter} shares (delta: ${input.positionAfter - expectedPositionAfter})`,
      });
    }

    // 7. Realized PnL Conservation (SELL only)
    if (input.side === 'SELL') {
      const avgCost = input.averageCost ?? price;
      const costBasis = qty * avgCost;
      const netProceeds = grossValue - expectedFee - expectedTax;
      const expectedRealizedPnL = netProceeds - costBasis;

      if (
        input.realizedPnL !== undefined &&
        input.realizedPnL !== expectedRealizedPnL
      ) {
        mismatches.push({
          code: 'PNL_CONSERVATION_FAILED',
          field: 'realizedPnL',
          expected: expectedRealizedPnL,
          actual: input.realizedPnL,
          message: `Realized PnL conservation violation: expected ${expectedRealizedPnL} VND (netProceeds ${netProceeds} - costBasis ${costBasis}), recorded ${input.realizedPnL} VND`,
        });
      }
    } else if (input.side === 'BUY') {
      if (input.realizedPnL !== undefined && input.realizedPnL !== 0) {
        mismatches.push({
          code: 'PNL_CONSERVATION_FAILED',
          field: 'realizedPnL',
          expected: 0,
          actual: input.realizedPnL,
          message: `BUY transaction cannot generate realized PnL: recorded ${input.realizedPnL} VND`,
        });
      }
    }

    // 8. Equity Conservation
    if (input.equityBefore !== undefined && input.equityAfter !== undefined) {
      const markPrice = input.markPrice ?? price;
      const posValueBefore = input.positionBefore * markPrice;
      const posValueAfter = expectedPositionAfter * markPrice;
      const expectedEquityAfter = expectedCashAfter + posValueAfter;

      // Note: at execution price, equity delta is exactly -(fee + tax)
      if (input.equityAfter !== expectedEquityAfter) {
        mismatches.push({
          code: 'EQUITY_CONSERVATION_FAILED',
          field: 'equityAfter',
          expected: expectedEquityAfter,
          actual: input.equityAfter,
          message: `Equity conservation violation: expected ${expectedEquityAfter} VND, recorded ${input.equityAfter} VND (delta: ${input.equityAfter - expectedEquityAfter} VND)`,
        });
      }
    }

    const isValid = mismatches.length === 0;
    return {
      isValid,
      mismatches,
      error: isValid ? undefined : mismatches.map(m => m.message).join('; '),
    };
  }

  /**
   * Validates an entire event sequence for financial conservation laws.
   * Tracks running cash, positions, fees, taxes, and fills step-by-step.
   */
  static validateEventSequence(
    events: readonly ReplayEvent[],
    initialAccount?: BrokerAccount,
    options?: FinancialConservationOptions
  ): FinancialValidationResult {
    const mismatches: ReplayMismatch[] = [];

    if (!events || events.length === 0) {
      return { isValid: true, mismatches: [] };
    }

    // Establish initial baseline state
    let runningCash = initialAccount?.cash ?? 500_000_000;
    const initialPositions = new Map<string, { quantity: number; averageCost: number }>();
    if (initialAccount?.positions) {
      for (const p of initialAccount.positions) {
        initialPositions.set(p.symbol.toUpperCase(), {
          quantity: p.quantity,
          averageCost: p.averageCost ?? (p as any).averageBuyPrice ?? 0,
        });
      }
    }

    // State tracking across sequence
    const seenEventIds = new Set<string>();
    const seenExecutionIds = new Set<string>();
    let settlementCount = 0;
    let totalExecutedQuantity = 0;
    let totalFees = 0;
    let totalTaxes = 0;
    let totalRealizedPnL = 0;
    let side: OrderSide | undefined;
    let symbol: string | undefined;

    const feeRate = options?.tradingCosts?.buyFeeRate ?? this.DEFAULT_FEE_RATE;
    const taxRate = options?.tradingCosts?.sellTaxRate ?? this.DEFAULT_TAX_RATE;
    const orderedQuantity = options?.orderedQuantity;

    for (const evt of events) {
      // Check duplicate eventId
      if (seenEventIds.has(evt.eventId)) {
        mismatches.push({
          code: 'DOUBLE_COUNT_DETECTED',
          field: 'eventId',
          expected: 'unique eventId',
          actual: evt.eventId,
          message: `Duplicate event processed in sequence: ${evt.eventId}`,
        });
      }
      seenEventIds.add(evt.eventId);

      // Detect duplicate settlements
      if (evt.eventType === 'ORDER_SETTLED' || evt.nextState === 'SETTLED') {
        settlementCount++;
        if (settlementCount > 1) {
          mismatches.push({
            code: 'DOUBLE_COUNT_DETECTED',
            field: 'eventType',
            expected: 'at most one ORDER_SETTLED event',
            actual: `${settlementCount} settlements`,
            message: `Duplicate settlement event detected: order was already settled`,
          });
        }
      }

      // Check fill events (PARTIALLY_FILLED or FILLED)
      const isFillEvent =
        evt.eventType === 'ORDER_PARTIALLY_FILLED' ||
        evt.eventType === 'ORDER_FILLED' ||
        evt.nextState === 'PARTIALLY_FILLED' ||
        evt.nextState === 'FILLED';

      if (isFillEvent) {
        const executionId = (evt.metadata?.executionId as string) ?? evt.eventId;
        if (seenExecutionIds.has(executionId)) {
          mismatches.push({
            code: 'DOUBLE_COUNT_DETECTED',
            field: 'executionId',
            expected: 'unique execution event',
            actual: executionId,
            message: `Duplicate execution detected: fill event ${executionId} processed more than once`,
          });
        }
        seenExecutionIds.add(executionId);

        const fillQty = evt.quantity ?? 0;
        const fillPrice = evt.price ?? 0;
        const fillSide: OrderSide = (evt.metadata?.side as OrderSide) ?? 'BUY';
        const fillSymbol: string = ((evt.metadata?.symbol as string) ?? 'UNKNOWN').toUpperCase();

        if (!side) side = fillSide;
        if (!symbol) symbol = fillSymbol;

        // 1. Lot size conservation
        if (fillQty <= 0) {
          mismatches.push({
            code: 'LOT_SIZE_CONSERVATION_FAILED',
            field: `event[${evt.sequenceNumber}].quantity`,
            expected: '> 0',
            actual: fillQty,
            message: `Fill quantity must be strictly positive: received ${fillQty}`,
          });
        } else if (fillQty % this.VIETNAM_BOARD_LOT !== 0 && !options?.allowOddLot) {
          mismatches.push({
            code: 'LOT_SIZE_CONSERVATION_FAILED',
            field: `event[${evt.sequenceNumber}].quantity`,
            expected: `Multiple of ${this.VIETNAM_BOARD_LOT}`,
            actual: fillQty,
            message: `Board lot violation on fill: ${fillQty} is not a multiple of ${this.VIETNAM_BOARD_LOT}`,
          });
        }

        // 2. Price conservation
        if (fillPrice <= 0) {
          mismatches.push({
            code: 'TRADE_VALUE_CONSERVATION_FAILED',
            field: `event[${evt.sequenceNumber}].price`,
            expected: '> 0',
            actual: fillPrice,
            message: `Fill price must be strictly positive: received ${fillPrice}`,
          });
        }

        const grossTradeValue = fillQty * fillPrice;

        // Check if metadata has reported gross/trade value
        if (evt.metadata?.grossValue !== undefined && evt.metadata.grossValue !== grossTradeValue) {
          mismatches.push({
            code: 'TRADE_VALUE_CONSERVATION_FAILED',
            field: `event[${evt.sequenceNumber}].metadata.grossValue`,
            expected: grossTradeValue,
            actual: evt.metadata.grossValue,
            message: `Trade value contradiction: price ${fillPrice} * qty ${fillQty} = ${grossTradeValue}, but recorded ${evt.metadata.grossValue}`,
          });
        }

        // 3. Fee conservation
        const expectedFee = Math.round(grossTradeValue * feeRate);
        if (evt.fee !== undefined) {
          if (evt.fee < 0) {
            mismatches.push({
              code: 'FEE_CONSERVATION_FAILED',
              field: `event[${evt.sequenceNumber}].fee`,
              expected: '>= 0',
              actual: evt.fee,
              message: `Negative fee in event: ${evt.fee}`,
            });
          } else if (evt.fee !== expectedFee) {
            mismatches.push({
              code: 'FEE_CONSERVATION_FAILED',
              field: `event[${evt.sequenceNumber}].fee`,
              expected: expectedFee,
              actual: evt.fee,
              message: `Fee conservation violation in event: expected ${expectedFee}, recorded ${evt.fee}`,
            });
          }
        }
        totalFees += expectedFee;

        // 4. Tax conservation
        const expectedTax = fillSide === 'SELL' ? Math.round(grossTradeValue * taxRate) : 0;
        if (evt.tax !== undefined) {
          if (evt.tax < 0) {
            mismatches.push({
              code: 'TAX_CONSERVATION_FAILED',
              field: `event[${evt.sequenceNumber}].tax`,
              expected: '>= 0',
              actual: evt.tax,
              message: `Negative tax in event: ${evt.tax}`,
            });
          } else if (fillSide === 'BUY' && evt.tax > 0) {
            mismatches.push({
              code: 'TAX_CONSERVATION_FAILED',
              field: `event[${evt.sequenceNumber}].tax`,
              expected: 0,
              actual: evt.tax,
              message: `BUY execution incorrectly taxed: recorded ${evt.tax} VND`,
            });
          } else if (fillSide === 'SELL' && evt.tax !== expectedTax) {
            mismatches.push({
              code: 'TAX_CONSERVATION_FAILED',
              field: `event[${evt.sequenceNumber}].tax`,
              expected: expectedTax,
              actual: evt.tax,
              message: `SELL tax conservation violation in event: expected ${expectedTax}, recorded ${evt.tax}`,
            });
          }
        }
        totalTaxes += expectedTax;

        // 5. Partial fill & Cumulative Quantity Conservation
        totalExecutedQuantity += fillQty;
        if (orderedQuantity !== undefined && totalExecutedQuantity > orderedQuantity) {
          mismatches.push({
            code: 'PARTIAL_FILL_CONSERVATION_FAILED',
            field: 'cumulativeQuantity',
            expected: `<= ${orderedQuantity}`,
            actual: totalExecutedQuantity,
            message: `Overfill violation: cumulative executed quantity (${totalExecutedQuantity}) exceeds ordered quantity (${orderedQuantity})`,
          });
        }

        // 6. Cash and Position updates
        const posRecord = initialPositions.get(fillSymbol) ?? { quantity: 0, averageCost: fillPrice };
        if (fillSide === 'BUY') {
          const cashDeduction = grossTradeValue + expectedFee;
          runningCash -= cashDeduction;

          if (runningCash < 0) {
            mismatches.push({
              code: 'CASH_CONSERVATION_FAILED',
              field: 'runningCash',
              expected: '>= 0',
              actual: runningCash,
              message: `Cash conservation failure: balance dropped negative (${runningCash} VND) after BUY fill`,
            });
          }

          const newQty = posRecord.quantity + fillQty;
          const newAvgCost = (posRecord.quantity * posRecord.averageCost + cashDeduction) / newQty;
          posRecord.quantity = newQty;
          posRecord.averageCost = newAvgCost;
          initialPositions.set(fillSymbol, posRecord);
        } else {
          // SELL
          const netProceeds = grossTradeValue - expectedFee - expectedTax;
          runningCash += netProceeds;

          const remainingQty = posRecord.quantity - fillQty;
          if (remainingQty < 0) {
            mismatches.push({
              code: 'POSITION_CONSERVATION_FAILED',
              field: 'runningPosition',
              expected: '>= 0',
              actual: remainingQty,
              message: `Position conservation failure: short selling prohibited (held ${posRecord.quantity}, attempted to sell ${fillQty})`,
            });
          }

          const costBasis = fillQty * posRecord.averageCost;
          const eventPnL = netProceeds - costBasis;
          totalRealizedPnL += eventPnL;

          posRecord.quantity = remainingQty;
          initialPositions.set(fillSymbol, posRecord);
        }

        // Validate metadata assertions if present
        if (evt.metadata?.cashAfter !== undefined && evt.metadata.cashAfter !== runningCash) {
          mismatches.push({
            code: 'CASH_CONSERVATION_FAILED',
            field: `event[${evt.sequenceNumber}].metadata.cashAfter`,
            expected: runningCash,
            actual: evt.metadata.cashAfter,
            message: `Event cashAfter assertion failed: expected ${runningCash}, found ${evt.metadata.cashAfter}`,
          });
        }
        if (evt.metadata?.positionAfter !== undefined && evt.metadata.positionAfter !== posRecord.quantity) {
          mismatches.push({
            code: 'POSITION_CONSERVATION_FAILED',
            field: `event[${evt.sequenceNumber}].metadata.positionAfter`,
            expected: posRecord.quantity,
            actual: evt.metadata.positionAfter,
            message: `Event positionAfter assertion failed: expected ${posRecord.quantity}, found ${evt.metadata.positionAfter}`,
          });
        }
      }
    }

    // Check terminal FILLED state requirement: sum(fill_quantity) === ordered_quantity
    const lastEvent = events[events.length - 1];
    const isTerminalFilled =
      lastEvent?.nextState === 'FILLED' ||
      lastEvent?.nextState === 'SETTLED' ||
      events.some(e => e.nextState === 'FILLED' || e.eventType === 'ORDER_FILLED');

    if (isTerminalFilled && orderedQuantity !== undefined && totalExecutedQuantity !== orderedQuantity) {
      mismatches.push({
        code: 'PARTIAL_FILL_CONSERVATION_FAILED',
        field: 'totalExecutedQuantity',
        expected: orderedQuantity,
        actual: totalExecutedQuantity,
        message: `Terminal FILLED order did not fulfill 100% of ordered quantity: executed ${totalExecutedQuantity}/${orderedQuantity}`,
      });
    }

    const isValid = mismatches.length === 0;
    return {
      isValid,
      mismatches,
      error: isValid ? undefined : mismatches.map(m => m.message).join('; '),
    };
  }

  /**
   * Validates conservation between initial account state, final account state, and execution summary.
   */
  static validateSummaryConservation(
    initialAccount: BrokerAccount,
    summary: ReplayExecutionSummary,
    finalAccount?: BrokerAccount,
    options?: FinancialConservationOptions
  ): FinancialValidationResult {
    const symbol = summary.symbol;
    const initialPos = initialAccount.positions?.find(p => p.symbol.toUpperCase() === symbol.toUpperCase())?.quantity ?? 0;
    const avgCost = initialAccount.positions?.find(p => p.symbol.toUpperCase() === symbol.toUpperCase())?.averageCost ?? summary.executedPrice ?? 0;

    return this.validateSingleExecution({
      side: summary.side,
      symbol,
      requestedQuantity: summary.requestedQuantity,
      executedQuantity: summary.executedQuantity,
      executedPrice: summary.executedPrice,
      fee: summary.fee,
      tax: summary.tax,
      status: summary.status,
      cashBefore: initialAccount.cash,
      cashAfter: finalAccount?.cash ?? summary.cashAfter,
      positionBefore: initialPos,
      positionAfter: finalAccount?.positions?.find(p => p.symbol.toUpperCase() === symbol.toUpperCase())?.quantity ?? summary.positionAfter,
      averageCost: avgCost,
      realizedPnL: finalAccount?.realizedPnL !== undefined
        ? finalAccount.realizedPnL - (initialAccount.realizedPnL ?? 0)
        : summary.realizedPnL,
      equityBefore: initialAccount.equity,
      equityAfter: finalAccount?.equity,
      markPrice: options?.referencePrice,
      tradingCosts: options?.tradingCosts,
    });
  }
}
