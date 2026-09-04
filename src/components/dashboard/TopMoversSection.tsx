import React, { useState } from 'react';
import { TopMover } from '../../types/stock';
import { TopGainersWidget } from './TopGainersWidget';
import { TopLosersWidget } from './TopLosersWidget';
import { MostActiveWidget } from './MostActiveWidget';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { DemoBadge } from '../common/DemoBadge';
import { Flame, ArrowUpRight, ArrowDownRight, BarChart2, LayoutGrid, Columns } from 'lucide-react';

export interface TopMoversSectionProps {
  gainers: TopMover[];
  losers: TopMover[];
  active: TopMover[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelectStock?: (symbol: string) => void;
  onToggleWatchlist?: (symbol: string) => void;
  isWatchlisted?: (symbol: string) => boolean;
  className?: string;
}

type TabType = 'gainers' | 'losers' | 'active';

export const TopMoversSection: React.FC<TopMoversSectionProps> = ({
  gainers,
  losers,
  active,
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  onSelectStock,
  onToggleWatchlist,
  isWatchlisted,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('gainers');
  const [denseMode, setDenseMode] = useState<boolean>(true); // dense 3 columns on desktop

  return (
    <div id="section-top-movers-container" className={`space-y-3 ${className}`}>
      {/* Dense Terminal Grid (Desktop) */}
      <div className={`${denseMode ? 'hidden xl:grid xl:grid-cols-3 gap-3' : 'hidden'}`}>
        <TopGainersWidget
          gainers={gainers}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          onSelectStock={onSelectStock}
          onToggleWatchlist={onToggleWatchlist}
          isWatchlisted={isWatchlisted}
          limit={5}
        />
        <TopLosersWidget
          losers={losers}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          onSelectStock={onSelectStock}
          onToggleWatchlist={onToggleWatchlist}
          isWatchlisted={isWatchlisted}
          limit={5}
        />
        <MostActiveWidget
          active={active}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          onSelectStock={onSelectStock}
          onToggleWatchlist={onToggleWatchlist}
          isWatchlisted={isWatchlisted}
          limit={5}
        />
      </div>

      {/* Tabbed / Mobile Card */}
      <div className={denseMode ? 'xl:hidden' : 'block'}>
        <Card id="card-top-movers-tabbed" variant="default" density="compact" className="space-y-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-terminal-surface-subtle border border-terminal-border text-terminal-ref">
                <Flame className="w-4 h-4" />
              </div>
              <CardTitle className="text-xs sm:text-sm font-bold tracking-tight uppercase font-mono">
                Biến Động Nổi Bật (Top Movers)
              </CardTitle>
              <DemoBadge size="sm" />
            </div>

            {/* Tab Controls */}
            <div className="flex items-center p-0.5 rounded bg-terminal-bg border border-terminal-border">
              <button
                id="tab-btn-gainers"
                onClick={() => setActiveTab('gainers')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                  activeTab === 'gainers'
                    ? 'bg-terminal-up/15 text-terminal-up border border-terminal-up/30 shadow-xs font-semibold'
                    : 'text-terminal-text-muted hover:text-terminal-text-secondary'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Tăng
              </button>
              <button
                id="tab-btn-losers"
                onClick={() => setActiveTab('losers')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                  activeTab === 'losers'
                    ? 'bg-terminal-down/15 text-terminal-down border border-terminal-down/30 shadow-xs font-semibold'
                    : 'text-terminal-text-muted hover:text-terminal-text-secondary'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                Giảm
              </button>
              <button
                id="tab-btn-active"
                onClick={() => setActiveTab('active')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
                  activeTab === 'active'
                    ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 shadow-xs font-semibold'
                    : 'text-terminal-text-muted hover:text-terminal-text-secondary'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Thanh Khoản
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {activeTab === 'gainers' && (
              <TopGainersWidget
                gainers={gainers}
                isLoading={isLoading}
                isError={isError}
                error={error}
                onRetry={onRetry}
                onSelectStock={onSelectStock}
                onToggleWatchlist={onToggleWatchlist}
                isWatchlisted={isWatchlisted}
                limit={6}
                className="border-0 shadow-none bg-transparent"
              />
            )}
            {activeTab === 'losers' && (
              <TopLosersWidget
                losers={losers}
                isLoading={isLoading}
                isError={isError}
                error={error}
                onRetry={onRetry}
                onSelectStock={onSelectStock}
                onToggleWatchlist={onToggleWatchlist}
                isWatchlisted={isWatchlisted}
                limit={6}
                className="border-0 shadow-none bg-transparent"
              />
            )}
            {activeTab === 'active' && (
              <MostActiveWidget
                active={active}
                isLoading={isLoading}
                isError={isError}
                error={error}
                onRetry={onRetry}
                onSelectStock={onSelectStock}
                onToggleWatchlist={onToggleWatchlist}
                isWatchlisted={isWatchlisted}
                limit={6}
                className="border-0 shadow-none bg-transparent"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
