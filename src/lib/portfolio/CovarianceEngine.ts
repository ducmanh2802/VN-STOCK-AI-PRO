/**
 * PHASE 28 — COVARIANCE / CORRELATION ENGINE (pure, deterministic)
 * Sample covariance on pairwise-complete aligned tails; explicit guards.
 */

export interface CovarianceInput {
  /** Per-symbol daily simple returns in decimals. */
  readonly returnsBySymbol: Readonly<Record<string, readonly number[]>>;
  /** Portfolio weights keyed by UPPER symbol, summing ~1. */
  readonly weights: Readonly<Record<string, number>>;
  readonly minObservations?: number;
}

export interface CovarianceOutput {
  symbols: string[];
  observationCount: number;
  covariance: number[][];
  correlation: (number | null)[][];
  volatilities: Record<string, number | null>;
  annualizedPortfolioVolatility: number | null;
  diversificationRatio: number | null;
  insufficient: boolean;
}

function cleanSeries(s: readonly number[]): number[] {
  return s.filter((r) => typeof r === 'number' && Number.isFinite(r));
}

function mean(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

export class CovarianceEngine {
  static compute(input: CovarianceInput): CovarianceOutput | null {
    const minObs = input.minObservations ?? 30;
    const symbols = Object.keys(input.returnsBySymbol ?? {})
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .sort();
    if (symbols.length === 0) return null;
    const cleaned = new Map<string, number[]>();
    for (const s of symbols) {
      const raw = input.returnsBySymbol[s] ?? input.returnsBySymbol[s.toLowerCase()] ?? [];
      const c = cleanSeries(raw as readonly number[]);
      if (c.length === 0) return null; // any held symbol without series => caller fails closed
      cleaned.set(s, c);
    }
    // Align on trailing min length (pairwise-complete tail alignment).
    const alignLen = Math.min(...[...cleaned.values()].map((v) => v.length));
    if (!(alignLen >= 2)) return null;
    const insufficient = alignLen < minObs;

    const tails = new Map<string, number[]>();
    for (const [k, v] of cleaned) tails.set(k, v.slice(v.length - alignLen));
    const mus = new Map<string, number>();
    for (const [k, v] of tails) mus.set(k, mean(v));

    const n = symbols.length;
    const cov: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = tails.get(symbols[i])!;
        const b = tails.get(symbols[j])!;
        let s = 0;
        for (let k = 0; k < alignLen; k++) s += (a[k] - mus.get(symbols[i])!) * (b[k] - mus.get(symbols[j])!);
        cov[i][j] = s / (alignLen - 1);
      }
    }
    const vols: Record<string, number | null> = {};
    for (let i = 0; i < n; i++) {
      const v = cov[i][i];
      vols[symbols[i]] = v > 0 && Number.isFinite(v) ? Math.sqrt(v) : v === 0 ? 0 : null;
    }
    const corr: (number | null)[][] = Array.from({ length: n }, () =>
      new Array<number | null>(n).fill(null)
    );
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const vi = cov[i][i];
        const vj = cov[j][j];
        if (vi > 0 && vj > 0) {
          const r = cov[i][j] / (Math.sqrt(vi) * Math.sqrt(vj));
          corr[i][j] = Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
        } else if (i === j && vi === 0) {
          corr[i][j] = 1;
        } else {
          corr[i][j] = null; // zero-variance leg => undefined correlation, NOT zero
        }
      }
    }
    // Portfolio variance wᵀΣw over covered symbols only.
    let pv = 0;
    let wSum = 0;
    const w: number[] = symbols.map((s) => input.weights[s] ?? 0);
    wSum = w.reduce((a, b) => a + b, 0);
    if (wSum <= 0) {
      return {
        symbols,
        observationCount: alignLen,
        covariance: cov,
        correlation: corr,
        volatilities: vols,
        annualizedPortfolioVolatility: null,
        diversificationRatio: null,
        insufficient,
      };
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) pv += w[i] * w[j] * cov[i][j];
    }
    const annVol = pv >= 0 && Number.isFinite(pv) ? Math.sqrt(pv) * Math.sqrt(252) : null;
    // Diversification ratio = Σ w_i σ_i / σ_p (daily basis).
    let wtdVol = 0;
    for (let i = 0; i < n; i++) {
      const sd = vols[symbols[i]];
      if (sd === null) {
        wtdVol = NaN;
        break;
      }
      wtdVol += w[i] * sd;
    }
    const dailyPv = pv >= 0 ? Math.sqrt(pv) : NaN;
    const divRatio =
      Number.isFinite(wtdVol) && Number.isFinite(dailyPv) && dailyPv > 0 ? wtdVol / dailyPv : null;

    return {
      symbols,
      observationCount: alignLen,
      covariance: cov,
      correlation: corr,
      volatilities: vols,
      annualizedPortfolioVolatility: annVol,
      diversificationRatio: divRatio,
      insufficient,
    };
  }

  /** Portfolio beta vs explicit benchmark tail-overlap. Null-safe, fail-closed. */
  static beta(
    portfolioReturns: readonly number[],
    benchmarkReturns: readonly number[]
  ): { beta: number | null; correlation: number | null; trackingErrorAnn: number | null; overlap: number } {
    const a = cleanSeries(portfolioReturns);
    const b = cleanSeries(benchmarkReturns);
    const overlap = Math.min(a.length, b.length);
    if (overlap < 2) return { beta: null, correlation: null, trackingErrorAnn: null, overlap };
    const pa = a.slice(a.length - overlap);
    const ba = b.slice(b.length - overlap);
    const ma = mean(pa);
    const mb = mean(ba);
    let cov = 0;
    let vb = 0;
    let va = 0;
    for (let i = 0; i < overlap; i++) {
      cov += (pa[i] - ma) * (ba[i] - mb);
      vb += (ba[i] - mb) * (ba[i] - mb);
      va += (pa[i] - ma) * (pa[i] - ma);
    }
    cov /= overlap - 1;
    vb /= overlap - 1;
    va /= overlap - 1;
    if (!(vb > 0)) return { beta: null, correlation: null, trackingErrorAnn: null, overlap };
    const beta = cov / vb;
    const corr = va > 0 ? cov / (Math.sqrt(va) * Math.sqrt(vb)) : null;
    // Tracking error = stdev(active) * sqrt(252)
    let te = 0;
    const mActive = mean(pa.map((v, i) => v - ba[i]));
    for (let i = 0; i < overlap; i++) te += Math.pow(pa[i] - ba[i] - mActive, 2);
    te = overlap > 1 ? Math.sqrt(te / (overlap - 1)) * Math.sqrt(252) : null;
    return {
      beta: Number.isFinite(beta) ? beta : null,
      correlation: corr !== null && Number.isFinite(corr) ? Math.max(-1, Math.min(1, corr)) : null,
      trackingErrorAnn: typeof te === 'number' && Number.isFinite(te) ? te : null,
      overlap,
    };
  }

  /** Value-weighted portfolio return series from aligned tails (for beta/benchmark). */
  static portfolioReturnSeries(
    returnsBySymbol: Readonly<Record<string, readonly number[]>>,
    weights: Readonly<Record<string, number>>
  ): number[] | null {
    const syms = Object.keys(weights).filter((s) => (weights[s] ?? 0) > 0);
    if (syms.length === 0) return null;
    const tails: number[][] = [];
    let len = Infinity;
    for (const s of syms) {
      const key = s.trim().toUpperCase();
      const raw = returnsBySymbol[key] ?? [];
      const c = cleanSeries(raw);
      if (c.length === 0) return null;
      tails.push(c);
      len = Math.min(len, c.length);
    }
    if (!Number.isFinite(len) || len < 1) return null;
    const wSum = syms.reduce((a, s) => a + (weights[s] ?? 0), 0);
    if (!(wSum > 0)) return null;
    const out: number[] = [];
    for (let i = 0; i < len; i++) {
      let d = 0;
      for (let k = 0; k < syms.length; k++) {
        const t = tails[k];
        d += (weights[syms[k]] / wSum) * t[t.length - len + i];
      }
      out.push(d);
    }
    return out;
  }
}
