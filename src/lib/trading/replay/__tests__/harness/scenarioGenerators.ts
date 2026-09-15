/**
 * Scenario Generators for Deterministic Property-Based Testing
 * ============================================================
 * Pure, deterministic generators that construct valid/invalid snapshots,
 * orders, accounts, and full multi-event scenarios from SeededRng seeds.
 * 
 * Invariants:
 * - 100% deterministic (zero Math.random() / Date.now()).
 * - Explicit categorization: VALID_EXECUTABLE, VALID_NON_EXECUTABLE, INVALID_INPUT.
 * - No network / mock data dependencies.
 */

import { SeededRng } from './deterministicRng.ts';
import { MarketSnapshotBuilder } from '../../../snapshot/MarketSnapshotBuilder.ts';
import type { MarketSnapshot, MarketSnapshotInput } from '../../../snapshot/types.ts';
import type { BrokerAccount, BrokerPosition } from '../../../execution/BrokerAdapter.ts';
import type { OrderIntent, ExecutionContextBinding } from '../../types.ts';
import type {
  ReplayScenario,
  ReplayScenarioEvent,
  ScenarioClassification,
  ScenarioSubCategory,
} from './scenarioTypes.ts';

export interface SnapshotGeneratorOptions {
  readonly symbol?: string;
  readonly lastPrice?: number;
  readonly ceilingPrice?: number;
  readonly floorPrice?: number;
  readonly referencePrice?: number;
  readonly timestamp?: number;
  readonly strategyVersion?: string;
  readonly riskPolicyVersion?: string;
  readonly recommendationId?: string;
}

export class ScenarioGenerators {
  private static readonly VIETNAMESE_SYMBOLS = ['HPG', 'SSI', 'VNM', 'FPT', 'VCB', 'TCB', 'MWG', 'MBB', 'VIC', 'VHM'] as const;

  /**
   * Generates a base valid MarketSnapshotInput.
   */
  static generateMarketSnapshotInput(
    rng: SeededRng,
    options: SnapshotGeneratorOptions & { signal?: 'BUY' | 'SELL' } = {}
  ): MarketSnapshotInput {
    const symbol = options.symbol || rng.pick(this.VIETNAMESE_SYMBOLS);
    const ref = options.referencePrice ?? (options.lastPrice !== undefined ? options.lastPrice : rng.nextInt(20_000, 100_000));
    const ceiling = options.ceilingPrice ?? Math.round(ref * 1.07);
    const floor = options.floorPrice ?? Math.round(ref * 0.93);
    const last = options.lastPrice ?? rng.nextInt(floor, ceiling);
    const ts = options.timestamp ?? 1774866600000; // Fixed base timestamp 2026-03-30
    const isoDate = new Date(ts).toISOString();

    const recId = options.recommendationId ?? `REC-${symbol}-${rng.nextString(6)}`;
    const stratVer = options.strategyVersion ?? 'v2.1.0';
    const riskVer = options.riskPolicyVersion ?? 'v1.4.0';
    const signal = options.signal ?? 'BUY';

    return {
      capturedAt: isoDate,
      source: {
        provider: 'SSI',
        feed: 'REALTIME_STREAM',
      },
      market: {
        exchange: 'HOSE',
        tradingDate: isoDate.slice(0, 10),
        session: 'CONTINUOUS',
        isOpen: true,
      },
      instrument: {
        symbol,
        name: `Cổ phiếu ${symbol}`,
      },
      quote: {
        last,
        open: ref,
        high: Math.max(last, ref),
        low: Math.min(last, ref),
        close: last,
        volume: rng.nextInt(1_000_000, 20_000_000),
        reference: ref,
        ceiling,
        floor,
        timestamp: isoDate,
      },
      recommendation: {
        recommendationId: recId,
        strategyVersion: stratVer,
        signal,
        horizon: 'SHORT_TERM',
        confidence: 85,
      },
      integrity: {
        dataFreshnessMs: 500,
        validationStatus: 'VALID',
        warnings: [],
      },
      versions: {
        snapshotSchemaVersion: '1.0.0',
        strategyVersion: stratVer,
        riskPolicyVersion: riskVer,
      },
    };
  }

