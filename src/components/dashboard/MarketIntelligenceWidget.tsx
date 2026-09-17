import React, { useState } from 'react';
import {
  ShieldAlert,
  TrendingUp,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  BarChart3,
  Flame,
  ArrowDownRight,
  ArrowUpRight,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import type {
  MarketIntelligenceSnapshot,
  BreakdownRiskLevel,
  RecoveryStrengthStage,
  MarketRegimeType,
} from '../../lib/analysis/market/types';
import type { IndexData } from '../../types/market';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { CardSkeleton } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorBoundary';
import { formatIndexPoint, formatPercent } from '../../utils/formatters';

export interface MarketIntelligenceWidgetProps {
  intelligence?: MarketIntelligenceSnapshot | null;
  indices?: IndexData[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

const REGIME_LABELS: Record<MarketRegimeType, { label: string; desc: string; variant: 'up' | 'down' | 'ref' | 'brand' | 'subtle' }> = {
  BULL_TREND: { label: 'XU HƯỚNG TĂNG (BULL TREND)', desc: 'Giá nằm trên MA20/50/200, độ rộng và động lượng tích cực', variant: 'up' },
  BEAR_TREND: { label: 'XU HƯỚNG GIẢM (BEAR TREND)', desc: 'Giá dưới các đường MA chủ chốt, quán tính giảm chi phối', variant: 'down' },
  ACCUMULATION: { label: 'TÍCH LŨY (ACCUMULATION)', desc: 'Biên độ thu hẹp, dòng tiền thông minh gom hàng thầm lặng', variant: 'brand' },
  DISTRIBUTION: { label: 'PHÂN PHỐI (DISTRIBUTION)', desc: 'Giá giằng co tại đỉnh kèm khối lượng bán gia tăng', variant: 'down' },
  HIGH_VOLATILITY: { label: 'BIẾN ĐỘNG MẠNH (HIGH VOL)', desc: 'Biên độ dao động lớn bất thường, rủi ro biến động cao', variant: 'ref' },
  LOW_VOLATILITY: { label: 'BIẾN ĐỘNG THẤP (LOW VOL)', desc: 'Biên độ co hẹp kỷ lục, chuẩn bị cho nhịp bứt phá mới', variant: 'subtle' },
  SIDEWAYS: { label: 'ĐI NGANG (SIDEWAYS)', desc: 'Dao động trong biên độ hộp, xu hướng cân bằng', variant: 'subtle' },
  UNKNOWN: { label: 'CHƯA XÁC ĐỊNH (UNKNOWN)', desc: 'Dữ liệu lịch sử chưa đủ để phân loại chế độ thị trường', variant: 'subtle' },
};

export const MarketIntelligenceWidget: React.FC<MarketIntelligenceWidgetProps> = ({
  intelligence,
  indices = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  className = '',
}) => {
  const [showBreakdownDetails, setShowBreakdownDetails] = useState(false);
  const [showRecoveryDetails, setShowRecoveryDetails] = useState(false);
  const [showRegimeDetails, setShowRegimeDetails] = useState(false);

  if (isLoading) {
    return (
      <Card id="market-intelligence-loading" className={`border-terminal-border/60 ${className}`}>
        <CardHeader className="pb-3 border-b border-terminal-border/40">
          <div className="flex items-center justify-between">
            <div className="h-5 w-64 bg-terminal-surface-subtle animate-pulse rounded" />
            <div className="h-5 w-32 bg-terminal-surface-subtle animate-pulse rounded" />
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} lines={2} className="p-3" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} lines={4} className="p-4" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card id="market-intelligence-error" className={`border-terminal-border/60 ${className}`}>
        <CardContent className="p-4">
          <ErrorState
            error={error || new Error('Không thể tải thông tin định lượng thị trường (Phase 20)')}
            onRetry={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  // Fallback extraction
  const regime = intelligence?.regime;
  const regimeMeta = regime ? REGIME_LABELS[regime.regime] ?? REGIME_LABELS.UNKNOWN : REGIME_LABELS.UNKNOWN;
  const supportResistance = intelligence?.supportResistance;
  const breakdownRisk = intelligence?.breakdownRisk;
  const recoveryStrength = intelligence?.recoveryStrength;
  const breadth = intelligence?.breadth;

  const dataStatus = supportResistance?.status ?? (intelligence ? 'LIVE' : 'DATA_UNAVAILABLE');
  const timestampStr = intelligence?.timestamp
    ? new Date(intelligence.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  // Format Breakdown Risk Level
  const renderRiskBadge = (level?: BreakdownRiskLevel) => {
    switch (level) {
      case 'LOW':
        return <Badge variant="up" size="sm" withDot>RỦI RO THẤP (LOW)</Badge>;
      case 'MEDIUM':
        return <Badge variant="ref" size="sm" withDot>TRUNG BÌNH (MEDIUM)</Badge>;
      case 'HIGH':
        return <Badge variant="down" size="sm" withDot>RỦI RO CAO (HIGH)</Badge>;
      default:
        return <Badge variant="subtle" size="sm">DATA UNAVAILABLE</Badge>;
    }
  };

  // Format Recovery Strength Stage
  const renderRecoveryBadge = (stage?: RecoveryStrengthStage) => {
    switch (stage) {
      case 'CONFIRMED':
        return <Badge variant="up" size="sm" withDot>XÁC NHẬN (CONFIRMED)</Badge>;
      case 'DEVELOPING':
        return <Badge variant="brand" size="sm" withDot>ĐANG PHÁT TRIỂN (DEVELOPING)</Badge>;
      case 'WEAK':
        return <Badge variant="down" size="sm" withDot>HỒI PHỤC YẾU (WEAK)</Badge>;
      default:
        return <Badge variant="subtle" size="sm">DATA UNAVAILABLE</Badge>;
    }
  };

  // Safe metric helper: never convert null/undefined to 0
  const renderMetricValue = (val: number | null | undefined, suffix = '', decimals = 2) => {
    if (val === null || val === undefined || !Number.isFinite(val)) {
      return <span className="text-terminal-text-muted font-mono font-normal">DATA UNAVAILABLE</span>;
    }
    return `${val.toFixed(decimals)}${suffix}`;
  };

  return (
    <section
      id="section-market-intelligence"
      aria-label="Market Intelligence Dashboard"
      className={`space-y-3 ${className}`}
    >
      {/* 1. Header: Section identity, Provenance, & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-terminal-border/60 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-terminal-accent/10 rounded border border-terminal-accent/30 text-terminal-accent">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-terminal-text-primary tracking-tight font-mono uppercase">
                THÔNG MINH THỊ TRƯỜNG (MARKET INTELLIGENCE)
              </h2>
              <Badge variant="brand" size="xs">PHASE 20 CANONICAL</Badge>
            </div>
            <p className="text-xs text-terminal-text-muted font-mono mt-0.5">
              Bộ phân tích định lượng chuẩn mực: Chế độ thị trường, Ngưỡng hỗ trợ/kháng cự, Rủi ro gãy nền & Sức mạnh phục hồi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Strict Data Status */}
          <div className="flex items-center gap-1.5 font-mono text-xs bg-terminal-surface-subtle px-2.5 py-1 rounded border border-terminal-border">
            <span className="text-terminal-text-muted">Trạng thái:</span>
            {dataStatus === 'LIVE' ? (
              <span className="flex items-center gap-1 text-terminal-up font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-terminal-up animate-pulse" />
                LIVE
              </span>
            ) : dataStatus === 'STALE' ? (
              <span className="flex items-center gap-1 text-terminal-ref font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-terminal-ref" />
                STALE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-terminal-down font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-terminal-down" />
                DATA UNAVAILABLE
              </span>
            )}
          </div>

          <span className="text-xs text-terminal-text-muted font-mono hidden sm:inline-block">
            Nguồn: <strong className="text-terminal-text-secondary">KBS + VPS</strong> · {timestampStr}
          </span>

          {onRetry && (
            <button
              id="btn-refresh-market-intelligence"
              type="button"
              onClick={onRetry}
              title="Làm mới dữ liệu phân tích"
              aria-label="Refresh market intelligence data"
              className="p-1 rounded bg-terminal-surface-subtle hover:bg-terminal-surface-hover border border-terminal-border text-terminal-text-secondary hover:text-terminal-text-primary transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Ribbon: Market Regime & Multi-Index Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5">
        {/* Market Regime Card (Main Focus) */}
        <Card
          id="card-market-regime"
          variant="default"
          density="compact"
          className="lg:col-span-2 border-terminal-border hover:border-terminal-border-bright transition-all"
        >
          <CardContent className="p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-terminal-text-secondary uppercase">
                  Chế độ thị trường (Market Regime)
                </span>
                <button
                  type="button"
                  onClick={() => setShowRegimeDetails(!showRegimeDetails)}
                  className="text-terminal-text-muted hover:text-terminal-text-primary text-[11px] font-mono flex items-center gap-0.5 ml-1"
                  aria-expanded={showRegimeDetails}
                  aria-label="Toggle regime detail scores"
                >
                  {showRegimeDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showRegimeDetails ? 'Thu gọn' : 'Chi tiết điểm'}
                </button>
              </div>
              <Badge variant={regimeMeta.variant} size="sm">
                {regimeMeta.label}
              </Badge>
            </div>

            <div className="flex items-baseline justify-between pt-0.5">
              <div className="text-xs text-terminal-text-secondary font-mono">
                {regimeMeta.desc}
              </div>
              <div className="font-mono text-xs text-right whitespace-nowrap pl-2">
                <span className="text-terminal-text-muted">Độ tin cậy: </span>
                <strong className="text-terminal-text-primary">{regime?.confidence ?? '--'}%</strong>
              </div>
            </div>

            {/* 4 Core Pillars */}
            <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-terminal-border/50 text-[11px] font-mono">
              <div className="bg-terminal-surface-subtle p-1.5 rounded border border-terminal-border/40">
                <span className="text-terminal-text-muted block text-[10px]">XU HƯỚNG</span>
                <strong className="text-terminal-text-primary">
                  {regime?.scores.trendScore !== null && regime?.scores.trendScore !== undefined
                    ? `${regime.scores.trendScore}/100`
                    : '--'}
                </strong>
              </div>
              <div className="bg-terminal-surface-subtle p-1.5 rounded border border-terminal-border/40">
                <span className="text-terminal-text-muted block text-[10px]">ĐỘ RỘNG</span>
                <strong className="text-terminal-text-primary">
                  {regime?.scores.breadthScore !== null && regime?.scores.breadthScore !== undefined
                    ? `${regime.scores.breadthScore}/100`
                    : '--'}
                </strong>
              </div>
              <div className="bg-terminal-surface-subtle p-1.5 rounded border border-terminal-border/40">
                <span className="text-terminal-text-muted block text-[10px]">THANH KHOẢN</span>
                <strong className="text-terminal-text-primary">
                  {regime?.scores.liquidityScore !== null && regime?.scores.liquidityScore !== undefined
                    ? `${regime.scores.liquidityScore}/100`
                    : '--'}
                </strong>
              </div>
              <div className="bg-terminal-surface-subtle p-1.5 rounded border border-terminal-border/40">
                <span className="text-terminal-text-muted block text-[10px]">BIẾN ĐỘNG</span>
                <strong className="text-terminal-text-primary">
                  {regime?.scores.volatilityScore !== null && regime?.scores.volatilityScore !== undefined
                    ? `${regime.scores.volatilityScore}/100`
                    : '--'}
                </strong>
              </div>
            </div>

            {/* Expandable Pillar Detail */}
            {showRegimeDetails && regime && (
              <div className="pt-2 border-t border-terminal-border/40 space-y-1.5 text-xs font-mono text-terminal-text-secondary animate-in fade-in duration-150">
                <div className="flex justify-between">
                  <span className="text-terminal-text-muted">Động lượng (RSI/MACD):</span>
                  <span>{regime.scores.momentumScore !== null ? `${regime.scores.momentumScore}/100` : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text-muted">Dòng tiền tham gia (Up-Vol ratio):</span>
                  <span>{regime.scores.participationScore !== null ? `${regime.scores.participationScore}%` : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text-muted">Cổ phiếu phân tích trong rổ:</span>
                  <span>{regime.dataLineage.constituentsEvaluated} mã</span>
                </div>
                {regime.warnings && regime.warnings.length > 0 && (
                  <div className="text-[10px] text-terminal-ref pt-1 border-t border-terminal-border/30">
                    Lưu ý: {regime.warnings.join(' · ')}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Index Quick Summary: VN-INDEX & VN30 */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5">
          {indices.slice(0, 4).map((idx) => {
            const isUp = idx.change >= 0;
            return (
              <div
                key={idx.symbol}
                id={`index-tile-${idx.symbol}`}
                className="bg-terminal-card p-3 rounded border border-terminal-border hover:border-terminal-border-bright transition-colors space-y-1 font-mono"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-terminal-text-primary">{idx.symbol}</span>
                  <Badge variant={isUp ? 'up' : 'down'} size="xs">
                    {isUp ? `+${idx.changePercent.toFixed(2)}%` : `${idx.changePercent.toFixed(2)}%`}
                  </Badge>
                </div>
                <div className="text-base font-bold text-terminal-text-primary">
                  {formatIndexPoint(idx.value)}
                </div>
                <div className="text-[11px] text-terminal-text-muted flex justify-between">
                  <span>Thay đổi:</span>
                  <span className={isUp ? 'text-terminal-up' : 'text-terminal-down'}>
                    {isUp ? `+${idx.change.toFixed(2)}` : idx.change.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Core Intelligence Cards: Breakdown Risk, Recovery Strength, Support & Resistance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* CARD A: BREAKDOWN RISK */}
        <Card
          id="card-breakdown-risk"
          variant="default"
          density="compact"
          className="border-terminal-border hover:border-terminal-border-bright transition-all"
        >
          <CardHeader className="p-3.5 pb-2 border-b border-terminal-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-terminal-down" />
              <CardTitle className="text-xs font-mono font-bold uppercase text-terminal-text-primary">
                RỦI RO GÃY NỀN (BREAKDOWN RISK)
              </CardTitle>
            </div>
            {renderRiskBadge(breakdownRisk?.riskLevel)}
          </CardHeader>

          <CardContent className="p-3.5 space-y-3">
            {/* Primary metric: Distance to nearest support */}
            <div className="bg-terminal-surface-subtle p-2.5 rounded border border-terminal-border/50 flex items-center justify-between font-mono">
              <div>
                <span className="text-[10px] text-terminal-text-muted uppercase block">Khoảng cách tới hỗ trợ</span>
                <span className="text-sm font-bold text-terminal-text-primary">
                  {breakdownRisk?.nearestSupportPrice
                    ? `${breakdownRisk.nearestSupportPrice.toLocaleString('vi-VN')} điểm`
                    : 'DATA UNAVAILABLE'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-terminal-text-muted block">Cách giá hiện tại</span>
                <span
                  className={`text-sm font-bold ${
                    breakdownRisk?.distanceToSupportPct !== null && breakdownRisk?.distanceToSupportPct !== undefined
                      ? breakdownRisk.distanceToSupportPct < 1.0
                        ? 'text-terminal-down'
                        : breakdownRisk.distanceToSupportPct < 2.5
                        ? 'text-terminal-ref'
                        : 'text-terminal-up'
                      : 'text-terminal-text-muted'
                  }`}
                >
                  {breakdownRisk?.distanceToSupportPct !== null && breakdownRisk?.distanceToSupportPct !== undefined
                    ? `${breakdownRisk.distanceToSupportPct > 0 ? '+' : ''}${breakdownRisk.distanceToSupportPct}%`
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* Conditions breakdown list */}
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex items-start gap-1.5">
                <span className="text-terminal-text-muted min-w-[70px]">Thanh khoản:</span>
                <span className="text-terminal-text-secondary flex-1">
                  {breakdownRisk?.downsideVolumeCondition ?? 'DATA UNAVAILABLE'}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-terminal-text-muted min-w-[70px]">Độ rộng:</span>
                <span className="text-terminal-text-secondary flex-1">
                  {breakdownRisk?.marketBreadthCondition ?? 'DATA UNAVAILABLE'}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-terminal-text-muted min-w-[70px]">Xu hướng:</span>
                <span className="text-terminal-text-secondary flex-1">
                  {breakdownRisk?.trendCondition ?? 'DATA UNAVAILABLE'}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-terminal-text-muted min-w-[70px]">Biến động:</span>
                <span className="text-terminal-text-secondary flex-1">
                  {breakdownRisk?.volatilityCondition ?? 'DATA UNAVAILABLE'}
                </span>
              </div>
            </div>

            {/* Toggle detail drawer */}
            <button
              type="button"
              onClick={() => setShowBreakdownDetails(!showBreakdownDetails)}
              className="w-full pt-2 border-t border-terminal-border/40 text-xs font-mono text-terminal-accent hover:text-terminal-text-primary flex items-center justify-center gap-1 transition-colors"
              aria-expanded={showBreakdownDetails}
              aria-label="Toggle breakdown risk why and confirmation details"
            >
              {showBreakdownDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showBreakdownDetails ? 'Thu gọn phân tích chi tiết' : 'Xem lý do & Điều kiện xác nhận'}
            </button>

            {showBreakdownDetails && breakdownRisk && (
              <div className="pt-2 border-t border-terminal-border/30 space-y-2 text-xs font-mono animate-in fade-in duration-150">
                {breakdownRisk.why && breakdownRisk.why.length > 0 && (
                  <div>
                    <span className="text-terminal-text-primary font-bold block mb-1">Cơ sở đánh giá (Why):</span>
                    <ul className="list-disc list-inside text-terminal-text-secondary space-y-0.5">
                      {breakdownRisk.why.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {breakdownRisk.confirmationConditions && breakdownRisk.confirmationConditions.length > 0 && (
                  <div>
                    <span className="text-terminal-down font-bold block mb-1">Điều kiện xác nhận gãy nền:</span>
                    <ul className="list-disc list-inside text-terminal-text-muted space-y-0.5">
                      {breakdownRisk.confirmationConditions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {breakdownRisk.invalidationConditions && breakdownRisk.invalidationConditions.length > 0 && (
                  <div>
                    <span className="text-terminal-up font-bold block mb-1">Điều kiện phủ nhận rủi ro:</span>
                    <ul className="list-disc list-inside text-terminal-text-muted space-y-0.5">
                      {breakdownRisk.invalidationConditions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CARD B: RECOVERY STRENGTH */}
        <Card
          id="card-recovery-strength"
          variant="default"
          density="compact"
          className="border-terminal-border hover:border-terminal-border-bright transition-all"
        >
          <CardHeader className="p-3.5 pb-2 border-b border-terminal-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-terminal-up" />
              <CardTitle className="text-xs font-mono font-bold uppercase text-terminal-text-primary">
                SỨC MẠNH PHỤC HỒI (RECOVERY STRENGTH)
              </CardTitle>
            </div>
            {renderRecoveryBadge(recoveryStrength?.recoveryState)}
          </CardHeader>

          <CardContent className="p-3.5 space-y-3">
            {/* Primary metric: Status checks */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-terminal-surface-subtle p-2 rounded border border-terminal-border/50">
                <span className="text-[10px] text-terminal-text-muted block uppercase">Giữ vững hỗ trợ</span>
                <span className="font-bold flex items-center gap-1 mt-0.5">
                  {recoveryStrength?.supportHoldStatus === true ? (
                    <span className="text-terminal-up flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> ĐẠT YÊU CẦU
                    </span>
                  ) : recoveryStrength?.supportHoldStatus === false ? (
                    <span className="text-terminal-down flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> BỊ VI PHẠM
                    </span>
                  ) : (
                    <span className="text-terminal-text-muted">CHƯA XÁC ĐỊNH</span>
                  )}
                </span>
              </div>

              <div className="bg-terminal-surface-subtle p-2 rounded border border-terminal-border/50">
                <span className="text-[10px] text-terminal-text-muted block uppercase">Vượt cản gần</span>
                <span className="font-bold flex items-center gap-1 mt-0.5">
                  {recoveryStrength?.resistanceReclaimStatus === true ? (
                    <span className="text-terminal-up flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> ĐÃ CHINH PHỤC
                    </span>
                  ) : (
                    <span className="text-terminal-ref flex items-center gap-1">
                      <Activity className="w-3 h-3" /> ĐANG KIỂM ĐỊNH
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Key condition details */}
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex items-start gap-1.5">
                <span className="text-terminal-text-muted min-w-[75px]">Vùng kháng cự:</span>
                <span className="text-terminal-text-secondary flex-1 font-bold">
                  {recoveryStrength?.resistanceRange ?? 'Chưa xác định'}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-terminal-text-muted min-w-[75px]">Dòng tiền xác nhận:</span>
                <span className="text-terminal-text-secondary flex-1">
                  {recoveryStrength?.volumeConfirmation ? 'Đã xác nhận (Lực mua chiếm ưu thế)' : 'Chưa xác nhận (Lực cầu còn thận trọng)'}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-terminal-text-muted min-w-[75px]">Cải thiện độ rộng:</span>
                <span className="text-terminal-text-secondary flex-1">
                  {recoveryStrength?.breadthImprovement ? 'Có lan tỏa tích cực' : 'Chưa có sự lan tỏa'}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-terminal-text-muted min-w-[75px]">Cổ phiếu dẫn dắt:</span>
                <span className="text-terminal-text-secondary flex-1">
                  {recoveryStrength?.leadershipCondition ?? 'DATA UNAVAILABLE'}
                </span>
              </div>
            </div>

            {/* Toggle detail drawer */}
            <button
              type="button"
              onClick={() => setShowRecoveryDetails(!showRecoveryDetails)}
              className="w-full pt-2 border-t border-terminal-border/40 text-xs font-mono text-terminal-accent hover:text-terminal-text-primary flex items-center justify-center gap-1 transition-colors"
              aria-expanded={showRecoveryDetails}
              aria-label="Toggle recovery strength why and confirmation details"
            >
              {showRecoveryDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showRecoveryDetails ? 'Thu gọn phân tích chi tiết' : 'Xem lý do & Điều kiện phục hồi'}
            </button>

            {showRecoveryDetails && recoveryStrength && (
              <div className="pt-2 border-t border-terminal-border/30 space-y-2 text-xs font-mono animate-in fade-in duration-150">
                {recoveryStrength.why && recoveryStrength.why.length > 0 && (
                  <div>
                    <span className="text-terminal-text-primary font-bold block mb-1">Cơ sở đánh giá (Why):</span>
                    <ul className="list-disc list-inside text-terminal-text-secondary space-y-0.5">
                      {recoveryStrength.why.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {recoveryStrength.confirmationConditions && recoveryStrength.confirmationConditions.length > 0 && (
                  <div>
                    <span className="text-terminal-up font-bold block mb-1">Điều kiện xác nhận hồi phục (Confirmed):</span>
                    <ul className="list-disc list-inside text-terminal-text-muted space-y-0.5">
                      {recoveryStrength.confirmationConditions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {recoveryStrength.invalidationConditions && recoveryStrength.invalidationConditions.length > 0 && (
                  <div>
                    <span className="text-terminal-down font-bold block mb-1">Điều kiện phủ nhận nhịp hồi:</span>
                    <ul className="list-disc list-inside text-terminal-text-muted space-y-0.5">
                      {recoveryStrength.invalidationConditions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CARD C: SUPPORT & RESISTANCE */}
        <Card
          id="card-support-resistance"
          variant="default"
          density="compact"
          className="border-terminal-border hover:border-terminal-border-bright transition-all"
        >
          <CardHeader className="p-3.5 pb-2 border-b border-terminal-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-terminal-accent" />
              <CardTitle className="text-xs font-mono font-bold uppercase text-terminal-text-primary">
                HỖ TRỢ & KHÁNG CỰ (SUPPORT / RESISTANCE)
              </CardTitle>
            </div>
            <span className="text-[11px] font-mono text-terminal-text-muted">
              VN-INDEX: <strong className="text-terminal-text-primary">{supportResistance?.currentPrice ? supportResistance.currentPrice.toLocaleString('vi-VN') : '--'}</strong>
            </span>
          </CardHeader>

          <CardContent className="p-3.5 space-y-3">
            {/* Resistance Zone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-terminal-down uppercase flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5" /> KHÁNG CỰ (RESISTANCE)
                </span>
                <span className="text-[10px] text-terminal-text-muted">Độ mạnh</span>
              </div>

              <div className="bg-terminal-down/10 border border-terminal-down/30 rounded p-2 text-xs font-mono space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-terminal-text-muted text-[10px] block">Cản gần nhất (R1):</span>
                    <strong className="text-terminal-text-primary">
                      {supportResistance?.nearestResistance
                        ? `${supportResistance.nearestResistance.price.toLocaleString('vi-VN')} điểm`
                        : 'DATA UNAVAILABLE'}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-terminal-down font-bold">
                      {supportResistance?.distanceToResistancePct !== null && supportResistance?.distanceToResistancePct !== undefined
                        ? `+${supportResistance.distanceToResistancePct}%`
                        : '--'}
                    </span>
                    <span className="text-[10px] text-terminal-text-muted block">
                      Độ mạnh: {supportResistance?.nearestResistance?.strength ?? 0}★
                    </span>
                  </div>
                </div>

                {supportResistance?.secondaryResistance && (
                  <div className="flex items-center justify-between pt-1 border-t border-terminal-down/20 text-[11px]">
                    <span className="text-terminal-text-muted">Cản thứ cấp (R2):</span>
                    <span className="text-terminal-text-secondary">
                      {supportResistance.secondaryResistance.price.toLocaleString('vi-VN')} điểm ({supportResistance.secondaryResistance.strength}★)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Support Zone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-terminal-up uppercase flex items-center gap-1">
                  <ArrowDownRight className="w-3.5 h-3.5" /> HỖ TRỢ (SUPPORT)
                </span>
                <span className="text-[10px] text-terminal-text-muted">Độ mạnh</span>
              </div>

              <div className="bg-terminal-up/10 border border-terminal-up/30 rounded p-2 text-xs font-mono space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-terminal-text-muted text-[10px] block">Hỗ trợ gần nhất (S1):</span>
                    <strong className="text-terminal-text-primary">
                      {supportResistance?.nearestSupport
                        ? `${supportResistance.nearestSupport.price.toLocaleString('vi-VN')} điểm`
                        : 'DATA UNAVAILABLE'}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-terminal-up font-bold">
                      {supportResistance?.distanceToSupportPct !== null && supportResistance?.distanceToSupportPct !== undefined
                        ? `-${supportResistance.distanceToSupportPct}%`
                        : '--'}
                    </span>
                    <span className="text-[10px] text-terminal-text-muted block">
                      Độ mạnh: {supportResistance?.nearestSupport?.strength ?? 0}★
                    </span>
                  </div>
                </div>

                {supportResistance?.secondarySupport && (
                  <div className="flex items-center justify-between pt-1 border-t border-terminal-up/20 text-[11px]">
                    <span className="text-terminal-text-muted">Hỗ trợ thứ cấp (S2):</span>
                    <span className="text-terminal-text-secondary">
                      {supportResistance.secondarySupport.price.toLocaleString('vi-VN')} điểm ({supportResistance.secondarySupport.strength}★)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Position Meter */}
            <div className="pt-1 text-center text-[10px] text-terminal-text-muted font-mono">
              Khoảng giao dịch: S1 ({supportResistance?.nearestSupport?.price ?? '--'}) ↔ R1 ({supportResistance?.nearestResistance?.price ?? '--'})
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
