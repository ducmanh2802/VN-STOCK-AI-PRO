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
  useTradingOrders,
  useTradingStatus,
  usePlaceTradingOrder,
  useCancelTradingOrder,
} from '../hooks/useMarketQueries';
import { LoadingState } from '../components/ui/LoadingState';

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
  const ordersQuery = useTradingOrders();
  const statusQuery = useTradingStatus();
  const placeOrderMutation = usePlaceTradingOrder();
  const cancelOrderMutation = useCancelTradingOrder();

  const portfolio = portfolioQuery.data;
  const orders = ordersQuery.data || [];
  const status = statusQuery.data;
  const isLoading = portfolioQuery.isLoading || statusQuery.isLoading;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!symbol.trim()) {
      setErrorMessage('Vui lòng nhập mã cổ phiếu.');
      return;
    }

    if (shares < 100 || shares % 100 !== 0) {
      setErrorMessage('Khối lượng phải là bội số của 100 (Lô chuẩn sàn HOSE/HNX).');
      return;
    }

    try {
      const result = await placeOrderMutation.mutateAsync({
        symbol: symbol.trim().toUpperCase(),
        side,
        quantity: shares,
        orderType,
      });
      setSuccessMessage(`Lệnh ${side} ${shares} ${symbol.toUpperCase()} đã được gửi thành công vào TradingEngine!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể đặt lệnh. Lỗi xác thực hoặc từ chối rủi ro.');
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await cancelOrderMutation.mutateAsync(orderId);
      setSuccessMessage(`Đã hủy lệnh ${orderId}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Hủy lệnh thất bại.');
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
              status={isLoading ? 'LOADING' : 'LIVE'}
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
              value={`${((portfolio?.availableCash ?? 100000000) / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr VND`}
              subValue={`Tổng vốn: ${((portfolio?.equity ?? 100000000) / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr VND`}
              status="LIVE"
              icon={DollarSign}
            />

            <MetricCard
              label="TỔNG SỐ LỆNH ĐÃ ĐẶT"
              value={orders.length}
              subValue="Ghi nhận trong phiên làm việc hiện tại"
              badge={orders.length > 0 ? 'ACTIVE' : 'READY'}
              badgeVariant={orders.length > 0 ? 'indigo' : 'neutral'}
              status="LIVE"
            />

            <MetricCard
              label="KIỂM DUYỆT RỦI RO (RISKGUARD)"
              value={status?.emergencyStop ? 'EMERGENCY STOP' : 'PROTECTED'}
              subValue="Cắt lỗ 7% · Tối đa vị thế 25% · Drawdown 5%"
              badge={status?.emergencyStop ? 'STOPPED' : 'ENFORCED'}
              badgeVariant={status?.emergencyStop ? 'danger' : 'success'}
              icon={ShieldCheck}
              status="LIVE"
            />

            <MetricCard
              label="TRẠNG THÁI SÀN KHỚP LỆNH"
              value={status?.tradingEnabled ? 'ACTIVE (Paper)' : 'HALTED'}
              subValue="Chế độ khớp lệnh thị trường giả lập"
              badge="PAPER BROKER"
              badgeVariant="neutral"
              status="LIVE"
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
                    onChange={(e) => setOrderType(e.target.value as any)}
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

                <Button
                  type="submit"
                  variant={side === 'BUY' ? 'success' : 'danger'}
                  size="md"
                  className="w-full font-bold"
                  disabled={placeOrderMutation.isPending}
                >
                  {placeOrderMutation.isPending
                    ? 'Đang gửi lệnh vào engine...'
                    : side === 'BUY'
                    ? `Gửi Lệnh Mua ${shares} ${symbol}`
                    : `Gửi Lệnh Bán ${shares} ${symbol}`}
                </Button>
              </form>
            </div>

            {/* Right: Order History (2 Cols) */}
            <div className="lg:col-span-2 bg-[#111827] border border-[#263244] rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 bg-[#0E1522] border-b border-[#263244] flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                  Sổ lệnh & Nhật ký khớp lệnh ({orders.length})
                </span>
                <span className="text-[10px] font-mono text-slate-400">TradingEngine Order Book</span>
              </div>

              <div className="overflow-x-auto">
                {orders.length === 0 ? (
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
                      {orders.map((ord: any) => (
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
                          <td className="py-3 px-3 text-slate-300">{ord.orderType || ord.type}</td>
                          <td className="py-3 px-3 text-slate-200">
                            {(ord.quantity || ord.shares || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-slate-200">
                            {(ord.price || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                ord.status === 'FILLED'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : ord.status === 'CANCELLED'
                                  ? 'bg-slate-700 text-slate-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {ord.status === 'PENDING' || ord.status === 'SUBMITTED' ? (
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
                      ))}
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
