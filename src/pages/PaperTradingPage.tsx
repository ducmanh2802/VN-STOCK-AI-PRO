import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { useAppStore } from '../store/useAppStore';
import {
  useCancelTradingOrder,
  usePlaceTradingOrder,
  useTradingOrders,
  useTradingPortfolio,
  useTradingPositions,
  useTradingRiskMetrics,
  useTradingStatus,
} from '../hooks/useMarketQueries';

const money = (value: number | null | undefined, currency = 'VND') =>
  value == null ? '—' : `${value.toLocaleString('vi-VN')} ${currency}`;

const statusTone = (status?: string) => {
  if (status === 'FILLED' || status === 'SETTLED' || status === 'OK') return 'up';
  if (status === 'REJECTED' || status === 'FAILED' || status === 'CANCELLED') return 'down';
  return 'subtle';
};

const orderCanCancel = (status?: string) => status === 'NEW' || status === 'VALIDATED' || status === 'AUTHORIZED' || status === 'SUBMITTED' || status === 'PENDING';

export const PaperTradingPage: React.FC = () => {
  const { openQuickView } = useAppStore();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType] = useState<'MARKET'>('MARKET');
  const [quantity, setQuantity] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const portfolioQuery = useTradingPortfolio();
  const positionsQuery = useTradingPositions();
  const statusQuery = useTradingStatus();
  const riskQuery = useTradingRiskMetrics();
  const ordersQuery = useTradingOrders();
  const placeOrderMutation = usePlaceTradingOrder();
  const cancelOrderMutation = useCancelTradingOrder();

  const portfolio = portfolioQuery.data;
  const positions = positionsQuery.data ?? portfolio?.positions ?? [];
  const orders = ordersQuery.data ?? portfolio?.openOrders ?? [];
  const status = statusQuery.data;
  const risk = riskQuery.data;
  const selectedOrder = useMemo(() => orders.find((order: any) => order.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const isLoading = portfolioQuery.isLoading || positionsQuery.isLoading || statusQuery.isLoading || riskQuery.isLoading || ordersQuery.isLoading;
  const hasError = portfolioQuery.error || positionsQuery.error || statusQuery.error || riskQuery.error || ordersQuery.error;

  const refresh = () => {
    portfolioQuery.refetch();
    positionsQuery.refetch();
    statusQuery.refetch();
    riskQuery.refetch();
    ordersQuery.refetch();
  };

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await placeOrderMutation.mutateAsync({
        symbol: symbol.trim().toUpperCase(),
        side,
        quantity: Number(quantity),
        orderType,
      });
      setActionSuccess(`Order ${result?.id ?? ''} accepted by the canonical trading service.`.trim());
      setSymbol('');
      setQuantity('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The canonical trading service rejected the request.');
    }
  };

  const cancelOrder = async (order: any) => {
    if (!window.confirm(`Cancel ${order.side} ${order.quantity} ${order.symbol}?\nCurrent state: ${order.status}\nMode: ${status?.brokerMode ?? 'unknown'}`)) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await cancelOrderMutation.mutateAsync(order.id);
      setActionSuccess(`Order ${order.id} cancellation request accepted.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The canonical trading service rejected cancellation.');
    }
  };

  if (isLoading) {
    return <div id="page-paper-trading" className="py-16"><LoadingState variant="terminal" message="Đang đồng bộ trạng thái giao dịch, tài khoản, rủi ro và sổ lệnh..." /></div>;
  }

  return (
    <div id="page-paper-trading" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-terminal-border/70 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-md border border-terminal-accent/30 bg-terminal-accent/10 p-2 text-terminal-accent"><Activity className="size-4" aria-hidden="true" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-mono uppercase tracking-[0.2em] text-terminal-accent">Trading &amp; risk</p><DataStatusBadge status={hasError ? 'ERROR' : 'LIVE'} source="Trading API" compact /></div>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-terminal-text-primary sm:text-xl">Trading &amp; Risk workspace</h1>
            <p className="mt-1 text-xs text-terminal-text-muted">Canonical account state, risk controls, positions and order lifecycle.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} leftIcon={RefreshCw}>Refresh state</Button>
      </header>

      {hasError && <div role="alert" className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"><AlertTriangle className="size-4" aria-hidden="true" /> Trading data is partially unavailable. Individual section errors remain visible through their status.</div>}
      {actionError && <div role="alert" className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"><XCircle className="size-4" aria-hidden="true" /> {actionError}</div>}
      {actionSuccess && <div role="status" className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><CheckCircle2 className="size-4" aria-hidden="true" /> {actionSuccess}</div>}

      <section aria-labelledby="trading-status-heading" className={`rounded-lg border p-4 ${status?.emergencyStop ? 'border-rose-500/60 bg-rose-500/10' : 'border-terminal-accent/30 bg-terminal-surface'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><div className={`rounded-full p-2 ${status?.emergencyStop ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{status?.emergencyStop ? <Ban className="size-5" /> : <ShieldCheck className="size-5" />}</div><div><h2 id="trading-status-heading" className="text-[10px] font-mono uppercase tracking-[0.18em] text-terminal-text-muted">Trading status</h2><p className="mt-1 text-base font-semibold text-terminal-text-primary">{status?.emergencyStop ? 'EMERGENCY STOP ACTIVE' : status?.tradingEnabled ? 'TRADING ENABLED' : 'TRADING DISABLED'}</p></div></div>
          <div className="flex flex-wrap gap-2"><Badge variant={status?.emergencyStop ? 'down' : status?.tradingEnabled ? 'up' : 'subtle'}>{status?.emergencyStop ? 'BLOCKED' : status?.tradingEnabled ? 'ENABLED' : 'DISABLED'}</Badge><Badge variant="subtle">{status?.brokerMode ?? 'MODE UNAVAILABLE'}</Badge><span className="text-[11px] font-mono text-terminal-text-muted">Session: {status?.session ?? '—'}</span></div>
        </div>
      </section>

      <section aria-labelledby="account-risk-heading" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-terminal-border bg-terminal-surface p-4"><div className="mb-4 flex items-center gap-2"><WalletCards className="size-4 text-terminal-accent" /><h2 id="account-risk-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-terminal-text-primary">Account</h2></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Cash', portfolio?.cash], ['Available cash', portfolio?.availableCash], ['Market value', portfolio?.marketValue], ['Equity', portfolio?.equity]].map(([label, value]) => <div key={label as string}><p className="text-[10px] uppercase tracking-wider text-terminal-text-muted">{label}</p><p className="mt-1 font-mono text-sm text-terminal-text-primary">{money(value as number | undefined)}</p></div>)}</div></div>
        <div className="rounded-lg border border-terminal-border bg-terminal-surface p-4"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-terminal-accent" /><h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-terminal-text-primary">Risk status</h2></div><DataStatusBadge status={risk?.exposure?.status === 'STALE' ? 'STALE' : risk ? 'LIVE' : 'UNAVAILABLE'} source="Risk metrics API" compact /></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><RiskValue label="State" value={risk?.summary ?? 'Risk details unavailable'} /><RiskValue label="Exposure" value={risk?.exposure?.value == null ? '—' : `${risk.exposure.value.toFixed(1)}%`} /><RiskValue label="Approved capital" value={risk?.riskApprovedCapital?.value == null ? '—' : money(risk.riskApprovedCapital.value)} /><RiskValue label="Validation" value={risk?.exposure?.status ?? 'UNAVAILABLE'} /></div></div>
      </section>

      <section aria-labelledby="positions-heading" className="rounded-lg border border-terminal-border bg-terminal-surface"><SectionHeader icon={<WalletCards className="size-4" />} title="Positions" meta={`${positions.length} canonical position${positions.length === 1 ? '' : 's'}`} /><div className="overflow-x-auto">{positions.length === 0 ? <EmptyState label="NO POSITIONS AVAILABLE" /> : <table className="min-w-[720px] w-full text-left text-xs"><thead><tr className="border-b border-terminal-border text-[10px] uppercase tracking-wider text-terminal-text-muted"><th className="px-4 py-3">Symbol</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Average price</th><th className="px-4 py-3">Current price</th><th className="px-4 py-3">Market value</th><th className="px-4 py-3">P&amp;L</th></tr></thead><tbody>{positions.map((position: any) => <tr key={position.symbol ?? position.id} className="border-b border-terminal-border/60 last:border-0"><td className="px-4 py-3"><button className="font-mono font-semibold text-terminal-accent hover:underline" onClick={() => openQuickView(position.symbol)}>{position.symbol}</button></td><td className="px-4 py-3 font-mono text-terminal-text-primary">{position.quantity ?? position.shares ?? '—'}</td><td className="px-4 py-3 font-mono">{money(position.averagePrice ?? position.avgPrice, '')}</td><td className="px-4 py-3 font-mono">{money(position.currentPrice ?? position.markPrice, '')}</td><td className="px-4 py-3 font-mono">{money(position.marketValue, '')}</td><td className="px-4 py-3 font-mono">{money(position.unrealizedPnL ?? position.pnl, '')}</td></tr>)}</tbody></table>}</div></section>

      <section aria-labelledby="orders-heading" className="rounded-lg border border-terminal-border bg-terminal-surface"><SectionHeader icon={<Clock3 className="size-4" />} title="Orders" meta={`${orders.length} canonical order${orders.length === 1 ? '' : 's'}`} /><div className="overflow-x-auto">{orders.length === 0 ? <EmptyState label="NO ORDERS AVAILABLE" /> : <table className="min-w-[860px] w-full text-left text-xs"><thead><tr className="border-b border-terminal-border text-[10px] uppercase tracking-wider text-terminal-text-muted"><th className="px-4 py-3">Order ID</th><th className="px-4 py-3">Symbol</th><th className="px-4 py-3">Side</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">State</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody>{orders.map((order: any) => <tr key={order.id} className={`border-b border-terminal-border/60 last:border-0 ${selectedOrderId === order.id ? 'bg-terminal-surface-hover' : ''}`}><td className="px-4 py-3"><button className="font-mono text-terminal-accent hover:underline" onClick={() => setSelectedOrderId(order.id)}>{order.id}</button></td><td className="px-4 py-3"><button className="font-mono font-semibold text-terminal-text-primary hover:text-terminal-accent" onClick={() => openQuickView(order.symbol)}>{order.symbol}</button></td><td className="px-4 py-3"><Badge variant={order.side === 'BUY' ? 'up' : 'down'}>{order.side}</Badge></td><td className="px-4 py-3 font-mono">{(order.quantity ?? order.shares ?? '—').toLocaleString?.() ?? '—'}</td><td className="px-4 py-3 font-mono">{order.orderType ?? order.type ?? '—'}</td><td className="px-4 py-3"><Badge variant={statusTone(order.status)}>{order.status ?? 'UNAVAILABLE'}</Badge></td><td className="px-4 py-3 text-right">{orderCanCancel(order.status) ? <Button variant="outline" size="xs" onClick={() => cancelOrder(order)} disabled={cancelOrderMutation.isPending}>{cancelOrderMutation.isPending ? 'Cancelling…' : 'Cancel'}</Button> : <span className="text-terminal-text-disabled">—</span>}</td></tr>)}</tbody></table>}</div></section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <section aria-labelledby="order-entry-heading" className="rounded-lg border border-terminal-border bg-terminal-surface p-4"><SectionHeader icon={<ChevronRight className="size-4" />} title="Order entry" meta="Server validated" /><form onSubmit={submitOrder} className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted">Side<select value={side} onChange={(event) => setSide(event.target.value as 'BUY' | 'SELL')} className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs text-terminal-text-primary"><option value="BUY">BUY</option><option value="SELL">SELL</option></select></label><label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted">Symbol<input required value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs font-mono text-terminal-text-primary" placeholder="MBB" /></label><label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted">Quantity<input required inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs font-mono text-terminal-text-primary" placeholder="100" /></label><div className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-terminal-text-muted">Order type<span className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-xs text-terminal-text-primary">MARKET</span></div><div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2"><p className="text-[11px] text-terminal-text-muted">No frontend risk, sizing, price, or permission calculation. The canonical service decides.</p><Button type="submit" variant={side === 'BUY' ? 'success' : 'danger'} disabled={placeOrderMutation.isPending}>{placeOrderMutation.isPending ? 'Submitting…' : `Submit ${side}`}</Button></div></form></section>
        <section aria-labelledby="order-detail-heading" className="rounded-lg border border-terminal-border bg-terminal-surface p-4"><SectionHeader icon={<ExternalLink className="size-4" />} title="Selected order" meta={selectedOrder ? selectedOrder.id : 'Select an order'} />{selectedOrder ? <div className="flex flex-col gap-3 text-xs">{[['Symbol', selectedOrder.symbol], ['Side', selectedOrder.side], ['Quantity', selectedOrder.quantity], ['Type', selectedOrder.orderType ?? selectedOrder.type], ['State', selectedOrder.status], ['Created', selectedOrder.createdAt], ['Updated', selectedOrder.updatedAt]].map(([label, value]) => <div key={label as string} className="flex items-center justify-between gap-3 border-b border-terminal-border/60 pb-2"><span className="text-terminal-text-muted">{label}</span><span className="max-w-[65%] truncate text-right font-mono text-terminal-text-primary">{value ?? '—'}</span></div>)}{selectedOrder.rejectedReason && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300">Validation: {selectedOrder.rejectedReason}</div>}</div> : <p className="text-xs leading-5 text-terminal-text-muted">Select an order ID to inspect its canonical state, timestamps and validation context.</p>}</section>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-terminal-text-muted"><ShieldCheck className="size-3.5 text-terminal-accent" /> Execution mode: <span className="font-mono text-terminal-text-primary">{status?.brokerMode ?? 'UNAVAILABLE'}</span> · no live broker path is introduced by this workspace.</div>
    </div>
  );
};

function RiskValue({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-wider text-terminal-text-muted">{label}</p><p className="mt-1 line-clamp-2 font-mono text-xs text-terminal-text-primary">{value}</p></div>; }
function SectionHeader({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) { return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-terminal-border px-4 py-3"><div className="flex items-center gap-2 text-terminal-accent">{icon}<h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-terminal-text-primary">{title}</h2></div><span className="text-[10px] font-mono uppercase tracking-wider text-terminal-text-muted">{meta}</span></div>; }
function EmptyState({ label }: { label: string }) { return <div className="flex min-h-28 items-center justify-center gap-2 text-xs text-terminal-text-muted"><Ban className="size-4" aria-hidden="true" /> {label}</div>; }
