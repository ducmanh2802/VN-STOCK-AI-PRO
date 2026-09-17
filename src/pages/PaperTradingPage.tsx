import React, { useState } from 'react';
import {
  Activity,
  DollarSign,
  RotateCcw,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { Badge } from '../components/ui/Badge';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { useAppStore } from '../store/useAppStore';
import {
  useTradingPortfolio,
  useTradingPositions,
  useTradingOrders,
  useTradingStatus,
  usePlaceTradingOrder,
  useCancelTradingOrder,
} from '../hooks/useMarketQueries';
import { LoadingState } from '../components/ui/LoadingState';
import {
  UNAVAILABLE,
  isFiniteNumber,
  formatAmount,
  formatMillionsVND,
} from './portfolio/metrics';
import type { Order, OrderType } from '../lib/trading/types/trading';
import type { BrokerPosition } from '../lib/trading/execution/BrokerAdapter';

export const PaperTradingPage: React.FC = () => {
  const { openQuickView } = useAppStore();
  const [symbol, setSymbol] = useState('HPG');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [shares, setShares] = useState(100);
  const [limitPrice, setLimitPrice] = useState(21200);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const portfolioQuery = useTradingPortfolio();
  const positionsQuery = useTradingPositions();
  const ordersQuery = useTradingOrders();
  const statusQuery = useTradingStatus();
  const placeOrderMutation = usePlaceTradingOrder();
  const cancelOrderMutation = useCancelTradingOrder();

  const portfolio = portfolioQuery.data;
  const status = statusQuery.data;
  // Canonical arrays — never fabricated into empty lists on failure (fail-closed).
  const orders = Array.isArray(ordersQuery.data) ? ordersQuery.data : null;
  const positions = Array.isArray(positionsQuery.data) ? positionsQuery.data : null;
  const isLoading =
    portfolioQuery.isLoading || statusQuery.isLoading || ordersQuery.isLoading;

  // Server-authoritative freshness states (STALE = cached data + refetch error).
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
  const ordersState = ordersQuery.isError
    ? orders
      ? 'STALE'
      : 'ERROR'
    : orders
    ? 'LIVE'
    : 'DATA_UNAVAILABLE';

  // Canonical server switches: submission is blocked when the engine is
  // halted, in emergency stop, or its status is unavailable (fail-closed UX;
  // the server remains the authoritative gate via EMERGENCY_STOP/TRADING_DISABLED).
  const tradingBlocked =
    statusQuery.isError ||
    status == null ||
    status.tradingEnabled === false ||
    status.emergencyStop === true;
  const tradingBlockedReason =
    status?.emergencyStop === true
      ? 'KHẨN CẤP: Emergency Stop đang bật — mọi lệnh mới bị chặn bởi TradingEngine.'
      : status?.tradingEnabled === false
      ? 'Giao dịch đang bị TẮT trên TradingEngine — không thể gửi lệnh mới.'
      : tradingBlocked
      ? 'Trạng thái TradingEngine chưa sẵn sàng — không thể gửi lệnh mới.'
      : null;

  // Canonical position context for the entered symbol (display-only; the
  // server enforces no-short-selling / anti-pyramiding before execution).
  const canonicalSymbol = symbol.trim().toUpperCase();
  const positionForSymbol: BrokerPosition | null =
    positions?.find((p) => p.symbol.toUpperCase() === canonicalSymbol) ?? null;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Duplicate-submission protection (UX only; the server remains authoritative).
    if (placeOrderMutation.isPending) return;

    // Canonical server switches — never submit into a halted/emergency engine.
    if (tradingBlocked) {
      setErrorMessage(tradingBlockedReason ?? 'Không thể gửi lệnh lúc này.');
      return;
    }

    // Basic UX input validation. Authoritative validation (symbol format,
    // board lot, price band, buying power, risk approval) lives server-side in
    // TradingDataValidator / RiskGuard and is preserved untouched.
    if (!canonicalSymbol) {
      setErrorMessage('Vui lòng nhập mã cổ phiếu.');
      return;
    }

    if (!Number.isInteger(shares) || shares < 100 || shares % 100 !== 0) {
      setErrorMessage('Khối lượng phải là bội số của 100 (Lô chuẩn sàn HOSE/HNX).');
      return;
    }

    if (orderType === 'LIMIT' && (!isFiniteNumber(limitPrice) || limitPrice <= 0)) {
      setErrorMessage('Lệnh LIMIT yêu cầu giá giới hạn hợp lệ (> 0). Giá không hợp lệ sẽ không được tự động thay thế.');
      return;
    }

    try {
      // Canonical submission: POST /api/trading/order → TradingEngine →
      // TradingDataValidator → RiskGuard → OrderManager → PaperBroker.
      const result: Order = await placeOrderMutation.mutateAsync({
        symbol: canonicalSymbol,
        side,
        quantity: shares,
        orderType,
        ...(orderType === 'LIMIT' ? { limitPrice } : {}),
      });
      // Server response is authoritative — never fabricate FILLED here.
      setSuccessMessage(
        `Lệnh ${side} ${shares} ${canonicalSymbol} đã được tiếp nhận — Mã lệnh ${result.id} · Trạng thái: ${result.status}`
      );
    } catch (err: unknown) {
      // Canonical rejection (risk / capital / position / price / session) is
      // displayed verbatim — never reinterpreted as success.
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Không thể đặt lệnh. Lỗi xác thực hoặc từ chối rủi ro.'
      );
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    // Duplicate-submission protection (UX only).
    if (cancelOrderMutation.isPending) return;
    try {
      // Canonical cancel: POST /api/trading/cancel → OrderManager → PaperBroker
      // (OrderStateMachine: only SUBMITTED orders may transition to CANCELLED).
      const cancelled = await cancelOrderMutation.mutateAsync(orderId);
      setSuccessMessage(
        `Đã gửi yêu cầu hủy lệnh ${orderId}${cancelled?.status ? ` — Trạng thái server: ${cancelled.status}` : ''}`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Hủy lệnh thất bại.');
    }
  };

  return (
    <div id="page-paper-trading" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#263244]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold font-sans text-slate-100">
              Paper Trading & Simulation Studio
            </h1>
            <DataStatusBadge
              status={
                isLoading
                  ? 'LOADING'
                  : portfolioQuery.isError || ordersQuery.isError || statusQuery.isError
                  ? portfolio || orders || status
                    ? 'STALE'
                    : 'ERROR'
                  : 'LIVE'
              }
              source="PaperBroker (Server Engine)"
              compact
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Môi trường giao dịch giả lập thực tế với khớp lệnh server-side, kiểm duyệt RiskGuard và TradingDataValidator
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              portfolioQuery.refetch();
              ordersQuery.refetch();
              statusQuery.refetch();
            }}
            leftIcon={RefreshCw}
          >
            Làm mới dữ liệu
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12">
          <LoadingState variant="terminal" message="Đang kết nối TradingEngine & PaperBroker..." />
        </div>
      ) : (
        <>
          {/* Top Simulation Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="SỐ DƯ TIỀN MẶT KHẢ DỤNG"
              value={
                isFiniteNumber(portfolio?.availableCash)
                  ? `${formatMillionsVND(portfolio.availableCash)} VND`
                  : UNAVAILABLE
              }
              subValue={
                isFiniteNumber(portfolio?.equity)
                  ? `Tổng vốn: ${formatMillionsVND(portfolio.equity)} VND`
                  : `Tổng vốn: ${UNAVAILABLE}`
              }
              status={portfolioState}
              icon={DollarSign}
            />

            <MetricCard
              label="TỔNG SỐ LỆNH ĐÃ ĐẶT"
              value={orders === null ? UNAVAILABLE : orders.length}
              subValue="Ghi nhận trong phiên làm việc hiện tại"
              badge={orders !== null && orders.length > 0 ? 'ACTIVE' : 'READY'}
              badgeVariant={orders !== null && orders.length > 0 ? 'indigo' : 'neutral'}
              status={ordersState}
            />

            <MetricCard
              label="KIỂM DUYỆT RỦI RO (RISKGUARD)"
              value={
                status == null ? UNAVAILABLE : status.emergencyStop ? 'EMERGENCY STOP' : 'PROTECTED'
              }
              subValue="TradingDataValidator + RiskGuard kiểm duyệt mọi lệnh phía server"
              badge={status?.emergencyStop ? 'STOPPED' : status != null ? 'ENFORCED' : undefined}
              badgeVariant={status?.emergencyStop ? 'danger' : 'success'}
              icon={ShieldCheck}
              status={statusState}
            />

            <MetricCard
              label="TRẠNG THÁI SÀN KHỚP LỆNH"
              value={
                status == null ? UNAVAILABLE : status.tradingEnabled ? 'ACTIVE (Paper)' : 'HALTED'
              }
              subValue={`Chế độ: ${status?.brokerMode ?? UNAVAILABLE} · Giả lập (Paper Only)`}
              badge="PAPER BROKER"
              badgeVariant="neutral"
              status={statusState}
            />
          </div>

          {/* Feedback Banners */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-400 text-xs font-mono">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-emerald-400 text-xs font-mono">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Order Entry & Order History Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Order Placement Form (1 Col) */}
            <div className="bg-[#111827] border border-[#263244] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#263244]">
                <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200">
                  Đặt lệnh giao dịch (TradingEngine)
                </span>
                <span className="text-[10px] font-mono text-emerald-400">SERVER-VALIDATED</span>
              </div>

              <form onSubmit={handlePlaceOrder} className="space-y-4">
                {/* Side Toggle: BUY / SELL */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSide('BUY')}
                    className={`py-2 rounded-lg text-xs font-bold font-mono transition-all ${
                      side === 'BUY'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                        : 'bg-[#0E1522] border border-[#263244] text-slate-400'
                    }`}
                  >
                    MUA (BUY)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide('SELL')}
                    className={`py-2 rounded-lg text-xs font-bold font-mono transition-all ${
                      side === 'SELL'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50'
                        : 'bg-[#0E1522] border border-[#263244] text-slate-400'
                    }`}
                  >
                    BÁN (SELL)
                  </button>
                </div>

                {/* Symbol */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 font-mono">MÃ CỔ PHIẾU</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="HPG, FPT, VCB..."
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#263244] rounded-lg text-sm font-bold font-mono text-slate-100 uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Order Type */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 font-mono">LOẠI LỆNH</label>
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as OrderType)}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#263244] rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="MARKET">Lệnh thị trường (MARKET)</option>
                    <option value="LIMIT">Lệnh giới hạn (LIMIT)</option>
                  </select>
                </div>

                {/* Volume */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 font-mono">
                    KHỐI LƯỢNG (BỘI SỐ 100)
                  </label>
                  <input
                    type="number"
                    step={100}
                    min={100}
                    value={shares}
                    onChange={(e) => setShares(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#263244] rounded-lg text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Canonical position context for SELL (display-only).
                    The server enforces no-short-selling (INSUFFICIENT_POSITION);
                    the UI merely surfaces the authoritative position state. */}
                {side === 'SELL' && (
                  <div className="p-3 bg-[#0E1522] border border-[#263244] rounded-lg space-y-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Vị thế {canonicalSymbol} (PaperBroker):</span>
                      <span className="text-slate-200 font-bold">
                        {positions === null
                          ? UNAVAILABLE
                          : positionForSymbol
                          ? `${formatAmount(positionForSymbol.quantity)} CP`
                          : 'Không có vị thế'}
                      </span>
                    </div>
                    {positions !== null && !positionForSymbol && (
                      <p className="text-[10px] text-rose-400">
                        Bán khống bị cấm — server sẽ từ chối lệnh SELL khi không đủ vị thế (INSUFFICIENT_POSITION).
                      </p>
                    )}
                  </div>
                )}

                {/* Price (if limit) */}
                {orderType === 'LIMIT' && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-400 font-mono">GIÁ GIỚI HẠN (VND)</label>
                    <input
                      type="number"
                      step={100}
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#263244] rounded-lg text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <div className="p-3 bg-[#0E1522] border border-[#263244] rounded-lg space-y-1 text-xs font-mono text-slate-400">
                  <div className="flex justify-between">
                    <span>Quy tắc khớp:</span>
                    <span className="text-slate-200">Server TradingCycle</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bảo vệ rủi ro:</span>
                    <span className="text-emerald-400">RiskGuard Active</span>
                  </div>
                </div>

                {/* Canonical submission gate: engine halted / emergency stop /
                    status unavailable blocks submission (server remains the
                    authoritative gate and re-validates every order). */}
                {tradingBlockedReason && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
                    {tradingBlockedReason}
                  </div>
                )}

                <Button
                  type="submit"
                  variant={side === 'BUY' ? 'success' : 'danger'}
                  size="md"
                  className="w-full font-bold"
                  disabled={placeOrderMutation.isPending || tradingBlocked}
                >
                  {placeOrderMutation.isPending
                    ? 'Đang gửi lệnh vào engine...'
                    : tradingBlocked
                    ? 'Gửi lệnh bị chặn'
                    : side === 'BUY'
                    ? `Gửi Lệnh Mua ${shares} ${canonicalSymbol}`
                    : `Gửi Lệnh Bán ${shares} ${canonicalSymbol}`}
                </Button>
              </form>
            </div>

            {/* Right: Order History (2 Cols) — canonical Order contract only */}
            <div className="lg:col-span-2 bg-[#111827] border border-[#263244] rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 bg-[#0E1522] border-b border-[#263244] flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                  Sổ lệnh &amp; Nhật ký khớp lệnh ({orders === null ? UNAVAILABLE : orders.length})
                </span>
                <span className="text-[10px] font-mono text-slate-400">TradingEngine Order Book</span>
              </div>

              <div className="overflow-x-auto">
                {orders === null ? (
                  <div className="p-12 text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                    <p className="text-xs font-mono text-amber-400">
                      Không tải được sổ lệnh từ TradingEngine (server-authoritative).
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ordersQuery.refetch()}
                      leftIcon={RefreshCw}
                    >
                      Thử lại
                    </Button>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="p-12 text-center space-y-2 text-slate-400 text-xs">
                    <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                    <p>Chưa có lệnh nào được tạo trong phiên giao dịch hiện tại.</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Hãy nhập mã cổ phiếu và khối lượng để gửi lệnh kiểm duyệt đầu tiên.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#111827] border-b border-[#263244] text-[11px] font-mono text-slate-400">
                        <th className="py-2.5 px-3 font-semibold">Mã lệnh</th>
                        <th className="py-2.5 px-3 font-semibold">Mã CP</th>
                        <th className="py-2.5 px-3 font-semibold">Chiều</th>
                        <th className="py-2.5 px-3 font-semibold">Loại</th>
                        <th className="py-2.5 px-3 font-semibold">Khối lượng</th>
                        <th className="py-2.5 px-3 font-semibold">Giá</th>
                        <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                        <th className="py-2.5 px-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#263244]">
                      {orders.map((ord: Order) => {
                        // Canonical OrderStatus chip colors — only statuses that
                        // exist in the canonical contract are styled; unknown
                        // values fall through to the neutral amber state.
                        const statusChipClass =
                          ord.status === 'FILLED' || ord.status === 'SETTLED'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : ord.status === 'CANCELLED' || ord.status === 'EXPIRED'
                            ? 'bg-slate-700 text-slate-400'
                            : ord.status === 'REJECTED' || ord.status === 'FAILED'
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-amber-500/10 text-amber-400'; // NEW/VALIDATED/AUTHORIZED/SUBMITTED/PARTIALLY_FILLED
                        // Cancel is canonical only for SUBMITTED orders
                        // (OrderStateMachine: SUBMITTED → CANCELLED via PaperBroker).
                        const cancellable = ord.status === 'SUBMITTED';

                        return (
                          <tr key={ord.id} className="hover:bg-[#182231] transition-colors font-mono">
                            <td className="py-3 px-3 text-slate-400 text-[11px]">{ord.id}</td>
                            <td className="py-3 px-3 font-bold text-slate-100">
                              <button
                                onClick={() => openQuickView(ord.symbol)}
                                className="hover:text-indigo-400"
                              >
                                {ord.symbol}
                              </button>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  ord.side === 'BUY'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-rose-500/10 text-rose-400'
                                }`}
                              >
                                {ord.side}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-300">{ord.type}</td>
                            <td className="py-3 px-3 text-slate-200">
                              {formatAmount(ord.quantity)}
                            </td>
                            <td className="py-3 px-3 text-slate-200">
                              {/* MARKET orders legitimately have no limit price;
                                  null stays '—', never fabricated as 0. */}
                              {ord.type === 'LIMIT' && isFiniteNumber(ord.limitPrice)
                                ? formatAmount(ord.limitPrice)
                                : UNAVAILABLE}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusChipClass}`}>
                                {ord.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              {cancellable ? (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => handleCancelOrder(ord.id)}
                                  disabled={cancelOrderMutation.isPending}
                                >
                                  Hủy
                                </Button>
                              ) : (
                                <span className="text-slate-500 text-[11px]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
