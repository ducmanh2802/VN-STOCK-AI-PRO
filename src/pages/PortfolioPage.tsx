import React from 'react';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  ShieldAlert,
  Plus,
  RefreshCw,
  ChevronRight,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { MetricCard } from '../components/ui/MetricCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { useAppStore } from '../store/useAppStore';
import {
  useTradingPortfolio,
  useTradingPositions,
  useTradingStatus,
} from '../hooks/useMarketQueries';
import { LoadingState } from '../components/ui/LoadingState';

export const PortfolioPage: React.FC = () => {
  const { openQuickView, setCurrentView } = useAppStore();
  const portfolioQuery = useTradingPortfolio();
  const positionsQuery = useTradingPositions();
  const statusQuery = useTradingStatus();

  const isLoading = portfolioQuery.isLoading || positionsQuery.isLoading;
  const isError = portfolioQuery.isError || positionsQuery.isError;
  const portfolio = portfolioQuery.data;
  const positions = positionsQuery.data || [];

  // Server-authoritative values
  const totalCash = portfolio?.cash ?? 0;
  const totalEquity = portfolio?.equity ?? totalCash;
  const totalMarketValue = portfolio?.marketValue ?? 0;
  const unrealizedPnL = portfolio?.unrealizedPnL ?? 0;
  const realizedPnL = portfolio?.realizedPnL ?? 0;
  const totalReturnPercent = portfolio?.unrealizedPnLPercent ?? 0;

  // Sector allocation (derived from actual positions if any)
  const sectorMap = positions.reduce((acc: Record<string, number>, p: any) => {
    const sec = p.sector || 'Chưa phân loại';
    const val = (p.shares || p.quantity || 0) * (p.currentPrice || p.lastPrice || 0);
    acc[sec] = (acc[sec] || 0) + val;
    return acc;
  }, {});

  const handleRefresh = () => {
    portfolioQuery.refetch();
    positionsQuery.refetch();
    statusQuery.refetch();
  };

  return (
    <div id="page-portfolio" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#263244]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Briefcase className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold font-sans text-slate-100">
              Portfolio Analytics & Asset Allocation
            </h1>
            <DataStatusBadge
              status={isLoading ? 'LOADING' : isError ? 'ERROR' : 'LIVE'}
              source="PaperBroker (Server-Authoritative)"
              compact
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Theo dõi danh mục, cơ cấu tài sản, số dư tài khoản giao dịch giả lập xác thực từ TradingEngine
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            leftIcon={RefreshCw}
            disabled={isLoading}
          >
            Đồng bộ NAV
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCurrentView('paper-trading')}
            leftIcon={Plus}
          >
            Đặt lệnh mới
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12">
          <LoadingState variant="terminal" message="Đang đồng bộ số dư danh mục từ PaperBroker..." />
        </div>
      ) : (
        <>
          {/* Top Portfolio Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="TỔNG GIÁ TRỊ TÀI SẢN (NAV)"
              value={`${(totalEquity / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr VND`}
              subValue={`Tiền mặt: ${(totalCash / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr (${totalEquity > 0 ? ((totalCash / totalEquity) * 100).toFixed(1) : '100'}%)`}
              icon={DollarSign}
              status={isError ? 'DATA_UNAVAILABLE' : 'LIVE'}
            />

            <MetricCard
              label="LÃI / LỖ TẠM TÍNH (UNREALIZED)"
              value={`${unrealizedPnL >= 0 ? '+' : ''}${(unrealizedPnL / 1000000).toFixed(2)} tr`}
              change={totalReturnPercent}
              subValue={`Lãi chốt (Realized): ${(realizedPnL / 1000000).toFixed(2)} tr`}
              badge={unrealizedPnL >= 0 ? 'PROFITABLE' : 'LOSS'}
              badgeVariant={unrealizedPnL >= 0 ? 'success' : 'danger'}
              status={isError ? 'DATA_UNAVAILABLE' : 'LIVE'}
            />

            <MetricCard
              label="GIÁ TRỊ DANH MỤC CỔ PHIẾU"
              value={`${(totalMarketValue / 1000000).toFixed(2)} tr VND`}
              subValue={`Số vị thế mở: ${positions.length}`}
              badge={positions.length > 0 ? 'ACTIVE' : 'ALL CASH'}
              badgeVariant={positions.length > 0 ? 'indigo' : 'neutral'}
              status={isError ? 'DATA_UNAVAILABLE' : 'LIVE'}
            />

            <MetricCard
              label="TRẠNG THÁI ENGINE"
              value={statusQuery.data?.tradingEnabled ? 'ACTIVE' : 'READY'}
              subValue={`Chế độ: ${statusQuery.data?.brokerMode || 'PAPER'} · RiskGuard: BẬT`}
              badge={statusQuery.data?.emergencyStop ? 'EMERGENCY STOP' : 'ONLINE'}
              badgeVariant={statusQuery.data?.emergencyStop ? 'danger' : 'success'}
              icon={ShieldAlert}
              status={isError ? 'DATA_UNAVAILABLE' : 'LIVE'}
            />
          </div>

          {/* Holdings and Allocation Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Positions Table (2 Cols) */}
            <div className="lg:col-span-2 bg-[#111827] border border-[#263244] rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 bg-[#0E1522] border-b border-[#263244] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                    Danh mục vị thế nắm giữ ({positions.length})
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Tổng giá trị cổ phiếu: {(totalMarketValue / 1000000).toFixed(2)} tr VND
                </span>
              </div>

              <div className="overflow-x-auto">
                {positions.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <Layers className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      Tài khoản Paper Trading hiện chưa có vị thế mở nào. 100% tài sản đang ở trạng thái Tiền mặt an toàn.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentView('paper-trading')}
                      rightIcon={ArrowUpRight}
                    >
                      Mở giao diện đặt lệnh
                    </Button>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#111827] border-b border-[#263244] text-[11px] font-mono text-slate-400">
                        <th className="py-2.5 px-3 font-semibold">Mã CP</th>
                        <th className="py-2.5 px-3 font-semibold">Khối lượng</th>
                        <th className="py-2.5 px-3 font-semibold">Giá vốn</th>
                        <th className="py-2.5 px-3 font-semibold">Giá hiện tại</th>
                        <th className="py-2.5 px-3 font-semibold">Lãi / Lỗ</th>
                        <th className="py-2.5 px-3 font-semibold">Tỷ trọng</th>
                        <th className="py-2.5 px-3 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#263244]">
                      {positions.map((pos: any) => {
                        const shares = pos.shares || pos.quantity || 0;
                        const avgPrice = pos.avgPrice || pos.averagePrice || 0;
                        const currentPrice = pos.currentPrice || pos.lastPrice || avgPrice;
                        const mktVal = shares * currentPrice;
                        const costVal = shares * avgPrice;
                        const pnl = pos.unrealizedPnL ?? (mktVal - costVal);
                        const pnlPercent = costVal > 0 ? (pnl / costVal) * 100 : 0;
                        const weight = totalEquity > 0 ? (mktVal / totalEquity) * 100 : 0;

                        return (
                          <tr
                            key={pos.symbol}
                            onClick={() => openQuickView(pos.symbol)}
                            className="hover:bg-[#182231] transition-colors cursor-pointer group"
                          >
                            <td className="py-3 px-3">
                              <span className="font-mono font-bold text-slate-100 group-hover:text-indigo-400">
                                {pos.symbol}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-300 font-semibold">
                              {shares.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-400">
                              {avgPrice.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold text-slate-100">
                              {currentPrice.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 font-mono">
                              <div className={pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                <span className="font-bold">
                                  {pnl >= 0 ? '+' : ''}{(pnl / 1000000).toFixed(2)} tr
                                </span>
                                <span className="block text-[10px]">
                                  {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono">
                              <span className="text-slate-200 font-medium">{weight.toFixed(1)}%</span>
                              <div className="w-12 h-1 bg-[#1E293B] rounded-full mt-1 overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(weight, 100)}%` }} />
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 ml-auto" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Sector Allocation Breakdown (1 Col) */}
            <div className="bg-[#111827] border border-[#263244] rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#263244]">
                <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-indigo-400" />
                  Phân bổ theo ngành
                </span>
                <span className="text-[10px] font-mono text-slate-400">Tỷ trọng</span>
              </div>

              {positions.length === 0 ? (
                <div className="py-8 text-center space-y-2 text-slate-400 text-xs">
                  <p>100% Tiền mặt (Cash Reserve)</p>
                  <p className="text-[11px] text-slate-500 font-mono">Chưa phân bổ vào nhóm ngành cổ phiếu</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(sectorMap).map(([sec, val]) => {
                    const pct = totalMarketValue > 0 ? ((val as number) / totalMarketValue) * 100 : 0;
                    return (
                      <div key={sec} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-slate-300 font-sans">{sec}</span>
                          <span className="text-slate-100 font-bold">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#1E293B] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-3 border-t border-[#263244] space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span className="font-medium">Giám sát rủi ro (RiskGuard)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Cơ chế RiskGuard tự động kiểm duyệt giới hạn tối đa 25% cho một mã cổ phiếu và 35% cho một ngành trước khi lệnh được gửi vào sàn giả lập.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
