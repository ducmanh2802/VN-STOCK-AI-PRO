/**
 * PHASE 19.5.6 — Portfolio / Positions UI Hardening & Canonical Trading-State Integration.
 *
 * This page is a pure presentation/consumption layer over the canonical
 * paper-trading state served by TradingEngine/PaperBroker (/api/trading/portfolio,
 * /api/trading/positions, /api/trading/status). It performs NO financial
 * recomputation: every displayed value comes verbatim from the canonical
 * contracts (BrokerAccount / BrokerPosition) after presentation-only formatting.
 * Unavailable values (null / undefined / NaN / ±Infinity) render fail-closed as
 * '—' — never as fabricated zeros (docs/metric-contracts.md §1).
 */
import React from 'react';
import {
  Briefcase,
  DollarSign,
  PieChart,
  ShieldAlert,
  Plus,
  RefreshCw,
  ChevronRight,
  Layers,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { MetricCard } from '../components/ui/MetricCard';
import { Button } from '../components/ui/Button';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { useAppStore } from '../store/useAppStore';
import {
  useTradingPortfolio,
  useTradingPositions,
  useTradingStatus,
} from '../hooks/useMarketQueries';
import { LoadingState } from '../components/ui/LoadingState';
import {
  UNAVAILABLE,
  isFiniteNumber,
  formatAmount,
  formatMillionsVND,
  formatSignedMillionsVND,
  formatSignedPercent,
} from './portfolio/metrics';
import type { BrokerPosition } from '../lib/trading/execution/BrokerAdapter';

export const PortfolioPage: React.FC = () => {
  const { openQuickView, setCurrentView } = useAppStore();
  const portfolioQuery = useTradingPortfolio();
  const positionsQuery = useTradingPositions();
  const statusQuery = useTradingStatus();

  const isLoading = portfolioQuery.isLoading || positionsQuery.isLoading;
  const portfolio = portfolioQuery.data;
  const status = statusQuery.data;
  // Canonical positions array — never fabricated into an empty list on failure.
  const positions = Array.isArray(positionsQuery.data) ? positionsQuery.data : null;

  // Server-authoritative values (fail-closed: guarded, never defaulted to 0).
  const cash = portfolio?.cash;
  const availableCash = portfolio?.availableCash;
  const equity = portfolio?.equity;
  const marketValue = portfolio?.marketValue;
  const unrealizedPnL = portfolio?.unrealizedPnL;
  const realizedPnL = portfolio?.realizedPnL;
  const portfolioState = portfolioQuery.isError
    ? portfolio
      ? 'STALE'
      : 'ERROR'
    : portfolio
    ? 'LIVE'
    : 'DATA_UNAVAILABLE';
  const statusState = statusQuery.isError
    ? status
      ? 'STALE'
      : 'ERROR'
    : status
    ? 'LIVE'
    : 'DATA_UNAVAILABLE';

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
              status={
                isLoading
                  ? 'LOADING'
                  : portfolioQuery.isError || positionsQuery.isError || statusQuery.isError
                  ? portfolio || positions || status
                    ? 'STALE'
                    : 'ERROR'
                  : 'LIVE'
              }
              source="PaperBroker (Server-Authoritative)"
              lastUpdated={portfolio?.updatedAt}
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
          {/* Top Portfolio Metrics Cards (all values server-authoritative, presentation-only formatting) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="TỔNG GIÁ TRỊ TÀI SẢN (NAV)"
              value={
                isFiniteNumber(equity)
                  ? `${formatMillionsVND(equity)} VND`
                  : UNAVAILABLE
              }
              subValue={
                isFiniteNumber(cash) && isFiniteNumber(availableCash)
                  ? `Tiền mặt KH dụng: ${formatMillionsVND(availableCash)} / ${formatMillionsVND(cash)}`
                  : `Tiền mặt KH dụng: ${UNAVAILABLE} / ${UNAVAILABLE}`
              }
              icon={DollarSign}
              status={portfolioState}
            />

            <MetricCard
              label="LÃI / LỖ TẠM TÍNH (UNREALIZED)"
              value={formatSignedMillionsVND(unrealizedPnL)}
              subValue={
                isFiniteNumber(realizedPnL)
                  ? `Lãi chốt (Realized): ${formatSignedMillionsVND(realizedPnL)}`
                  : `Lãi chốt (Realized): ${UNAVAILABLE}`
              }
              badge={
                isFiniteNumber(unrealizedPnL)
                  ? unrealizedPnL >= 0
                    ? 'PROFITABLE'
                    : 'LOSS'
                  : undefined
              }
              badgeVariant={
                isFiniteNumber(unrealizedPnL) && unrealizedPnL < 0 ? 'danger' : 'success'
              }
              status={portfolioState}
            />

            <MetricCard
              label="GIÁ TRỊ DANH MỤC CỔ PHIẾU"
              value={
                isFiniteNumber(marketValue)
                  ? `${formatMillionsVND(marketValue)} VND`
                  : UNAVAILABLE
              }
              subValue={`Số vị thế mở: ${positions === null ? UNAVAILABLE : positions.length}`}
              badge={
                positions === null
                  ? undefined
                  : positions.length > 0
                  ? 'ACTIVE'
                  : 'ALL CASH'
              }
              badgeVariant={
                positions !== null && positions.length > 0 ? 'indigo' : 'neutral'
              }
              status={portfolioState}
            />

            <MetricCard
              label="TRẠNG THÁI ENGINE"
              value={
                status == null
                  ? UNAVAILABLE
                  : status.tradingEnabled
                  ? 'ACTIVE'
                  : 'READY'
              }
              subValue={`Chế độ: ${status?.brokerMode ?? UNAVAILABLE} · RiskGuard: BẬT`}
              badge={
                status?.emergencyStop
                  ? 'EMERGENCY STOP'
                  : status != null
                  ? 'ONLINE'
                  : undefined
              }
              badgeVariant={status?.emergencyStop ? 'danger' : 'success'}
              icon={ShieldAlert}
              status={statusState}
            />
          </div>

          {/* Holdings and Allocation Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Positions Table (2 Cols) — canonical BrokerPosition fields only */}
            <div className="lg:col-span-2 bg-[#111827] border border-[#263244] rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 bg-[#0E1522] border-b border-[#263244] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                    Danh mục vị thế nắm giữ ({positions === null ? UNAVAILABLE : positions.length})
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Tổng giá trị cổ phiếu: {isFiniteNumber(marketValue) ? `${formatMillionsVND(marketValue)} VND` : UNAVAILABLE}
                </span>
              </div>

              <div className="overflow-x-auto">
                {positions === null ? (
                  <div className="p-8 text-center space-y-3">
                    <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                    <p className="text-xs font-mono text-amber-400">
                      Không tải được trạng thái vị thế từ PaperBroker (server-authoritative).
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRefresh} leftIcon={RefreshCw}>
                      Thử lại
                    </Button>
                  </div>
                ) : positions.length === 0 ? (
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
                        <th className="py-2.5 px-3 font-semibold">Giá trị thị trường</th>
                        <th className="py-2.5 px-3 font-semibold">Lãi / Lỗ</th>
                        <th className="py-2.5 px-3 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#263244]">
                      {positions.map((pos: BrokerPosition) => {
                        // All values below are canonical BrokerPosition fields rendered
                        // verbatim (presentation-only formatting). NO frontend recomputation:
                        // no market value, P&L, return, exposure, or weight math here.
                        const pnlColor =
                          isFiniteNumber(pos.unrealizedPnL) && pos.unrealizedPnL < 0
                            ? 'text-rose-400'
                            : 'text-emerald-400';

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
                              {formatAmount(pos.quantity)}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-400">
                              {formatAmount(pos.averageCost)}
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold text-slate-100">
                              {formatAmount(pos.currentPrice)}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-200">
                              {formatMillionsVND(pos.marketValue)}
                            </td>
                            <td className="py-3 px-3 font-mono">
                              <div className={pnlColor}>
                                <span className="font-bold">
                                  {formatSignedMillionsVND(pos.unrealizedPnL)}
                                </span>
                                <span className="block text-[10px]">
                                  {formatSignedPercent(pos.unrealizedPnLPercent)}
                                </span>
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

            {/* Sector/Asset Allocation (1 Col).
                The canonical BrokerPosition/BrokerAccount contract exposes NO sector
                classification and NO per-position allocation weights, so this panel
                intentionally performs ZERO frontend computation (Phase 19.5.6 §5/§6):
                allocation/exposure must come from a canonical provider or not display. */}
            <div className="bg-[#111827] border border-[#263244] rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#263244]">
                <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-indigo-400" />
                  Phân bổ tài sản
                </span>
              </div>

              <div className="py-4 text-center space-y-2 text-slate-400 text-xs">
                <p className="font-mono text-amber-400/90">DATA_UNAVAILABLE</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Phân bổ ngành / tỷ trọng vị thế không nằm trong hợp đồng dữ liệu PaperBroker
                  hiện tại. Giá trị này chỉ hiển thị khi có nguồn canonical phía máy chủ.
                </p>
              </div>

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
