/**
 * PHASE 18.4 — TRADING ENGINE TYPES
 * =================================
 * Orchestration data models, configuration contracts, and cycle audit results.
 */

import type {
  Order,
  OrderType,
  TradingMarketData,
  TradingSignal,
  TradingSignalType,
  TradeDecision,
  ValidationErrorCode,
} from '../types/trading.ts';
import type {
  RiskConfig,
  RiskCheckResult,
  PositionSizeResult,
} from '../types/risk.ts';
import type {
  BrokerAdapter,
  BrokerAccount,
  BrokerPosition,
  OrderResult,
} from '../execution/BrokerAdapter.ts';
import type { OrderManager } from '../execution/OrderManager.ts';
import type {
  InvestmentHorizon,
  InvestmentRecommendation,
} from '../../../types/recommendation.ts';

export type TradingCycleStatus = 'TRADED' | 'NO_TRADE' | 'REJECTED' | 'ERROR';

export interface TradingEngineConfig {
  /** Underlying BrokerAdapter (e.g. PaperBroker) */
  broker: BrokerAdapter;
  /** Optional custom OrderManager instance (will be created if not supplied) */
  orderManager?: OrderManager;
  /** Risk policy overrides */
  riskConfig?: Partial<RiskConfig>;
  /** Default investment horizon for recommendation generation (default: SHORT_TERM) */
  defaultHorizon?: InvestmentHorizon;
  /** If true, bypasses market session time check (useful for backtest / testing) */
  skipSessionValidation?: boolean;
  /** Master trading enable switch (default: true) */
  tradingEnabled?: boolean;
  /** Emergency stop kill switch (default: false) */
  emergencyStop?: boolean;
  /** Maximum price deviation permitted between live quote and signal entry price (percent, default: 3.0) */
  maxPriceDeviationPercent?: number;
}

export interface TradingCycleOptions {
  /** Target stock ticker symbol (e.g., 'HPG', 'FPT', 'VCB') */
  symbol: string;
  /** Investment horizon (defaults to config.defaultHorizon or 'SHORT_TERM') */
  horizon?: InvestmentHorizon;
  /** Preferred order type (MARKET or LIMIT, default: MARKET) */
  orderType?: OrderType;
  /** Limit price in VND (applicable for LIMIT orders) */
  limitPrice?: number;
  /** Optional pre-fetched / simulated market data */
  marketData?: TradingMarketData;
  /** Optional pre-generated recommendation */
  recommendation?: InvestmentRecommendation;
  /** Optional pre-generated signal */
  signal?: TradingSignal;
  /** Optional client tracking ID */
  clientOrderId?: string;
  /** Desired quantity to sell when signal is SELL (if omitted, sells full available position) */
  sellQuantity?: number;
}

export interface TradingCycleResult {
  /** Overall status of this trading cycle run */
  status: TradingCycleStatus;
  /** Target stock symbol */
  symbol: string;
  /** Signal action determined or received */
  action: TradingSignalType;
  /** Market data used during cycle */
  marketData?: TradingMarketData | null;
  /** Investment recommendation produced or consumed */
  recommendation?: InvestmentRecommendation | null;
  /** Validated trading signal */
  signal?: TradingSignal | null;
  /** RiskManager evaluation outcome */
  riskCheck?: RiskCheckResult | null;
  /** Position sizer calculation outcome */
  positionSizing?: PositionSizeResult | null;
  /** Trade decision produced */
  tradeDecision?: TradeDecision | null;
  /** Executed or submitted order */
  order?: Order | null;
  /** Detailed order submission result from OrderManager / Broker */
  orderResult?: OrderResult | null;
  /** Reason description for trade, rejection, or hold */
  reason?: string;
  /** Canonical validation or rejection error code if applicable */
  rejectionCode?: ValidationErrorCode;
  /** ISO timestamp of cycle execution */
  timestamp: string;
}
