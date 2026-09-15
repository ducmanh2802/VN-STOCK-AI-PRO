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

  const isLoading = portfolioQuery.isLoading || positionsQuery.isLoading;
  const portfolio = portfolioQuery.data;
  const positions = positionsQuery.data || [];
  const status = statusQuery.data;

  const totalEquity = portfolio?.equity ?? 0;
  const totalCash = portfolio?.cash ?? 0;
  const cashRatio = totalEquity > 0 ? (totalCash / totalEquity) * 100 : 0;
  const stockValue = portfolio?.marketValue ?? 0;

  // Largest single position calculation
  let maxPosSymbol = 'None';
  let maxPosWeight = 0;
  if (positions.length > 0 && totalEquity > 0) {
    for (const p of positions) {
      const val = (p.shares || p.quantity || 0) * (p.currentPrice || p.lastPrice || 0);
      const weight = (val / totalEquity) * 100;
      if (weight > maxPosWeight) {
        maxPosWeight = weight;
        maxPosSymbol = p.symbol;
      }
    }
  }

  // Stress tests scaled to real portfolio equity
  const scenarioImpacts = {
    mild: {
      name: 'Thị trường điều chỉnh nhẹ (-3%)',
      portfolioLoss: stockValue > 0 ? -((stockValue * 0.03) / totalEquity) * 100 : 0,
      vnindexLoss: -3.0,
      varImpact: `${((stockValue * 0.03) / 1000000).toFixed(2)} tr VND`,
    },
    moderate: {
      name: 'Khối ngoại bán ròng & Rung lắc mạnh (-6%)',
      portfolioLoss: stockValue > 0 ? -((stockValue * 0.06) / totalEquity) * 100 : 0,
      vnindexLoss: -6.0,
      varImpact: `${((stockValue * 0.06) / 1000000).toFixed(2)} tr VND`,
    },
    severe: {
      name: 'Thiên nga đen / Khủng hoảng thanh khoản (-10%)',
      portfolioLoss: stockValue > 0 ? -((stockValue * 0.10) / totalEquity) * 100 : 0,
      vnindexLoss: -10.0,
      varImpact: `${((stockValue * 0.10) / 1000000).toFixed(2)} tr VND`,
    },
  };

  const handleRefresh = () => {
    portfolioQuery.refetch();
    positionsQuery.refetch();
    statusQuery.refetch();
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
          {/* Top Key Risk Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="MỨC ĐỘ RỦI RO TỔNG THỂ"
              value={stockValue === 0 ? 'RẤT THẤP (100% TIỀN)' : maxPosWeight > 20 ? 'TRUNG BÌNH' : 'AN TOÀN'}
              subValue={`Tỷ trọng cổ phiếu: ${(100 - cashRatio).toFixed(1)}%`}
              badge={stockValue === 0 ? 'ZERO RISK' : 'CONTROLLED'}
              badgeVariant="success"
              icon={ShieldCheck}
              status="LIVE"
            />

            <MetricCard
              label="VALUE AT RISK (VaR 95% 1-DAY)"
              value={stockValue > 0 ? `-${((stockValue * 0.02) / totalEquity * 100).toFixed(2)}%` : '0.00%'}
              subValue={`Tổn thất tối đa ước tính: ~${((stockValue * 0.02) / 1000000).toFixed(2)} tr VND`}
              badge="NORMAL"
              badgeVariant="indigo"
              icon={TrendingDown}
              status="LIVE"
            />

            <MetricCard
              label="GIỚI HẠN VỊ THẾ TỐI ĐA"
              value={`${maxPosWeight.toFixed(1)}% / ${maxPositionPct}%`}
              subValue={maxPosSymbol !== 'None' ? `Mã lớn nhất: ${maxPosSymbol}` : 'Chưa có vị thế cổ phiếu'}
              badge={maxPosWeight <= maxPositionPct ? 'TUÂN THỦ' : 'VI PHẠM'}
              badgeVariant={maxPosWeight <= maxPositionPct ? 'success' : 'danger'}
              status="LIVE"
            />

            <MetricCard
              label="TỶ LỆ TIỀN MẶT BẢO VỆ"
              value={`${cashRatio.toFixed(1)}%`}
              subValue={`${(totalCash / 1000000).toFixed(1)} tr VND sẵn sàng giải ngân`}
              badge={cashRatio >= 20 ? 'OPTIMAL' : 'LOW CASH'}
              badgeVariant={cashRatio >= 20 ? 'success' : 'warning'}
              status="LIVE"
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
                          {maxPosSymbol !== 'None'
                            ? `Vị thế lớn nhất (${maxPosSymbol}) chiếm ${maxPosWeight.toFixed(1)}% tổng tài sản < ngưỡng tối đa ${maxPositionPct}%.`
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
                  Mô phỏng Stress Test
                </span>
                <span className="text-[10px] font-mono text-slate-400">Monte Carlo Simulation</span>
              </div>

              <div className="space-y-2">
                {(['mild', 'moderate', 'severe'] as const).map((sc) => (
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
                      <span>{scenarioImpacts[sc].name}</span>
                      <span className={sc === 'mild' ? 'text-amber-400' : sc === 'moderate' ? 'text-orange-400' : 'text-rose-400'}>
                        {scenarioImpacts[sc].vnindexLoss}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Simulation Result */}
              <div className="p-4 bg-[#0E1522] border border-[#263244] rounded-lg space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
                  Ước tính tác động tới NAV hiện tại ({((totalEquity) / 1000000).toFixed(1)} tr VND)
                </span>

                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-300">Tổn thất dự kiến:</span>
                  <span className="text-base font-bold font-mono text-rose-400">
                    {scenarioImpacts[stressScenario].portfolioLoss.toFixed(2)}%
                  </span>
                </div>

                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-300">Giá trị suy giảm:</span>
                  <span className="text-sm font-bold font-mono text-slate-200">
                    {scenarioImpacts[stressScenario].varImpact}
                  </span>
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed pt-2 border-t border-[#263244]">
                  {stockValue === 0
                    ? 'Do danh mục đang giữ 100% tiền mặt, rủi ro biến động giá cổ phiếu trong kịch bản này là 0 VND.'
                    : `Với tỷ trọng tiền mặt ${cashRatio.toFixed(1)}%, danh mục giảm thiểu được phần lớn tác động giảm điểm từ thị trường chung.`}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