  /**
   * Generates a built, validated MarketSnapshot.
   */
  static generateMarketSnapshot(
    rng: SeededRng,
    options: SnapshotGeneratorOptions & { signal?: 'BUY' | 'SELL' } = {}
  ): MarketSnapshot {
    const input = this.generateMarketSnapshotInput(rng, options);
    return MarketSnapshotBuilder.buildFrom(input);
  }

  /**
   * Generates a realistic initial BrokerAccount.
   */
  static generateInitialAccount(
    rng: SeededRng,
    options: {
      initialCash?: number;
      positions?: Array<{ symbol: string; quantity: number; averageCost: number; currentPrice?: number }>;
    } = {}
  ): BrokerAccount {
    const cash = options.initialCash ?? rng.nextInt(200_000_000, 1_000_000_000);
    const positions: BrokerPosition[] = [];

    if (options.positions) {
      for (const p of options.positions) {
        const curPrice = p.currentPrice ?? p.averageCost;
        const marketValue = p.quantity * curPrice;
        positions.push({
          symbol: p.symbol,
          quantity: p.quantity,
          reservedQuantity: 0,
          availableQuantity: p.quantity,
          averageCost: p.averageCost,
          currentPrice: curPrice,
          marketValue,
          unrealizedPnL: marketValue - p.quantity * p.averageCost,
          unrealizedPnLPercent: ((curPrice - p.averageCost) / p.averageCost) * 100,
          updatedAt: '2026-03-30T10:00:00.000Z',
        });
      }
    }

    const totalMarketValue = positions.reduce((acc, p) => acc + p.marketValue, 0);

    return {
      accountId: `PBT_ACC_${rng.nextString(6)}`,
      currency: 'VND',
      cash,
      reservedCash: 0,
      availableCash: cash,
      marketValue: totalMarketValue,
      equity: cash + totalMarketValue,
      realizedPnL: 0,
      unrealizedPnL: positions.reduce((acc, p) => acc + p.unrealizedPnL, 0),
      positions,
      openOrders: [],
      updatedAt: '2026-03-30T10:00:00.000Z',
    };
  }

