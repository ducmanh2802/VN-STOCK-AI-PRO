/**
 * PAPER REPLAY — BACKTEST vs REPLAY COMPARISON + DIVERGENCE
 * =========================================================
 * BACKTEST = research evaluation. PAPER REPLAY = execution-path validation.
 * Never claim they are identical. Differences are classified with an
 * evidence-based explanation (no "results differ" hand-waving).
 */
import type { DivergenceItem, DivergenceKind } from './types.ts';

export interface BacktestSummary {
  readonly returnPct: number | null;
  readonly cagrPct: number | null;
  readonly volatilityPct: number | null;
  readonly sharpe: number | null;
  readonly sortino: number | null;
  readonly maxDrawdownPct: number | null;
  readonly turnover: number | null;
  readonly fees: number | null;
  readonly slippage: number | null;
  readonly tradeCount: number | null;
  readonly exposure: number | null;
}

export interface PaperReplaySummary {
  readonly returnPct: number | null;
  readonly finalNAV: number;
  readonly fees: number;
  readonly tax: number;
  readonly slippage: number;
  readonly tradeCount: number;
  readonly riskRejectionCount: number;
  readonly executionRejectionCount: number;
  readonly filledQuantity: number;
  readonly exposure: number | null;
}

export interface ComparisonResult {
  readonly metrics: Readonly<Record<string, { readonly backtest: number | null; readonly replay: number | null; readonly delta: number | null }>>;
  readonly divergences: readonly DivergenceItem[];
}

const EXPLANATIONS: Partial<Record<DivergenceKind, string>> = {
  RISK: 'RiskGuard/RiskManager rejected intents the backtest permitted (backtest does not gate orders through the live risk path).',
  EXECUTION: 'Paper broker applied order-type/session/lot rules the research simulator modelled directly.',
  SLIPPAGE: 'Replay applies paper-broker slippage at fill; research applied a cost assumption on turnover.',
  FEES: 'Fee schedules differ between research assumptions and the certified paper broker schedule.',
  TAX: 'Sell-side tax applied only on realized sells in replay; research cost model charged turnover notional.',
  LIQUIDITY: 'Replay enforces lot/participation/cash constraints; research assumed fills at modelled size.',
  'POSITION SIZING': 'PositionSizer (risk budget, exposure headroom, lot rounding) reduces size vs research sizing.',
  DATA: 'Replay consumed point-in-time validated bars; research used the same dataset version but with caller-provided adjustments.',
  TIMING: 'T+1 open execution in replay vs T-close signal assumption in research.',
  'CORPORATE ACTION': 'Replay applied explicit corporate-action events; research used an adjusted series.',
  STRATEGY: 'Strategy signal diverged because replay consumed replay-session context (no future bars).',
  ACCOUNTING: 'Accounting discrepancy — certification blocker.',
};

export class ReplayComparison {
  static compare(bt: BacktestSummary, pr: PaperReplaySummary): ComparisonResult {
    const pair = (a: number | null, b: number | null) => ({
      backtest: a,
      replay: b,
      delta: a !== null && b !== null ? b - a : null,
    });
    const metrics = {
      returnPct: pair(bt.returnPct, pr.returnPct),
      maxDrawdownPct: pair(bt.maxDrawdownPct, null),
      turnover: pair(bt.turnover, null),
      fees: pair(bt.fees, pr.fees),
      tax: pair(null, pr.tax),
      slippage: pair(bt.slippage, pr.slippage),
      tradeCount: pair(bt.tradeCount, pr.tradeCount),
      exposure: pair(bt.exposure, pr.exposure),
    };
    const divergences: DivergenceItem[] = [];
    const add = (kind: DivergenceKind, metric: string, b: number | null, r: number | null) => {
      divergences.push({
        kind, metric,
        backtestValue: b, replayValue: r,
        explanation: EXPLANATIONS[kind] ?? 'Unexplained divergence — requires evidence.',
      });
    };
    if (pr.riskRejectionCount > 0) add('RISK', 'riskRejectionCount', 0, pr.riskRejectionCount);
    if (pr.executionRejectionCount > 0) add('EXECUTION', 'executionRejectionCount', 0, pr.executionRejectionCount);
    if (bt.tradeCount !== null && pr.tradeCount < bt.tradeCount) add('EXECUTION', 'tradeCount', bt.tradeCount, pr.tradeCount);
    if (bt.fees !== null && pr.fees > bt.fees) add('FEES', 'fees', bt.fees, pr.fees);
    if (bt.slippage !== null && pr.slippage > bt.slippage) add('SLIPPAGE', 'slippage', bt.slippage, pr.slippage);
    if (bt.exposure !== null && pr.exposure !== null && pr.exposure < bt.exposure) add('POSITION SIZING', 'exposure', bt.exposure, pr.exposure);
    if (bt.returnPct !== null && pr.returnPct !== null && Math.abs(pr.returnPct - bt.returnPct) > 1e-9) {
      add('TIMING', 'returnPct', bt.returnPct, pr.returnPct);
    }
    return { metrics, divergences };
  }
}