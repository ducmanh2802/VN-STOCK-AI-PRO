import { describe, it, expect } from 'vitest';
import { BacklogConversionEngine } from '../BacklogConversionEngine.ts';
import { makeTestBacklogItem } from './fixtures.ts';

describe('Phase 26 — BacklogConversionEngine', () => {
  it('computes book-to-bill ratio and backlog coverage years deterministically', () => {
    const item = makeTestBacklogItem({
      remainingBacklogVnd: 4000000000000,
      contractValueVnd: 2000000000000,
      awardDate: '2024-03-01',
    });

    const summary = BacklogConversionEngine.summarizeBacklog(
      'HHV',
      [item],
      2000000000000, // TTM Revenue = 2,000B VND
      '2024-08-01'
    );

    expect(summary.totalConfirmedBacklogVnd).toBe(4000000000000);
    expect(summary.backlogCoverageYears).toBe(2.0); // 4000 / 2000 = 2.0
    expect(summary.bookToBillRatio).toBe(1.0); // 2000 / 2000 = 1.0
    expect(summary.freshness).toBe('CURRENT');
  });

  it('handles null / 0 TTM revenue safely without throwing or outputting NaN/Infinity', () => {
    const item = makeTestBacklogItem({ remainingBacklogVnd: 1000000000000 });
    const summary = BacklogConversionEngine.summarizeBacklog('HHV', [item], null, '2024-08-01');

    expect(summary.backlogCoverageYears).toBeNull();
    expect(summary.bookToBillRatio).toBeNull();
    expect(summary.totalConfirmedBacklogVnd).toBe(1000000000000);
  });

  it('projects annual revenue and gross profit conversion from confirmed backlog', () => {
    const item = makeTestBacklogItem({
      remainingBacklogVnd: 2000000000000,
      expectedStartDate: '2024-01-01',
      expectedCompletionDate: '2025-12-31',
    });

    const summary = BacklogConversionEngine.summarizeBacklog('HHV', [item], 1000000000000, '2024-08-01');
    const conversion = BacklogConversionEngine.projectRevenueConversion(summary, 15.0); // 15% gross margin

    expect(conversion.conversionStatus).toBe('SCHEDULE_VERIFIED');
    expect(conversion.confirmedBacklogVnd).toBe(2000000000000);
    expect(conversion.projectedGrossProfitVnd).toBe(300000000000); // 2000B * 15% = 300B
    expect(conversion.projectedRevenues.length).toBeGreaterThan(0);
  });
});
