import React from 'react';
import { AlertTriangle, BookOpen } from 'lucide-react';
import type { VpsNormalizedFundamentals } from '../../services/market/providers/vps/types';

export interface StockRealFundamentalsProps {
  /** PHASE 8.5C: real VPS fundamentals (periods as provided by the source). */
  fundamentals: VpsNormalizedFundamentals | null;
  isLoading?: boolean;
  unavailableReason?: string | null;
}

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const formatBillion = (millionVnd: number | null): string => (millionVnd === null ? '—' : nf.format(millionVnd / 1000));
const formatVnd = (v: number | null): string => (v === null ? '—' : nf.format(Math.round(v)));
const formatRatio = (v: number | null, unit: string): string => (v === null ? '—' : `${nf.format(v)}${unit}`);

/**
 * PHASE 8.5C STEP 9/13 — REAL fundamentals from VPS.
 *
 * Honesty rules implemented here:
 *   - Values are the real source values (quarterly + annual slots V1..V4).
 *   - The source's period metadata is AMBIGUOUS — nothing is labeled as the
 *     current period; the warning banner says so explicitly.
 *   - Missing values render as '—', never fabricated.
 */
export const StockRealFundamentals: React.FC<StockRealFundamentalsProps> = ({
  fundamentals,
  isLoading = false,
  unavailableReason,
}) => {
  if (isLoading) {
    return (
      <div className="p-4 rounded-xl bg-terminal-surface border border-terminal-border text-xs text-terminal-text-muted font-mono">
        Đang tải BCTC thật (VPS)...
      </div>
    );
  }

  if (!fundamentals || fundamentals.dataStatus !== 'OK') {
    return (
      <div className="p-4 rounded-xl bg-terminal-surface border border-terminal-border space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
          <BookOpen className="w-4 h-4 text-terminal-accent" /> BCTC Thật (VPS)
        </div>
        <div className="text-xs text-terminal-text-muted font-mono">
          Dữ liệu BCTC không khả dụng{unavailableReason ? ` — ${unavailableReason}` : ''}.
        </div>
      </div>
    );
  }

  const q = fundamentals.quarterly;
  const a = fundamentals.annual;
  const qHeader = (i: number) => fundamentals.quarterlyPeriods[i]?.sourceLabel ?? `V${i + 1}`;
  const aHeader = (i: number) => fundamentals.annualPeriods[i]?.sourceLabel ?? `V${i + 1}`;

  return (
    <div className="p-4 rounded-xl bg-terminal-surface border border-terminal-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
          <BookOpen className="w-4 h-4 text-terminal-accent" /> BCTC Thật (VPS)
        </div>
        <span className="text-[10px] font-mono text-emerald-400">✓ dữ liệu thật</span>
      </div>

      <div className="p-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-[11px] text-amber-400 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Nguồn VPS trả số liệu theo 4 slot (V1..V4) nhưng metadata kỳ KHÔNG nhất quán với số liệu và KHÔNG xác nhận
          được kỳ hiện tại. Hai slot mới nhất theo thứ tự nguồn (V1 / V2) được hiển thị bên dưới.
        </span>
      </div>

      <RealTable
        titlePrefix="Quý"
        headers={[qHeader(0), qHeader(1)]}
        rows={[
          { name: 'EPS (VND)', v1: formatVnd(q.eps[0]), v2: formatVnd(q.eps[1]), unit: 'VND/cp' },
          { name: 'BVPS (VND)', v1: formatVnd(q.bvps[0]), v2: formatVnd(q.bvps[1]), unit: 'VND/cp' },
          { name: 'P/E', v1: formatRatio(q.pe[0], 'x'), v2: formatRatio(q.pe[1], 'x'), unit: 'lần' },
          { name: 'ROE', v1: formatRatio(q.roe[0], '%'), v2: formatRatio(q.roe[1], '%'), unit: '%' },
          { name: 'ROA', v1: formatRatio(q.roa[0], '%'), v2: formatRatio(q.roa[1], '%'), unit: '%' },
          { name: 'ROS', v1: formatRatio(q.ros[0], '%'), v2: formatRatio(q.ros[1], '%'), unit: '%' },
          { name: 'Doanh thu', v1: formatBillion(q.netRevenue[0]), v2: formatBillion(q.netRevenue[1]), unit: 'tỷ VND' },
          { name: 'LN gộp', v1: formatBillion(q.grossProfit[0]), v2: formatBillion(q.grossProfit[1]), unit: 'tỷ VND' },
          { name: 'LNST', v1: formatBillion(q.netProfit[0]), v2: formatBillion(q.netProfit[1]), unit: 'tỷ VND' },
          { name: 'Tổng tài sản', v1: formatBillion(q.totalAssets[0]), v2: formatBillion(q.totalAssets[1]), unit: 'tỷ VND' },
          { name: 'Nợ phải trả', v1: formatBillion(q.liabilities[0]), v2: formatBillion(q.liabilities[1]), unit: 'tỷ VND' },
          { name: 'VCSH', v1: formatBillion(q.equity[0]), v2: formatBillion(q.equity[1]), unit: 'tỷ VND' },
        ]}
      />

      <RealTable
        titlePrefix="Năm"
        headers={[aHeader(0), aHeader(1)]}
        rows={[
          { name: 'Doanh thu', v1: formatBillion(a.netRevenue[0]), v2: formatBillion(a.netRevenue[1]), unit: 'tỷ VND' },
          { name: 'LN gộp', v1: formatBillion(a.grossProfit[0]), v2: formatBillion(a.grossProfit[1]), unit: 'tỷ VND' },
          { name: 'LNST', v1: formatBillion(a.netProfit[0]), v2: formatBillion(a.netProfit[1]), unit: 'tỷ VND' },
          { name: 'Tổng tài sản', v1: formatBillion(a.totalAssets[0]), v2: formatBillion(a.totalAssets[1]), unit: 'tỷ VND' },
          { name: 'Nợ phải trả', v1: formatBillion(a.liabilities[0]), v2: formatBillion(a.liabilities[1]), unit: 'tỷ VND' },
          { name: 'VCSH', v1: formatBillion(a.equity[0]), v2: formatBillion(a.equity[1]), unit: 'tỷ VND' },
          { name: 'EPS (VND)', v1: formatVnd(a.eps[0]), v2: formatVnd(a.eps[1]), unit: 'VND/cp' },
          { name: 'BVPS (VND)', v1: formatVnd(a.bvps[0]), v2: formatVnd(a.bvps[1]), unit: 'VND/cp' },
          { name: 'P/E', v1: formatRatio(a.pe[0], 'x'), v2: formatRatio(a.pe[1], 'x'), unit: 'lần' },
          { name: 'ROE', v1: formatRatio(a.roe[0], '%'), v2: formatRatio(a.roe[1], '%'), unit: '%' },
          { name: 'ROA', v1: formatRatio(a.roa[0], '%'), v2: formatRatio(a.roa[1], '%'), unit: '%' },
          { name: 'ROS', v1: formatRatio(a.ros[0], '%'), v2: formatRatio(a.ros[1], '%'), unit: '%' },
        ]}
      />

      <p className="text-[10px] text-terminal-text-muted font-mono leading-relaxed">
        Giá trị gốc từ VPS getliststockbaseinfo (đơn vị triệu VND, đối chiếu với BCTC công bố). Không tự tính
        fair value / DCF / Graham do thiếu đầu vào thật đáng tin cậy ở giai đoạn này.
      </p>
    </div>
  );
};

interface TableRow {
  name: string;
  v1: string;
  v2: string;
  unit: string;
}

const RealTable: React.FC<{ titlePrefix: string; headers: string[]; rows: TableRow[] }> = ({
  titlePrefix,
  headers,
  rows,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs font-mono">
      <thead>
        <tr className="text-terminal-text-muted text-[10px] uppercase">
          <th className="text-left py-1 pr-2">{titlePrefix}</th>
          <th className="text-right py-1 px-2">{headers[0]}</th>
          <th className="text-right py-1 px-2">{headers[1]}</th>
          <th className="text-right py-1 px-2">Đơn vị</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} className="border-t border-terminal-border/50">
            <td className="py-1.5 pr-2 text-terminal-text-secondary">{row.name}</td>
            <td className="py-1.5 px-2 text-right text-terminal-text-primary">{row.v1}</td>
            <td className="py-1.5 px-2 text-right text-terminal-text-primary">{row.v2}</td>
            <td className="py-1.5 px-2 text-right text-terminal-text-muted">{row.unit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);