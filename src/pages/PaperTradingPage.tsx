import React, { useState } from 'react';
import {
  Activity,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock3,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { MetricCard } from '../components/ui/MetricCard';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { useAppStore } from '../store/useAppStore';
import {
  useCancelTradingOrder,
  usePlaceTradingOrder,
  useTradingOrders,
  useTradingPortfolio,
  useTradingPositions,
  useTradingStatus,
} from '../hooks/useMarketQueries';
import type { Order, OrderType } from '../lib/trading/types/trading';
import type { BrokerPosition } from '../lib/trading/execution/BrokerAdapter';
import {
  formatAmount,
  formatMillionsVND,
  isFiniteNumber,
  UNAVAILABLE,
} from './portfolio/metrics';

const statusTone = (status?: string): 'up' | 'down' | 'subtle' => {
  if (status === 'FILLED' || status === 'SETTLED') return 'up';
  if (status === 'REJECTED' || status === 'FAILED' || status === 'CANCELLED') return 'down';
  return 'subtle';
};

export const PaperTradingPage: React.FC = () => {
  const { openQuickView } = useAppStore();
  const [symbol, setSymbol] = useState('HPG');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [quantity, setQuantity] = useState('100');
  const [price, setPrice] = useState('100000');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const portfolioQuery = useTradingPortfolio();
  const positionsQuery = useTradingPositions();
  const statusQuery = useTradingStatus();
  const ordersQuery = useTradingOrders();
  const placeOrderMutation = usePlaceTradingOrder();
  const cancelOrderMutation = useCancelTradingOrder();

  const portfolio = portfolioQuery.data;
  const positions: BrokerPosition[] = positionsQuery.data ?? portfolio?.positions ?? [];
  const orders: Order[] | null = ordersQuery.data ?? (portfolio?.openOrders ? (portfolio.openOrders as Order[]) : null);
  const status = statusQuery.data;

  const canonicalSymbol = symbol.trim().toUpperCase();
  const shares = Number(quantity);

  const isEmergencyStop = status?.emergencyStop === true;
  const isTradingDisabled = status?.tradingEnabled === false;
  const isStatusUnavailable = status === undefined || status === null;
  const isBlocked = isEmergencyStop || isTradingDisabled || isStatusUnavailable;

  let blockReason = '';
  if (isEmergencyStop) {
    blockReason = 'KHẨN CẤP: Emergency Stop đang kích hoạt trên TradingEngine.';
  } else if (isTradingDisabled) {
    blockReason = 'Giao dịch đang bị TẮT trên TradingEngine (HALTED).';
  } else if (isStatusUnavailable) {
    blockReason = 'Trạng thái TradingEngine chưa sẵn sàng.';
  }

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

  const positionForSymbol = positions.find(
    (p: BrokerPosition) => p.symbol.trim().toUpperCase() === canonicalSymbol
  );

  const refresh = () => {
    portfolioQuery.refetch();
    positionsQuery.refetch();
    statusQuery.refetch();
    ordersQuery.refetch();
  };

  const handleSubmitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    // UX only; the server remains authoritative
    if (placeOrderMutation.isPending) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!Number.isInteger(shares) || shares <= 0 || shares % 100 !== 0) {
      setErrorMessage('Khối lượng phải là số nguyên dương và là bội số của 100 (lô chẵn).');
      return;
    }

    const parsedPrice = Number(price);
    const limitPrice = orderType === 'LIMIT' ? parsedPrice : undefined;
    if (orderType === 'LIMIT' && (!isFiniteNumber(limitPrice) || limitPrice <= 0)) {
      setErrorMessage('Giá không hợp lệ sẽ không được tự động thay thế.');
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
      setSuccessMessage(`Lệnh ${result.id} (${result.status}) đã được tiếp nhận bởi hệ thống.`);
      setQuantity('100');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi không xác định khi gửi lệnh.');
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await cancelOrderMutation.mutateAsync(orderId);
      setSuccessMessage(`Lệnh ${orderId} đã được gửi yêu cầu hủy.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi không xác định khi hủy lệnh.');
    }
  };

  const isLoading =
    portfolioQuery.isLoading ||
    positionsQuery.isLoading ||
    statusQuery.isLoading ||
    ordersQuery.isLoading;

  if (isLoading) {
    return (
      <div id="page-paper-trading" className="py-16">
        <LoadingState
          variant="terminal"
          message="Đang đồng bộ trạng thái giao dịch, tài khoản và sổ lệnh..."
        />
      </div>
    );
  }

  return (
    <div id="page-paper-trading" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-terminal-border/70 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-md border border-terminal-accent/30 bg-terminal-accent/10 p-2 text-terminal-accent">
            <Activity className="size-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-terminal-accent">
                Trading &amp; risk
              </p>
              <DataStatusBadge
                status={
                  portfolioQuery.isError || statusQuery.isError || ordersQuery.isError
                    ? portfolio || status || orders
                      ? 'STALE'
                      : 'ERROR'
                    : portfolio && status
                    ? 'LIVE'
                    : 'DATA_UNAVAILABLE'
                }
                source="Trading API"
                compact
              />
            </div>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-terminal-text-primary sm:text-xl">
              Paper Trading Workspace
            </h1>
            <p className="mt-1 text-xs text-terminal-text-muted">
              Canonical account state, risk controls, positions and order lifecycle.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} leftIcon={RefreshCw}>
          Refresh state
        </Button>
      </header>

      {isBlocked && (
        <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
          <div className="flex items-center gap-2 font-semibold">
            <Ban className="size-4" />
            <span>Gửi lệnh bị chặn: {blockReason}</span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <XCircle className="size-4" aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div role="status" className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="TIỀN KHẢ DỤNG"
          value={
            isFiniteNumber(portfolio?.availableCash)
              ? `${formatMillionsVND(portfolio.availableCash)} VND`
              : UNAVAILABLE
          }
          icon={WalletCards}
          status={portfolioState}
        />
        <MetricCard
          label="TỔNG TÀI SẢN (EQUITY)"
          value={
            isFiniteNumber(portfolio?.equity)
              ? `${formatMillionsVND(portfolio.equity)} VND`
              : UNAVAILABLE
          }
          icon={WalletCards}
          status={portfolioState}
        />
        <MetricCard
          label="TRẠNG THÁI GIAO DỊCH"
          value={
            status?.emergencyStop
              ? 'EMERGENCY STOP'
              : status?.tradingEnabled
              ? 'ENABLED'
              : isStatusUnavailable
              ? UNAVAILABLE
              : 'HALTED'
          }
          badge={status?.emergencyStop ? 'EMERGENCY STOP' : status?.tradingEnabled ? 'ENABLED' : 'HALTED'}
          badgeVariant={status?.emergencyStop ? 'danger' : status?.tradingEnabled ? 'success' : 'danger'}
          icon={status?.emergencyStop ? Ban : ShieldCheck}
          status={statusState}
        />
        <MetricCard
          label="CHẾ ĐỘ THỰC THI (RISKGUARD)"
          value={status?.brokerMode ?? UNAVAILABLE}
          subValue="Xác thực server-authoritative"
          icon={ShieldCheck}
          status={statusState}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <section aria-labelledby="order-entry-heading" className="rounded-lg border border-terminal-border bg-terminal-surface p-4">
          <div className="mb-4 flex items-center gap-2 border-b border-terminal-border pb-3">
            <ChevronRight className="size-4 text-terminal-accent" />
            <h2 id="order-entry-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-terminal-text-primary">
              Order entry
            </h2>
          </div>
          <form onSubmit={handleSubmitOrder} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted">
                Chiều lệnh
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value as 'BUY' | 'SELL')}
                  className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs text-terminal-text-primary"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted">
                Mã CP
                <input
                  required
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs font-mono text-terminal-text-primary"
                  placeholder="HPG"
                />
              </label>

              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted">
                Khối lượng
                <input
                  required
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs font-mono text-terminal-text-primary"
                  placeholder="100"
                />
              </label>

              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted">
                Loại lệnh
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as OrderType)}
                  className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs text-terminal-text-primary"
                >
                  <option value="MARKET">MARKET</option>
                  <option value="LIMIT">LIMIT</option>
                </select>
              </label>

              {orderType === 'LIMIT' && (
                <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted sm:col-span-2">
                  Giá giới hạn (VND)
                  <input
                    required
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs font-mono text-terminal-text-primary"
                    placeholder="100000"
                  />
                </label>
              )}
            </div>

            {side === 'SELL' && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                {positionForSymbol ? (
                  <p>Vị thế khả dụng: {formatAmount(positionForSymbol.quantity)} CP</p>
                ) : (
                  <p>Bán khống bị cấm (INSUFFICIENT_POSITION): Chưa có vị thế {canonicalSymbol} để bán.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-terminal-text-muted">
                Lệnh được kiểm tra rủi ro và xác thực bởi TradingEngine phía server.
              </p>
              <Button
                type="submit"
                variant={side === 'BUY' ? 'success' : 'danger'}
                disabled={isBlocked || placeOrderMutation.isPending}
              >
                {placeOrderMutation.isPending
                  ? 'Đang gửi lệnh vào engine...'
                  : `Gửi Lệnh ${side === 'BUY' ? 'Mua' : 'Bán'} ${shares} ${canonicalSymbol}`}
              </Button>
            </div>
          </form>
        </section>

        <section aria-labelledby="positions-heading" className="rounded-lg border border-terminal-border bg-terminal-surface p-4">
          <div className="mb-4 flex items-center justify-between border-b border-terminal-border pb-3">
            <h2 id="positions-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-terminal-text-primary">
              Vị thế nắm giữ
            </h2>
            <span className="text-[10px] font-mono text-terminal-text-muted">
              {positions.length} mã
            </span>
          </div>
          {positions.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center text-xs text-terminal-text-muted">
              Chưa có vị thế nào
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {positions.map((pos: BrokerPosition) => (
                <div key={pos.symbol} className="flex items-center justify-between rounded border border-terminal-border/60 bg-terminal-bg p-2 text-xs">
                  <div>
                    <button
                      className="font-mono font-bold text-terminal-accent hover:underline"
                      onClick={() => openQuickView(pos.symbol)}
                    >
                      {pos.symbol}
                    </button>
                    <p className="text-[10px] text-terminal-text-muted">
                      KL: {formatAmount(pos.quantity)} CP
                    </p>
                  </div>
                  <div className="text-right font-mono">
                    <p>{formatMillionsVND(pos.marketValue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="orders-heading" className="rounded-lg border border-terminal-border bg-terminal-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-terminal-border px-4 py-3">
          <div className="flex items-center gap-2 text-terminal-accent">
            <Clock3 className="size-4" />
            <h2 id="orders-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-terminal-text-primary">
              Sổ lệnh
            </h2>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-terminal-text-muted">
            {orders ? `${orders.length} lệnh` : UNAVAILABLE}
          </span>
        </div>

        <div className="overflow-x-auto">
          {ordersQuery.isError && (!orders || orders.length === 0) ? (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-xs text-rose-300">
              <p>Không tải được sổ lệnh</p>
              <Button variant="outline" size="xs" onClick={() => ordersQuery.refetch()}>
                Thử lại
              </Button>
            </div>
          ) : !orders || orders.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center text-xs text-terminal-text-muted">
              Chưa có lệnh nào
            </div>
          ) : (
            <table className="min-w-[760px] w-full text-left text-xs">
              <thead>
                <tr className="border-b border-terminal-border text-[10px] uppercase tracking-wider text-terminal-text-muted">
                  <th className="px-4 py-3">Mã lệnh</th>
                  <th className="px-4 py-3">Mã CP</th>
                  <th className="px-4 py-3">Chiều</th>
                  <th className="px-4 py-3">Khối lượng</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((ord: Order) => (
                  <tr key={ord.id} className="border-b border-terminal-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-terminal-accent">{ord.id}</td>
                    <td className="px-4 py-3">
                      <button
                        className="font-mono font-semibold text-terminal-text-primary hover:text-terminal-accent"
                        onClick={() => openQuickView(ord.symbol)}
                      >
                        {ord.symbol}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ord.side === 'BUY' ? 'up' : 'down'}>{ord.side}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-terminal-text-primary">
                      {formatAmount(ord.quantity)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {ord.type} {ord.type === 'LIMIT' ? `@ ${formatAmount(ord.limitPrice)}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusTone(ord.status)}>{ord.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ord.status === 'SUBMITTED' ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleCancelOrder(ord.id)}
                          disabled={cancelOrderMutation.isPending}
                        >
                          Hủy
                        </Button>
                      ) : (
                        <span className="text-terminal-text-disabled">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="flex items-center gap-2 text-[11px] text-terminal-text-muted">
        <ShieldCheck className="size-3.5 text-terminal-accent" /> Execution mode:{' '}
        <span className="font-mono text-terminal-text-primary">
          {status?.brokerMode ?? UNAVAILABLE}
        </span>{' '}
        · no live broker path is introduced by this workspace.
      </div>
    </div>
  );
};
