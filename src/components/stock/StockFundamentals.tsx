import React from 'react';
import { FundamentalMetrics } from '../../types/stockDetail';
import { formatVND, formatBillionVND } from '../../utils/formatters';
import { Building2, PieChart, TrendingUp, DollarSign, Award, Shield } from 'lucide-react';

export interface StockFundamentalsProps {
  fundamentals: FundamentalMetrics;
}

export const StockFundamentals: React.FC<StockFundamentalsProps> = ({ fundamentals }) => {
  return (
    <div
      id="stock-fundamentals"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-terminal-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Building2 className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
            Chỉ Số Tài Chính & Cơ Bản (Fundamental Metrics)
          </h3>
        </div>
        <span className="text-[11px] font-mono text-terminal-text-muted">
          Báo cáo tài chính kiểm toán 4 quý gần nhất
        </span>
      </div>

      {/* Grid of Fundamental Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
        {/* P/E */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">P/E (Hệ số Giá/LN)</div>
          <div className="text-xl font-bold font-mono text-terminal-text-primary">
            {fundamentals.pe}x
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            Trung bình ngành: ~14.2x
          </div>
        </div>

        {/* P/B */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">P/B (Giá/Giá trị sổ sách)</div>
          <div className="text-xl font-bold font-mono text-terminal-text-primary">
            {fundamentals.pb}x
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            Trung bình ngành: ~1.8x
          </div>
        </div>

        {/* EPS */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">EPS 4 quý (VND/CP)</div>
          <div className="text-xl font-bold font-mono text-terminal-up">
            {formatVND(fundamentals.eps)}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            Lợi nhuận trên mỗi cổ phiếu
          </div>
        </div>

        {/* ROE */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">ROE (Lợi nhuận / VCSH)</div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {fundamentals.roe}%
          </div>
          <div className="text-[10px] text-terminal-up mt-1">
            {fundamentals.roe >= 15 ? 'Vượt trội (>15%)' : 'Đạt chuẩn'}
          </div>
        </div>

        {/* ROA */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">ROA (Lợi nhuận / Tài sản)</div>
          <div className="text-xl font-bold font-mono text-terminal-text-primary">
            {fundamentals.roa}%
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            Hiệu quả sử dụng tổng tài sản
          </div>
        </div>

        {/* Dividend Yield */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Tỷ suất cổ tức (Yield)</div>
          <div className="text-xl font-bold font-mono text-amber-400">
            {fundamentals.dividendYield}%
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            Cổ tức tiền mặt & cổ phiếu
          </div>
        </div>

        {/* Revenue Growth YoY */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Tăng trưởng DT (YoY)</div>
          <div className="text-xl font-bold font-mono text-terminal-up">
            +{fundamentals.revenueGrowthYoY}%
          </div>
          <div className="text-[10px] text-terminal-up mt-1">
            Tăng trưởng so với cùng kỳ
          </div>
        </div>

        {/* Profit Growth YoY */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Tăng trưởng LN (YoY)</div>
          <div className="text-xl font-bold font-mono text-terminal-up">
            +{fundamentals.profitGrowthYoY}%
          </div>
          <div className="text-[10px] text-terminal-up mt-1">
            Lợi nhuận sau thuế phục hồi mạnh
          </div>
        </div>

        {/* Debt to Equity */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Nợ vay / VCSH (D/E)</div>
          <div className="text-xl font-bold font-mono text-terminal-text-primary">
            {fundamentals.debtToEquity}x
          </div>
          <div className="text-[10px] text-emerald-400 mt-1">
            An toàn đòn bẩy tài chính
          </div>
        </div>

        {/* Net Margin */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Biên lợi nhuận ròng</div>
          <div className="text-xl font-bold font-mono text-cyan-400">
            {fundamentals.netMargin}%
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            Biên gộp: {fundamentals.grossMargin}%
          </div>
        </div>

        {/* Shares Outstanding */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Cổ phiếu lưu hành</div>
          <div className="text-xl font-bold font-mono text-terminal-text-primary">
            {fundamentals.sharesOutstanding.toLocaleString()} tr
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            Số lượng cổ phiếu niêm yết
          </div>
        </div>

        {/* Market Cap */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
          <div className="text-terminal-text-muted mb-1">Vốn hóa thị trường</div>
          <div className="text-xl font-bold font-mono text-terminal-accent">
            {formatBillionVND(fundamentals.marketCapBillion)}
          </div>
          <div className="text-[10px] text-terminal-text-muted mt-1">
            Quy mô vốn hóa thị trường
          </div>
        </div>
      </div>
    </div>
  );
};
