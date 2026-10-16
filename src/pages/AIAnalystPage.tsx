import React from 'react';
import type { AIMarketSummary } from '../types/stock.ts';
import { AIMarketSummaryCard } from '../components/dashboard/AIMarketSummaryCard.tsx';

export const AIAnalystPage: React.FC<{ aiSummary: AIMarketSummary }> = ({ aiSummary }) => {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold font-mono text-terminal-text-primary">AI Market Analyst</h1>
      <AIMarketSummaryCard summary={aiSummary} />
    </div>
  );
};
