import { AIMarketSummary } from '../../types/market';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Signal } from '../ui/Signal';
import { DemoBadge } from '../common/DemoBadge';
import { Sparkles, TrendingUp, AlertTriangle, ShieldAlert, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';

export interface AIMarketSummaryCardProps {
  summary: AIMarketSummary;
  onSelectStock?: (symbol: string) => void;
}

export function AIMarketSummaryCard({ summary, onSelectStock }: AIMarketSummaryCardProps) {
  const signalType =
    summary.trend === 'TÍCH CỰC' ? 'BUY' : summary.trend === 'TIÊU CỰC' ? 'SELL' : 'HOLD';

  return (
    <Card id="card-ai-market-analyst" variant="default" className="space-y-4">
      {/* Header with AI Brand & Demo Badge */}
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-terminal-border">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30">
            <Sparkles className="w-5 h-5 text-terminal-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold tracking-tight uppercase">
                AI Market Analyst
              </CardTitle>
              <DemoBadge size="sm" />
            </div>
            <p className="text-xs text-terminal-text-muted">
              Tổng hợp và đánh giá thị trường chứng khoán Việt Nam theo thời gian thực
            </p>
          </div>
        </div>

        {/* Status Score & Time */}
        <div className="flex items-center gap-3">
          <Signal
            type={signalType}
            score={summary.trendScore}
            label={summary.trend}
            confidence="high"
          />
          <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-terminal-text-muted">
            <Clock className="w-3.5 h-3.5" />
            <span>{summary.updatedAt}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3.5 p-0">
        {/* Grid: Trend & Money Flow */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Market Trend */}
          <div className="p-3 rounded bg-terminal-surface-subtle border border-terminal-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-terminal-text-secondary uppercase tracking-wider">
                1. Xu Hướng Thị Trường
              </span>
              <Badge variant="up" size="xs">
                <TrendingUp className="w-3 h-3" />
                {summary.trend}
              </Badge>
            </div>
            <p className="text-xs text-terminal-text-secondary leading-relaxed">
              Thị trường đang duy trì xu thế tăng điểm ngắn hạn trên các đường trung bình động (MA20). Lực cầu chủ động tại các vùng hỗ trợ giúp chỉ số giữ vững trạng thái tích cực.
            </p>
          </div>

          {/* Money Flow */}
          <div className="p-3 rounded bg-terminal-surface-subtle border border-terminal-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-terminal-text-secondary uppercase tracking-wider">
                2. Vận Động Dòng Tiền
              </span>
              <Badge variant="accent" size="xs">
                Hấp thụ tốt
              </Badge>
            </div>
            <p className="text-xs text-terminal-text-secondary leading-relaxed">
              {summary.moneyFlow}
            </p>
          </div>
        </div>

        {/* Sectors: Strong vs Weak */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Strong Sectors */}
          <div className="p-3 rounded bg-terminal-surface-subtle border border-terminal-border">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-mono font-semibold text-terminal-up uppercase">
              <ArrowUpRight className="w-4 h-4" />
              <span>Nhóm Ngành Dẫn Dắt (Mạnh)</span>
            </div>
            <ul className="space-y-1.5 text-xs text-terminal-text-secondary">
              {summary.strongSectors.map((sec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-terminal-up mt-0.5 font-bold">✓</span>
                  <span>{sec}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Weak Sectors */}
          <div className="p-3 rounded bg-terminal-surface-subtle border border-terminal-border">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-mono font-semibold text-terminal-down uppercase">
              <ArrowDownRight className="w-4 h-4" />
              <span>Nhóm Ngành Áp Lực (Yếu)</span>
            </div>
            <ul className="space-y-1.5 text-xs text-terminal-text-secondary">
              {summary.weakSectors.map((sec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-terminal-down mt-0.5 font-bold">✕</span>
                  <span>{sec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Risk Alerts */}
        <div className="p-3 rounded bg-terminal-ref/5 border border-terminal-ref/25">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-mono font-semibold text-terminal-ref uppercase">
            <AlertTriangle className="w-4 h-4" />
            <span>Cảnh Báo Rủi Ro Cần Lưu Ý</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-terminal-text-secondary">
            {summary.riskAlerts.map((risk, i) => (
              <div key={i} className="p-2 rounded bg-terminal-bg border border-terminal-border flex items-start gap-2">
                <span className="text-terminal-ref font-bold">•</span>
                <span className="text-[11px] leading-snug">{risk}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Overall Comment */}
        <div className="p-3.5 rounded bg-terminal-surface-subtle border border-terminal-border text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-terminal-text-primary font-mono font-bold uppercase tracking-wider text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5 text-terminal-accent" />
            <span>Nhận Xét Tổng Quan & Chiến Lược</span>
          </div>
          <p className="text-terminal-text-secondary leading-relaxed">
            {summary.overallComment}
          </p>
        </div>

        {/* Mandatory Disclaimer Box */}
        <div className="p-2.5 rounded bg-terminal-ref/10 border border-terminal-ref/25 flex items-center justify-between text-xs text-terminal-ref/90 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-terminal-ref animate-pulse" />
            <span>
              <strong>LƯU Ý:</strong> {summary.disclaimer}
            </span>
          </div>
          <Badge variant="ref" size="xs">
            DEMO DATA
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