  /**
   * Generates a VALID_EXECUTABLE scenario (clean BUYs and SELLs with adequate cash & inventory).
   */
  static generateValidExecutableScenario(
    seed: number,
    eventCount: number = 5,
    preferredSymbol?: string
  ): ReplayScenario {
    const rng = new SeededRng(seed);
    const initialCash = 500_000_000;
    const initialAccount = this.generateInitialAccount(rng, {
      initialCash,
      positions: [],
    });

    const candidateSymbols = preferredSymbol
      ? [preferredSymbol, ...this.VIETNAMESE_SYMBOLS.filter((s) => s !== preferredSymbol)]
      : [...this.VIETNAMESE_SYMBOLS];

    const events: ReplayScenarioEvent[] = [];
    let currentTs = 1774866600000;
    const inventoryMap = new Map<string, number>();
    let symbolCursor = 0;

    for (let i = 0; i < eventCount; i++) {
      currentTs += 60_000;

      // Determine BUY vs SELL
      const openSymbols = Array.from(inventoryMap.entries()).filter(([_, q]) => q > 0);
      let side: 'BUY' | 'SELL';
      let symbol: string;
      let quantity: number;

      if (openSymbols.length > 0 && (i % 2 === 1 || symbolCursor >= candidateSymbols.length)) {
        side = 'SELL';
        const [openSym, openQty] = openSymbols[rng.nextInt(0, openSymbols.length - 1)];
        symbol = openSym;
        quantity = Math.min(openQty, rng.nextInt(1, 2) * 100);
        inventoryMap.set(symbol, openQty - quantity);
      } else {
        side = 'BUY';
        symbol = candidateSymbols[symbolCursor % candidateSymbols.length];
        symbolCursor++;
        quantity = rng.nextInt(1, 3) * 100;
        inventoryMap.set(symbol, (inventoryMap.get(symbol) || 0) + quantity);
      }

      const refPrice = 28_000;
      const ceiling = Math.round(refPrice * 1.07);
      const floor = Math.round(refPrice * 0.93);
      const price = rng.nextInt(floor + 200, ceiling - 200);

      const snapshot = this.generateMarketSnapshot(rng, {
        symbol,
        lastPrice: price,
        referencePrice: refPrice,
        ceilingPrice: ceiling,
        floorPrice: floor,
        timestamp: currentTs,
        signal: side,
      });

      const orderIntent: OrderIntent = {
        symbol,
        side,
        quantity,
        orderType: 'MARKET',
        recommendationId: snapshot.recommendation?.recommendationId,
        marketDataSnapshotId: snapshot.snapshotId,
        strategyVersion: snapshot.versions?.strategyVersion,
        riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
      };

      const executionContext: ExecutionContextBinding = {
        marketDataSnapshotId: snapshot.snapshotId,
        recommendationId: snapshot.recommendation?.recommendationId,
        strategyVersion: snapshot.versions?.strategyVersion,
        riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
      };

      events.push({
        eventId: `EVT_${seed}_${i}`,
        sequenceNumber: i + 1,
        timestamp: currentTs,
        snapshot,
        orderIntent,
        executionContext,
        classification: 'VALID_EXECUTABLE',
        subCategory: 'CLEAN_FILL',
        expectedReplayStatus: 'REPLAYED',
        expectedOrderStatus: 'FILLED',
      });
    }

    return {
      scenarioId: `SCENARIO_VALID_${seed}`,
      seed,
      name: `Deterministic Valid Executable Scenario [Seed: ${seed}]`,
      initialAccount,
      events,
    };
  }

  /**
   * Generates a VALID_NON_EXECUTABLE scenario (e.g. Insufficient Cash or Insufficient Position).
   */
  static generateValidNonExecutableScenario(
    seed: number,
    subCategory: 'INSUFFICIENT_CASH' | 'INSUFFICIENT_POSITION' = 'INSUFFICIENT_CASH'
  ): ReplayScenario {
    const rng = new SeededRng(seed);
    const symbol = 'SSI';
    const timestamp = 1774866600000;

    const snapshot = this.generateMarketSnapshot(rng, {
      symbol,
      lastPrice: 35_000,
      timestamp,
      signal: subCategory === 'INSUFFICIENT_POSITION' ? 'SELL' : 'BUY',
    });

    let initialAccount: BrokerAccount;
    let orderIntent: OrderIntent;

    if (subCategory === 'INSUFFICIENT_CASH') {
      // Account with only 10,000 VND attempting to buy 10,000 shares of SSI (350,000,000 VND)
      initialAccount = this.generateInitialAccount(rng, { initialCash: 10_000 });
      orderIntent = {
        symbol,
        side: 'BUY',
        quantity: 10_000,
        orderType: 'MARKET',
        recommendationId: snapshot.recommendation?.recommendationId,
        marketDataSnapshotId: snapshot.snapshotId,
        strategyVersion: snapshot.versions?.strategyVersion,
        riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
      };
    } else {
      // Account with 0 shares attempting to SELL 5,000 shares
      initialAccount = this.generateInitialAccount(rng, {
        initialCash: 500_000_000,
        positions: [],
      });
      orderIntent = {
        symbol,
        side: 'SELL',
        quantity: 5_000,
        orderType: 'MARKET',
        recommendationId: snapshot.recommendation?.recommendationId,
        marketDataSnapshotId: snapshot.snapshotId,
        strategyVersion: snapshot.versions?.strategyVersion,
        riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
      };
    }

    const executionContext: ExecutionContextBinding = {
      marketDataSnapshotId: snapshot.snapshotId,
      recommendationId: snapshot.recommendation?.recommendationId,
      strategyVersion: snapshot.versions?.strategyVersion,
      riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
    };

    const event: ReplayScenarioEvent = {
      eventId: `EVT_NON_EXEC_${seed}_0`,
      sequenceNumber: 1,
      timestamp,
      snapshot,
      orderIntent,
      executionContext,
      classification: 'VALID_NON_EXECUTABLE',
      subCategory,
      expectedReplayStatus: 'REPLAYED',
      expectedOrderStatus: 'REJECTED',
    };

    return {
      scenarioId: `SCENARIO_NON_EXEC_${seed}`,
      seed,
      name: `Deterministic Non-Executable Scenario (${subCategory}) [Seed: ${seed}]`,
      initialAccount,
      events: [event],
    };
  }

