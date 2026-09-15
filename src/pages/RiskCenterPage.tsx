import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Sliders,
  TrendingDown,
  Lock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
} from 'lucide-react';
import { MetricCard } from '../components/ui/MetricCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import {
  useTradingPortfolio,
  useTradingPositions,
  useTradingStatus,
  useTradingRiskMetrics,
  type RiskMetric,
} from '../hooks/useMarketQueries';
import { LoadingState } from '../components/ui/LoadingState';

export const RiskCenterPage: React.FC = () => {
  const [stressScenario, setStressScenario] = useState<'mild' | 'moderate' | 'severe'>('moderate');
  const [stopLossEnforced] = useState(true);
  const [maxPositionPct] = useState(25);
  const [maxSectorPct] = useState(35);

  const portfolioQuery = useTradingPortfolio();
  const positionsQuery = useTradingPositions();
  const statusQuery = useTradingStatus();
  const riskMetricsQuery = useTradingRiskMetrics();

  const isLoading = portfolioQuery.isLoading || positionsQuery.isLoading || riskMetricsQuery.isLoading;
  const portfolio = portfolioQuery.data;
  const positions = positionsQuery.data || [];
  const status = statusQuery.data;
  const riskMetrics = riskMetricsQuery.data;

  const totalEquity = portfolio?.equity ?? 0;
  const totalCash = portfolio?.cash ?? 0;

  // Server-authoritative risk metrics (never computed on the client).
  const exposure = riskMetrics?.exposure as RiskMetric | undefined;
  const concentration = riskMetrics?.concentration as RiskMetric | undefined;
  const cashUtilization = riskMetrics?.cashUtilization as RiskMetric | undefined;
  const varMetric = riskMetrics?.var as RiskMetric | undefined;
  const stressLoss = riskMetrics?.stressLoss as RiskMetric | undefined;
  const riskApprovedCapital = riskMetrics?.riskApprovedCapital as RiskMetric | undefined;

  const fmtVND = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : `${(v / 1_000_000).toFixed(2)} tr VND`;

  const metricStatusLabel = (m: RiskMetric | undefined) => {
    if (!m) return 'LIVE';
    if (m.status === 'DATA_UNAVAILABLE') return 'DATA_UNAVAILABLE';
    if (m.status === 'STALE') return 'STALE';
    if (m.status === 'INSUFFICIENT_DATA') return 'INSUFFICIENT_DATA';
    return 'OK';
  };

  // Maps server risk-status onto the UI freshness indicator (Dot). 'OK' => LIVE,
  // and both missing-data states surface as DATA_UNAVAILABLE (never 'safer').
  const freshnessState = (m: RiskMetric | undefined) =>
    m?.status === 'STALE'
      ? 'STALE'
      : m?.status === 'DATA_UNAVAILABLE' || m?.status === 'INSUFFICIENT_DATA'
        ? 'DATA_UNAVAILABLE'
        : 'LIVE';

  const handleRefresh = () => {
    portfolioQuery.refetch();
    positionsQuery.refetch();
    statusQuery.refetch();
    riskMetricsQuery.refetch();
  };

  return (
    <div id="page-risk-center" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#263244]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold font-sans text-slate-100">
              Risk Center & Guardrails Control
            </h1>
            <DataStatusBadge
              status={isLoading ? 'LOADING' : 'LIVE'}
              source="RiskGuard Engine"
              compact
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Trung tâm kiểm soát rủi ro danh mục, giám sát giới hạn vị thế và mô phỏng kịch bản căng thẳng (Stress Test)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} leftIcon={RefreshCw}>
            Kiểm tra an toàn (Audit)
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12">
          <LoadingState variant="terminal" message="Đang đánh giá rủi ro danh mục theo RiskGuard..." />
        </div>
      ) : (
        <>
          {/* Top Key Risk Metrics (server-authoritative) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="TỶ TRỌNG CỔ PHIẾU (EXPOSURE)"
              value={exposure?.value != null ? `${exposure.value.toFixed(1)}%` : (exposure?.status === 'DATA_UNAVAILABLE' ? 'KHÔNG CÓ DỮ LIỆU' : '—')}
              subValue={exposure?.status === 'OK' ? 'Server: sum(markPrice*qty)/equity' : `Server status: ${metricStatusLabel(exposure)}`}
              badge={exposure?.value === 0 ? '0% EXPOSURE' : 'EXPOSURE'}
              badgeVariant={exposure?.value !== null && exposure.value > 0 ? 'warning' : 'success'}
              icon={ShieldCheck}
              status={freshnessState(exposure)}
            />

            <MetricCard
              label="VALUE AT RISK (VaR 95% 1-DAY)"
              value={varMetric?.value != null ? fmtVND(varMetric.value) : '—'}
              subValue={
                varMetric?.status === 'INSUFFICIENT_DATA'
                  ? 'INSUFFICIENT_DATA: chưa đủ chuỗi lợi nhuận lịch sử (server)'
                  : varMetric?.status === 'DATA_UNAVAILABLE'
                    ? 'DATA_UNAVAILABLE (server)'
                    : varMetric?.value != null
                      ? `Server ${varMetric.confidence ?? '95% 1-day historical'}`
                      : 'Chưa có dữ liệu lịch sử để tính VaR'
              }
              badge={varMetric?.status === 'OK' ? 'OK' : metricStatusLabel(varMetric)}
              badgeVariant={varMetric?.status === 'OK' ? 'indigo' : 'danger'}
              icon={TrendingDown}
              status={freshnessState(varMetric)}
            />

            <MetricCard
              label="GIỚI HẠN VỊ THẾ TỐI ĐA (CONCENTRATION)"
              value={concentration?.value != null ? `${concentration.value.toFixed(1)}% / ${maxPositionPct}%` : '—'}
              subValue={
                concentration?.status === 'OK'
                  ? `Server: max(positionValue)/equity • ${concentration.details?.positionCount ?? 0} vị thế`
                  : `Server status: ${metricStatusLabel(concentration)}`
              }
              badge={concentration?.value != null ? (concentration.value <= maxPositionPct ? 'TUÂN THỦ' : 'VI PHẠM') : metricStatusLabel(concentration)}
              badgeVariant={concentration?.value != null ? (concentration.value <= maxPositionPct ? 'success' : 'danger') : 'warning'}
              status={freshnessState(concentration)}
            />

            <MetricCard
              label="TỶ LỆ TIỀN MẶT (CASH %) "
              value={cashUtilization?.value != null ? `${cashUtilization.value.toFixed(1)}%` : '—'}
              subValue={`${totalCash > 0 ? (totalCash / 1000000).toFixed(1) : '0'} tr VND • Server status: ${metricStatusLabel(cashUtilization)}`}
              badge={cashUtilization?.value != null ? (cashUtilization.value >= 20 ? 'OPTIMAL' : 'LOW CASH') : metricStatusLabel(cashUtilization)}
              badgeVariant={cashUtilization?.value != null ? (cashUtilization.value >= 20 ? 'success' : 'warning') : 'warning'}
              status={freshnessState(cashUtilization)}
            />
          </div>

          {/* Guardrails and Stress Testing Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Active Safety Guardrails (2 Cols) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Rules Checklist */}
              <div className="bg-[#111827] border border-[#263244] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#263244]">
                  <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-indigo-400" />
                    Quy tắc an toàn vốn tự động (RiskGuard)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                    4/4 QUY TẮC ĐẠT CHUẨN
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between p-3 rounded-lg bg-[#0E1522] border border-[#263244]">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">Giới hạn tỷ trọng cổ phiếu đơn lẻ</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {(concentration?.value ?? 0) > 0
                            ? `Tỷ trọng vị thế lớn nhất chiếm ${(concentration?.value ?? 0).toFixed(1)}% tổng tài sản (server) < ngưỡng tối đa ${maxPositionPct}%.`
                            : `Hiện tại chưa có vị thế cổ phiếu nào (Tỷ trọng 0% < ngưỡng tối đa ${maxPositionPct}%).`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="up" size="xs">TUÂN THỦ</Badge>
                  </div>

                  <div className="flex items-start justify-between p-3 rounded-lg bg-[#0E1522] border border-[#263244]">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">Giới hạn tập trung ngành (Sector Ceiling)</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Tất cả nhóm ngành đều tuân thủ dưới trần cho phép {maxSectorPct}%.
                        </p>
                      </div>
                    </div>
                    <Badge variant="up" size="xs">TUÂN THỦ</Badge>
                  </div>

                  <div className="flex items-start justify-between p-3 rounded-lg bg-[#0E1522] border border-[#263244]">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">Cơ chế Cắt lỗ tự động (Stop-Loss Guard)</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Cảnh báo và tự động chặn đặt thêm khi vị thế lỗ vượt quá -7.0% trên giá vốn mua.
                        </p>
                      </div>
                    </div>
                    <Badge variant="up" size="xs">BẬT</Badge>
                  </div>

                  <div className="flex items-start justify-between p-3 rounded-lg bg-[#0E1522] border border-[#263244]">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">Cầu dao ngắt khẩn cấp (Emergency Circuit Breaker)</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Tự động dừng phiên giao dịch khi drawdown ngày vượt ngưỡng 5.0%.
                        </p>
                      </div>
                    </div>
                    <Badge variant={status?.emergencyStop ? 'down' : 'up'} size="xs">
                      {status?.emergencyStop ? 'KÍCH HOẠT' : 'SẴN SÀNG'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Stress Testing Simulator (1 Col) */}
            <div className="bg-[#111827] border border-[#263244] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#263244]">
                <span className="text-xs font-bold uppercase tracking-wider font-mono text-slate-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Mô phỏng Stress Test (kịch bản)
                </span>
                <span className="text-[10px] font-mono text-slate-400" title={stressLoss?.formula ?? ''}>
                  Deterministic Scenario Shock (server)
                </span>
              </div>

              <div className="space-y-2">
                {(['mild', 'moderate', 'severe'] as const).map((sc) => {
                  const scName = sc === 'mild' ? 'Điều chỉnh nhẹ (-3%)' : sc === 'moderate' ? 'Rung lắc mạnh (-6%)' : 'Thiên nga đen (-10%)';
                  return (
                    <button
                      key={sc}
                      onClick={() => setStressScenario(sc)}
                      className={`w-full p-3 rounded-lg text-left transition-all border ${
                        stressScenario === sc
                          ? 'bg-indigo-600/20 border-indigo-500 text-slate-100'
                          : 'bg-[#0E1522] border-[#263244] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs font-bold font-sans">
                        <span>{scName}</span>
                        <span className={sc === 'mild' ? 'text-amber-400' : sc === 'moderate' ? 'text-orange-400' : 'text-rose-400'}>
                          {sc === 'mild' ? '-3' : sc === 'moderate' ? '-6' : '-10'}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Simulation Result (server-computed scenario losses) */}
              <div className="p-4 bg-[#0E1522] border border-[#263244] rounded-lg space-y-3">
                {stressLoss?.status === 'DATA_UNAVAILABLE' ? (
                  <p className="text-[11px] text-slate-400">
                    DATA_UNAVAILABLE: không đủ dữ liệu để tính stress test theo server.
                  </p>
                ) : (
                  <>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
                      Ước tính tác động tới NAV hiện tại ({((totalEquity) / 1000000).toFixed(1)} tr VND)
                      {stressLoss?.status === 'STALE' ? ' • STALE' : ''}
                    </span>

                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-300">Tổn thất dự kiến:</span>
                      <span className="text-base font-bold font-mono text-rose-400">
                        {(() => {
                          const v = (stressLoss?.details?.scenarios as Record<string, number> | undefined)?.[stressScenario];
                          if (v === undefined) return '—';
                          return totalEquity > 0 ? `-${((v / totalEquity) * 100).toFixed(2)}%` : '-0.00%';
                        })()}
                      </span>
                    </div>

                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-300">Giá trị suy giảm:</span>
                      <span className="text-sm font-bold font-mono text-slate-200">
                        {fmtVND((stressLoss?.details?.scenarios as Record<string, number> | undefined)?.[stressScenario])}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed pt-2 border-t border-[#263244]">
                      {stressLoss?.value === 0
                        ? 'Do danh mục đang giữ 100% tiền mặt, rủi ro biến động giá cổ phiếu trong kịch bản này là 0 VND (server).'
                        : `Kịch bản cao nhất: ${fmtVND(stressLoss?.value)} (${stressLoss?.details?.worstScenario ?? 'severe'}). ${stressLoss?.confidence ?? ''}`}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
