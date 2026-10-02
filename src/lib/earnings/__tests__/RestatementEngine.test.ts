import { describe, it, expect } from 'vitest';
import { RestatementEngine } from '../RestatementEngine.ts';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import { makeFact } from './fixtures.ts';

describe('Phase 24 — RestatementEngine (P0 Invariants)', () => {
  const period = FinancialPeriodEngine.cumulative(2023, 'FY');

  it('preserves all historical versions in append-only storage with monotonic versions', () => {
    const store = new RestatementEngine();

    // Original fact published March 2024
    const originalFact = makeFact('NET_PROFIT', period, 10_000_000_000, {
      reportId: 'AUDITED_REPORT_2023_V1',
      publicationDate: '2024-03-15',
      restatementStatus: 'ORIGINAL',
    });

    const res1 = store.append(originalFact);
    expect(res1.accepted).toBe(true);
    expect(res1.version).toBe(0);

    // Audited restatement published July 2024
    const restatedFact = makeFact('NET_PROFIT', period, 9_200_000_000, {
      reportId: 'RESTATED_REPORT_2023_V2',
      publicationDate: '2024-07-20',
      restatementStatus: 'RESTATED',
    });

    const res2 = store.append(restatedFact);
    expect(res2.accepted).toBe(true);
    expect(res2.version).toBe(1);

    // Verify all versions coexist and original was never mutated
    const versions = store.getVersions('HPG', 'INCOME_STATEMENT', 'CONSOLIDATED', period.id, 'NET_PROFIT');
    expect(versions).toHaveLength(2);
    expect(versions[0].value).toBe(10_000_000_000);
    expect(versions[0].restatementVersion).toBe(0);
    expect(versions[1].value).toBe(9_200_000_000);
    expect(versions[1].restatementVersion).toBe(1);

    // Select latest: returns the restated version
    const selection = store.selectLatest('HPG', 'INCOME_STATEMENT', 'CONSOLIDATED', period.id, 'NET_PROFIT');
    expect(selection.latest?.value).toBe(9_200_000_000);
    expect(selection.status).toBe('RESTATED');
  });

  it('rejects duplicate filings deterministically without creating new versions', () => {
    const store = new RestatementEngine();

    const fact = makeFact('REVENUE', period, 50_000_000_000, {
      reportId: 'REPORT_DUP',
      publicationDate: '2024-03-15',
      source: 'HOSE',
    });

    const first = store.append(fact);
    expect(first.accepted).toBe(true);

    // Identical filing submitted again
    const second = store.append(fact);
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe('DUPLICATE_FILING');

    expect(store.getAll()).toHaveLength(1);
  });

  it('enforces Tier 1 (SSC) precedence over Tier 4 broker filings', () => {
    const store = new RestatementEngine();

    // Tier 4 broker fact
    const brokerFact = makeFact('NET_PROFIT', period, 12_000_000_000, {
      source: 'KBS',
      sourceTier: 'TIER_4_BROKER_CROSS_CHECK',
      publicationDate: '2024-04-01', // later date
    });

    // Tier 1 authoritative SSC fact
    const sscFact = makeFact('NET_PROFIT', period, 10_000_000_000, {
      source: 'SSC',
      sourceTier: 'TIER_1_PRIMARY',
      publicationDate: '2024-03-15', // earlier date
    });

    store.append(brokerFact);
    store.append(sscFact);

    // Tier 1 SSC must dominate even though broker fact has later publication date
    const selection = store.selectLatest('HPG', 'INCOME_STATEMENT', 'CONSOLIDATED', period.id, 'NET_PROFIT');
    expect(selection.latest?.sourceTier).toBe('TIER_1_PRIMARY');
    expect(selection.latest?.value).toBe(10_000_000_000);
  });

  it('detects material broker conflict when Tier 4 differs from authoritative tier', () => {
    const sscFact = makeFact('NET_PROFIT', period, 10_000_000_000, {
      source: 'SSC',
      sourceTier: 'TIER_1_PRIMARY',
    });

    const brokerFact = makeFact('NET_PROFIT', period, 12_000_000_000, { // 20% discrepancy
      source: 'VPS',
      sourceTier: 'TIER_4_BROKER_CROSS_CHECK',
    });

    const versions = [sscFact, brokerFact];
    expect(RestatementEngine.hasBrokerConflict(versions, 1.0)).toBe(true);
  });
});