  /**
   * Generates an INVALID_INPUT scenario (e.g. Non-board lot, Tampered Hash, or Snapshot ID Mismatch).
   */
  static generateInvalidInputScenario(
    seed: number,
    subCategory: 'NON_BOARD_LOT' | 'CORRUPTED_SNAPSHOT_HASH' | 'SNAPSHOT_ID_MISMATCH' = 'NON_BOARD_LOT'
  ): ReplayScenario {
    const rng = new SeededRng(seed);
    const symbol = 'VNM';
    const timestamp = 1774866600000;

    let snapshot = this.generateMarketSnapshot(rng, {
      symbol,
      lastPrice: 70_000,
      timestamp,
    });

    let orderQuantity = 1000;
    let contextBindingId = snapshot.snapshotId;

    if (subCategory === 'NON_BOARD_LOT') {
      orderQuantity = 153; // Odd lot (not divisible by 100)
    } else if (subCategory === 'SNAPSHOT_ID_MISMATCH') {
      contextBindingId = 'MISMATCHED_SNAPSHOT_ID_9999';
    } else if (subCategory === 'CORRUPTED_SNAPSHOT_HASH') {
      // Create tampered snapshot with modified quote but original hash
      snapshot = {
        ...snapshot,
        quote: {
          ...snapshot.quote,
          last: 999_999, // Tampered price
        },
      };
    }

    const initialAccount = this.generateInitialAccount(rng, { initialCash: 500_000_000 });

    const orderIntent: OrderIntent = {
      symbol,
      side: 'BUY',
      quantity: orderQuantity,
      orderType: 'MARKET',
      recommendationId: snapshot.recommendation?.recommendationId,
      marketDataSnapshotId: contextBindingId,
      strategyVersion: snapshot.versions?.strategyVersion,
      riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
    };

    const executionContext: ExecutionContextBinding = {
      marketDataSnapshotId: contextBindingId,
      recommendationId: snapshot.recommendation?.recommendationId,
      strategyVersion: snapshot.versions?.strategyVersion,
      riskPolicyVersion: snapshot.versions?.riskPolicyVersion,
    };

    const event: ReplayScenarioEvent = {
      eventId: `EVT_INVALID_${seed}_0`,
      sequenceNumber: 1,
      timestamp,
      snapshot,
      orderIntent,
      executionContext,
      classification: 'INVALID_INPUT',
      subCategory,
      expectedReplayStatus: subCategory === 'NON_BOARD_LOT' ? 'REPLAYED' : 'REPLAY_INVALID',
      expectedOrderStatus: 'REJECTED',
    };

    return {
      scenarioId: `SCENARIO_INVALID_${seed}`,
      seed,
      name: `Deterministic Invalid Input Scenario (${subCategory}) [Seed: ${seed}]`,
      initialAccount,
      events: [event],
    };
  }
}
