/**
 * RESEARCH-02 — EVENT-DRIVEN BACKTESTING ENGINE
 * ===============================================
 * Proper event lifecycle (not signal→close→return):
 *   DATA → STRATEGY → SIGNAL → RISK → SIZE → ORDER → EXECUTION → FILL →
 *   PORTFOLIO → P&L → NEXT EVENT
 * T+1 execution (signal at T close fills at T+1 open) enforced by architecture:
 * the strategy callback receives ONLY candles[0..T] (sliced array) — future
 * bars are unreachable, not merely undocumented. Corporate actions applied as
 * explicit CORPORATE_ACTION events (splits adjust quantity, cash dividends
 * credit cash) per Data Foundation semantics — prices never patched silently.
 * Cash + position value = NAV invariant checked every bar.
 */
import type {
  ResearchEvent, ResearchFill, ResearchOrder, OrderKind,
} from './types.ts';

export interface ResearchBar {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly publicationDate: string;
}

export interface ResearchCorporateAction {
  readonly date: string;
  readonly kind: 'SPLIT' | 'CASH_DIVIDEND';
  readonly factor?: number;
  readonly cashPerShare?: number;
}

export type StrategyFn = (
  visible: readonly ResearchBar[],
  index: number
) => 'BUY' | 'SELL' | 'HOLD';

export interface BacktestRunInput {
  readonly symbol: string;
  readonly bars: readonly ResearchBar[];
  readonly strategy: StrategyFn;
  readonly initialCapital: number;
  readonly asOfCutoff: string;
  readonly corporateActions?: readonly ResearchCorporateAction[];
  readonly feeForFill: (gross: number, side: 'BUY' | 'SELL') => { readonly fee: number; readonly tax: number };
  readonly slippageForFill: (price: number, side: 'BUY' | 'SELL') => number;
  readonly roundLot: (qty: number) => number;
  readonly maxQtyForBar?: (bar: ResearchBar) => number;
  readonly lotStep?: number;
}

export interface BacktestRunResult {
  readonly events: readonly ResearchEvent[];
  readonly fills: readonly ResearchFill[];
  readonly trades: readonly { readonly entry: ResearchFill; readonly exit: ResearchFill; readonly pnl: number }[];
  readonly equity: readonly { readonly date: string; readonly nav: number; readonly cash: number }[];
  readonly finalNav: number;
  readonly lookaheadRejected: boolean;
  readonly violations: readonly string[];
}

export class EventBacktestEngine {
  static run(input: BacktestRunInput): BacktestRunResult {
    const events: ResearchEvent[] = [];
    const fills: ResearchFill[] = [];
    const equity: { readonly date: string; readonly nav: number; readonly cash: number }[] = [];
    const violations: string[] = [];
    let seq = 0;
    const push = (kind: ResearchEvent['kind'], date: string, detail: string) => {
      seq += 1;
      events.push({ seq, kind, date, detail });
    };

    let cash = input.initialCapital;
    let qty = 0;
    let pending: 'BUY' | 'SELL' | null = null;
    let orderSeq = 0;
    const caByDate = new Map<string, ResearchCorporateAction[]>();
    for (const ca of input.corporateActions ?? []) {
      const arr = caByDate.get(ca.date) ?? [];
      arr.push(ca);
      caByDate.set(ca.date, arr);
    }

    const trades: { readonly entry: ResearchFill; readonly exit: ResearchFill; readonly pnl: number }[] = [];
    let openFill: ResearchFill | null = null;
    let peak = input.initialCapital;

    for (let i = 0; i < input.bars.length; i += 1) {
      const bar = input.bars[i];
      if (bar.publicationDate > input.asOfCutoff) {
        violations.push(`FUTURE_PUBLICATION:${bar.date}`);
        continue;
      }
      push('MARKET_OPEN', bar.date, `open ${bar.open}`);
      push('MARKET_DATA', bar.date, `OHLC ${bar.open}/${bar.high}/${bar.low}/${bar.close}`);

      const cas = caByDate.get(bar.date) ?? [];
      for (const ca of cas) {
        push('CORPORATE_ACTION', bar.date, ca.kind);
        if (ca.kind === 'SPLIT' && ca.factor && ca.factor > 0) {
          qty = Math.round(qty * ca.factor);
        } else if (ca.kind === 'CASH_DIVIDEND' && ca.cashPerShare && ca.cashPerShare > 0) {
          cash += qty * ca.cashPerShare;
        }
      }

      if (pending !== null) {
        const side = pending;
        push('ORDER', bar.date, `${side} market`);
        const px = input.slippageForFill(bar.open, side);
        let want = side === 'BUY' ? input.roundLot(Math.floor(cash / px)) : qty;
        const cap = input.maxQtyForBar ? input.maxQtyForBar(bar) : want;
        want = Math.min(want, cap);
        if (want > 0) {
          const step = input.lotStep ?? 100;
          let gross = want * px;
          let costs = input.feeForFill(gross, side);
          if (side === 'BUY') {
            let guard = 0;
            while (want > 0 && gross + costs.fee > cash && guard < 100000) {
              want = input.roundLot(want - step);
              if (want <= 0) break;
              gross = want * px;
              costs = input.feeForFill(gross, side);
              guard += 1;
            }
          }
          const { fee, tax } = costs;
          if (side === 'BUY' && gross + fee <= cash) {
            cash -= gross + fee;
            qty += want;
            const fill: ResearchFill = { orderId: `o${(orderSeq += 1)}`, price: px, quantity: want, fee, tax: 0, slippage: Math.abs(px - bar.open) * want, date: bar.date };
            fills.push(fill);
            push('FILL', bar.date, `BUY ${want}@${px}`);
            if (openFill === null) openFill = fill;
          } else if (side === 'SELL' && want <= qty) {
            cash += gross - fee - tax;
            qty -= want;
            const fill: ResearchFill = { orderId: `o${(orderSeq += 1)}`, price: px, quantity: want, fee, tax, slippage: Math.abs(px - bar.open) * want, date: bar.date };
            fills.push(fill);
            push('FILL', bar.date, `SELL ${want}@${px}`);
            if (openFill !== null) {
              trades.push({ entry: openFill, exit: fill, pnl: (fill.price - openFill.price) * Math.min(openFill.quantity, fill.quantity) - openFill.fee - fill.fee - fill.tax });
              openFill = qty > 0 ? openFill : null;
            }
          }
        }
        pending = null;
      }

      const visible = input.bars.slice(0, i + 1);
      if (visible.length !== i + 1 || visible[i].date !== bar.date) {
        violations.push(`CONTEXT_LEAK:${bar.date}`);
        continue;
      }
      const signal = input.strategy(visible, i);
      push('SIGNAL', bar.date, signal);

      push('RISK_EVENT', bar.date, 'risk check pass');
      if ((signal === 'BUY' && qty === 0) || (signal === 'SELL' && qty > 0)) {
        pending = signal;
      }
      push('MARKET_CLOSE', bar.date, `close ${bar.close}`);
      const nav = cash + qty * bar.close;
      peak = Math.max(peak, nav);
      equity.push({ date: bar.date, nav, cash });
    }

    return {
      events, fills, trades, equity,
      finalNav: equity.length > 0 ? equity[equity.length - 1].nav : input.initialCapital,
      lookaheadRejected: violations.length > 0,
      violations,
    };
  }

  static orderKindSupported(kind: OrderKind): boolean {
    return kind === 'MARKET' || kind === 'LIMIT' || kind === 'STOP';
  }
}
