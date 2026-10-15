import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AIMarketSummaryCard } from '../AIMarketSummaryCard.tsx';
import type { AIMarketSummary } from '../../../types/market';

describe('AIMarketSummaryCard', () => {
  const makeSummary = (overrides: Partial<AIMarketSummary> = {}): AIMarketSummary => ({
    trend: 'TRUNG TÍNH' as const,
    trendScore: 55,
    moneyFlow: 'x',
    strongSectors: [],
    weakSectors: [],
    riskAlerts: [],
    overallComment: 'y',
    disclaimer: 'z',
    updatedAt: '10:00',
    isDemo: false,
    ...overrides,
  });

  // Only the '1. Xu Hướng Thị Trường' block: Signal's own badge elsewhere in the card also uses up/down classes.
  const trendSection = (html: string) => html.slice(html.indexOf('1. Xu Hướng Thị Trường'), html.indexOf('2. Vận Động Dòng Tiền'));

  describe('trend badge', () => {
    it('renders down badge for TIÊU CỰC trend', () => {
      const html = renderToStaticMarkup(
        <AIMarketSummaryCard summary={makeSummary({ trend: 'TIÊU CỰC', trendScore: 38 })} />
      );
      expect(html).toContain('TIÊU CỰC');
      expect(html).toContain('điểm quy tắc 38/100');
      expect(html).not.toContain('bg-terminal-up/12');
      expect(html).not.toContain('duy trì xu thế tăng điểm');
      expect(html).not.toContain('Hấp thụ tốt');
      expect(html).not.toContain('CALCULATED');
      expect(html).toContain('RULE-BASED');
      expect(trendSection(html)).toContain('bg-terminal-down/12');
    });

    it('renders up badge for TÍCH CỰC trend', () => {
      const html = renderToStaticMarkup(
        <AIMarketSummaryCard summary={makeSummary({ trend: 'TÍCH CỰC', trendScore: 72 })} />
      );
      expect(html).toContain('điểm quy tắc 72/100');
      expect(html).toContain('bg-terminal-up/12');
      expect(html).not.toContain('bg-terminal-down/12');
      expect(trendSection(html)).toContain('bg-terminal-up/12');
    });

    it('renders default badge for TRUNG TÍNH trend', () => {
      const html = renderToStaticMarkup(
        <AIMarketSummaryCard summary={makeSummary({ trend: 'TRUNG TÍNH', trendScore: 55 })} />
      );
      expect(html).toContain('điểm quy tắc 55/100');
      expect(html).not.toContain('bg-terminal-up/12');
      expect(trendSection(html)).toContain('bg-terminal-surface-hover');
      expect(trendSection(html)).not.toContain('bg-terminal-down/12');
    });
  });
});