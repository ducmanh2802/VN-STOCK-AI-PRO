import { describe, it, expect } from 'vitest';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import { CashFlowEngine } from '../CashFlowEngine.ts';
import { MarginEngine } from '../MarginEngine.ts';
import { RestatementEngine } from '../RestatementEngine.ts';
import { makeFact } from './fixtures.ts';
import type { IncomeStatement, CashFlowStatement } from '../types.ts';

// Deterministic Pseudo-Random Generator (LCG)
class SimpleRng {
  private state: number;
  constructor(seed: number = 20261002) {
    this.state = seed;
  }
  public nextFloat(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
  public nextInt(min: number, max: number): number {
    return Math.floor(min + this.nextFloat() * (max - min + 1));
  }
}

describe('Phase 24 — Earnings Property-Based Testing (PBT)', () => {
  const rng = new SimpleRng(20261002);

  describe('PBT-1: Financial Period Ordering and Duration Non-Negativity', () => {
    it('always preserves durationDays > 0 and deterministic period ordering across 100+ cases', () => {
      for (let i = 0; i < 100; i++) {
        const year = rng.nextInt(1990, 2040);
        const q = (rng.nextInt(1, 4)) as 1 | 2 | 3 | 4;

        const period = FinancialPeriodEngine.quarter(year, q);
        expect(period.durationDays).toBeGreaterThan(88); // 89 to 92 days
        expect(period.durationDays).toBeLessThanOrEqual(92);
        expect(period.periodStart <= period.periodEnd).toBe(true);

        const validation = FinancialPeriodEngine.validate(period);
        expect(validation.isValid).toBe(true);
      }
    });
  });

  describe('PBT-2: FCF Identity Conservation', () => {
    it('always preserves FCF = CFO - |CAPEX| across 100+ random cash flow variations', () => {
      const period = FinancialPeriodEngine.quarter(2024, 1);

      for (let i = 0; i < 100; i++) {
        const cfo = rng.nextInt(-50_000_000_000, 100_000_000_000);
        // Random capex: can be provided as positive or negative in source
        const rawCapex = (rng.nextInt(0, 1) === 0 ? -1 : 1) * rng.nextInt(0, 50_000_000_000);

        const facts = [
          makeFact('CFO', period, cfo, { statementType: 'CASH_FLOW' }),
          makeFact('CAPEX', period, rawCapex, { statementType: 'CASH_FLOW' }),
        ];

        const cf = CashFlowEngine.normalize(facts, period, 'CONSOLIDATED');

        expect(cf.capex).toBe(Math.abs(rawCapex));
        expect(cf.freeCashFlow).toBe(cfo - Math.abs(rawCapex));
      }
    });
  });

  describe('PBT-3: Margin Bounds and Denominator Safety', () => {
    it('computes margins safely without NaN or Infinity across 100 random variations', () => {
      const period = FinancialPeriodEngine.quarter(2024, 1);

      for (let i = 0; i < 100; i++) {
        const rev = rng.nextInt(1_000_000, 100_000_000);
        const profit = rng.nextInt(-50_000_000, rev);

        const income: IncomeStatement = {
          revenue: rev,
          cogs: null,
          grossProfit: profit,
          operatingExpenses: null,
          operatingProfit: profit,
          ebitda: profit,
          nonOperatingIncome: null,
          nonOperatingExpense: null,
          pretaxProfit: profit,
          incomeTax: null,
          netProfit: profit,
          parentNetProfit: null,
          eps: null,
          reportType: 'CONSOLIDATED',
          period,
          reasons: {},
          lineage: { sources: ['PBT'], engine: 'Test', calculationVersion: '1.0' },
        };

        const cf: CashFlowStatement = {
          operatingCashFlow: profit,
          investingCashFlow: null,
          financingCashFlow: null,
          capex: 100_000,
          cashDividendsPaid: null,
          freeCashFlow: profit - 100_000,
          presentation: 'UNKNOWN',
          reportType: 'CONSOLIDATED',
          period,
          reasons: {},
          lineage: { sources: ['PBT'], engine: 'Test', calculationVersion: '1.0' },
        };

        const margins = MarginEngine.normalize(income, cf);

        if (margins.grossMargin !== null) {
          expect(Number.isFinite(margins.grossMargin)).toBe(true);
        }
        if (margins.fcfMargin !== null) {
          expect(Number.isFinite(margins.fcfMargin)).toBe(true);
        }
      }
    });
  });

  describe('PBT-4: Restatement Version Monotonicity', () => {
    it('always increments version monotonically across multiple amendments/restatements', () => {
      const period = FinancialPeriodEngine.quarter(2024, 1);

      for (let i = 0; i < 50; i++) {
        const store = new RestatementEngine();
        const numVersions = rng.nextInt(2, 6);

        for (let v = 0; v < numVersions; v++) {
          const val = rng.nextInt(1_000_000, 10_000_000);
          const fact = makeFact('NET_PROFIT', period, val, {
            reportId: `REPORT_V_${v}`,
            publicationDate: `2024-0${v + 1}-15`,
            restatementStatus: v === 0 ? 'ORIGINAL' : 'RESTATED',
          });
          const res = store.append(fact);
          expect(res.accepted).toBe(true);
          expect(res.version).toBe(v);
        }

        const versions = store.getVersions('HPG', 'INCOME_STATEMENT', 'CONSOLIDATED', period.id, 'NET_PROFIT');
        expect(versions).toHaveLength(numVersions);
        for (let v = 0; v < numVersions; v++) {
          expect(versions[v].restatementVersion).toBe(v);
        }
      }
    });
  });

  describe('PBT-5: Precedence Invariance (Tier 1 SSC Dominance)', () => {
    it('always selects Tier 1 SSC over Tier 4 broker facts regardless of publication dates or ordering', () => {
      const period = FinancialPeriodEngine.quarter(2024, 1);

      for (let i = 0; i < 50; i++) {
        const store = new RestatementEngine();
        const sscValue = rng.nextInt(10_000, 50_000);
        const brokerValue = rng.nextInt(10_000, 50_000);

        const sscFact = makeFact('REVENUE', period, sscValue, {
          source: 'SSC',
          sourceTier: 'TIER_1_PRIMARY',
          publicationDate: '2024-03-01',
        });

        const brokerFact = makeFact('REVENUE', period, brokerValue, {
          source: 'KBS',
          sourceTier: 'TIER_4_BROKER_CROSS_CHECK',
          publicationDate: '2024-04-01', // later date
        });

        // Test with random insertion order
        if (rng.nextFloat() > 0.5) {
          store.append(sscFact);
          store.append(brokerFact);
        } else {
          store.append(brokerFact);
          store.append(sscFact);
        }

        const latest = store.selectLatest('HPG', 'INCOME_STATEMENT', 'CONSOLIDATED', period.id, 'REVENUE');
        expect(latest.latest?.sourceTier).toBe('TIER_1_PRIMARY');
        expect(latest.latest?.value).toBe(sscValue);
      }
    });
  });
});
