import React from 'react';
import { MoneyFlowData } from '../../types/stockDetail';
import type { MoneyFlowResult } from '../../lib/analysis/moneyFlow/MoneyFlowEngine';
import { formatVolume, formatBillionVND } from '../../utils/formatters';
import { Coins, ArrowUpRight, ArrowDownRight, ShieldCheck, Activity, TrendingUp, Info } from 'lucide-react';

export interface StockMoneyFlowProps {
  moneyFlow: MoneyFlowData;
  analysis?: MoneyFlowResult | null;
}

export const StockMoneyFlow: React.FC<StockMoneyFlowProps> = ({ moneyFlow, analysis }) => {
  const isForeignNetBuy = analysis
    ? (analysis.foreignFlow.net !== null ? analysis.foreignFlow.net >= 0 : moneyFlow.foreignNetValue >= 0)
    : moneyFlow.foreignNetValue >= 0;

  const isPropNetBuy = moneyFlow.propTradingNetValue >= 0;

  const totalBuySell = moneyFlow.activeBuyVolume + moneyFlow.activeSellVolume || 1;
  const buyPercent = Math.round((moneyFlow.activeBuyVolume / totalBuySell) * 100);
  const sellPercent = 100 - buyPercent;

  const getTrendBadge = (trend?: string) => {
    switch (trend) {
      case 'STRONG_INFLOW':
        return { label: 'DÒNG TIỀN VÀO MẠNH', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
      case 'INFLOW':
        return { label: 'DÒNG TIỀN TÍCH CỰC', color: 'bg-green-500/20 text-green-400 border-green-500/40' };
      case 'OUTFLOW':
        return { label: 'DÒNG TIỀN RÚT RA', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' };
      case 'STRONG_OUTFLOW':
        return { label: 'RÚT RÒNG ÁP ĐẢO', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' };
      case 'NEUTRAL':
      default:
        return { label: 'DÒNG TIỀN CÂN BẰNG', color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' };
    }
  };

  const trendBadge = getTrendBadge(analysis?.trend);

  return (
    <div
      id="stock-money-flow"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-4"
    >
      {/* Header with Score */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-terminal-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
              Phân Tích Dòng Tiền (Money Flow Analysis)
            </h3>
            <span className="text-[11px] font-mono text-terminal-text-muted">
              Chuẩn hóa Điểm số 0 - 100 & Dữ liệu Khối ngoại thực tế
            </span>
          </div>
        </div>

        {analysis && (
          <div className="flex items-center gap-2.5">
            <span className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-full border ${trendBadge.color}`}>
              {trendBadge.label}
            </span>
            <div className="px-3 py-1 rounded-lg bg-terminal-bg border border-terminal-border flex items-baseline gap-1">
              <span className="text-[10px] uppercase font-mono text-terminal-text-muted">Score:</span>
              <strong className="text-base font-mono font-bold text-terminal-accent">
                {analysis.score}
              </strong>
              <span className="text-[10px] font-mono text-terminal-text-muted">/100</span>
            </div>
          </div>
        )}
      </div>

      {/* Engine Metrics Grid (When analysis is present) */}
      {analysis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {/* Volume Ratio */}
          <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
            <div className="text-[11px] text-terminal-text-muted">Tỷ lệ Vol / SMA20</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-sm font-bold font-mono text-terminal-text-primary">
                {analysis.volumeSignal.volumeRatio !== null ? `${analysis.volumeSignal.volumeRatio}x` : 'N/A'}
              </span>
              <span className="text-[10px] font-mono text-terminal-accent">
                ({analysis.volumeSignal.status})
              </span>
            </div>
          </div>

          {/* Trading Value */}
          <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
            <div className="text-[11px] text-terminal-text-muted">Giá trị giao dịch</div>
            <div className="mt-1 text-sm font-bold font-mono text-terminal-text-primary">
              {formatBillionVND(analysis.tradingValue)}
            </div>
          </div>

          {/* Price-Volume Pattern */}
          <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
            <div className="text-[11px] text-terminal-text-muted">Mô hình Giá - Vol</div>
            <div className="mt-1 text-xs font-mono font-semibold text-terminal-accent truncate" title={analysis.priceVolumeRelationship.description}>
              {analysis.priceVolumeRelationship.pattern.replace('_', ' ')}
            </div>
          </div>

          {/* Accumulation/Distribution */}
          <div className="p-2.5 rounded-lg bg-terminal-bg border border-terminal-border/80">
            <div className="text-[11px] text-terminal-text-muted">Tích lũy / Phân phối</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`text-xs font-mono font-bold ${
                  analysis.accumulationSignal.status === 'ACCUMULATION'
                    ? 'text-terminal-up'
                    : analysis.accumulationSignal.status === 'DISTRIBUTION'
                    ? 'text-terminal-down'
                    : 'text-terminal-text-primary'
                }`}
              >
                {analysis.accumulationSignal.status === 'ACCUMULATION'
                  ? 'TÍCH LŨY'
                  : analysis.accumulationSignal.status === 'DISTRIBUTION'
                  ? 'PHÂN PHỐI'
                  : 'TRUNG LẬP'}
              </span>
              {analysis.accumulationSignal.cmf20 !== null && (
                <span className="text-[10px] font-mono text-terminal-text-muted">
                  CMF: {analysis.accumulationSignal.cmf20}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Buy vs Active Sell Pressure */}
      <div className="space-y-2 p-3 rounded-lg bg-terminal-bg border border-terminal-border/80">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-terminal-text-primary">Tương quan Mua / Bán Chủ Động</span>
          <span className="font-mono text-[11px] text-terminal-up">
            Hệ số áp lực: {moneyFlow.orderPressureRatio}x ({buyPercent >= 50 ? 'Bên mua kiểm soát' : 'Bên bán kiểm soát'})
          </span>
        </div>

        {/* Dual Bar */}
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-terminal-surface-subtle">
          <div
            className="bg-terminal-up h-full transition-all duration-300"
            style={{ width: `${buyPercent}%` }}
          />
          <div
            className="bg-terminal-down h-full transition-all duration-300"
            style={{ width: `${sellPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1 text-terminal-up">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Mua CĐ: {buyPercent}% ({formatVolume(moneyFlow.activeBuyVolume)})</span>
          </div>
          <div className="flex items-center gap-1 text-terminal-down">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>Bán CĐ: {sellPercent}% ({formatVolume(moneyFlow.activeSellVolume)})</span>
          </div>
        </div>
      </div>

      {/* Foreign Investors (Khối ngoại: Foreign buy, Foreign sell, Foreign net) */}
      <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-terminal-text-primary">Giao Dịch Khối Ngoại (Foreign Trading)</span>
          {analysis?.foreignFlow.signal === 'NO_DATA' ? (
            <span className="text-[10px] font-mono text-terminal-text-muted">Chưa có dữ liệu</span>
          ) : (
            <span className="text-[10px] font-mono text-terminal-accent">
              {isForeignNetBuy ? 'Mua ròng' : 'Bán ròng'}
            </span>
          )}
        </div>

        {analysis?.foreignFlow.signal !== 'NO_DATA' && analysis?.foreignFlow.foreignNet !== null ? (
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono">
            <div>
              <span className="text-[10px] text-terminal-text-muted block">Foreign Buy (Mua):</span>
              <strong className="text-terminal-text-primary">
                {formatVolume(analysis.foreignFlow.foreignBuy ?? 0)} CP
              </strong>
              {analysis.foreignFlow.buyValue && (
                <span className="text-[10px] text-terminal-text-muted block">
                  {(analysis.foreignFlow.buyValue / 1e9).toFixed(1)} tỷ VND
                </span>
              )}
            </div>
            <div>
              <span className="text-[10px] text-terminal-text-muted block">Foreign Sell (Bán):</span>
              <strong className="text-terminal-text-primary">
                {formatVolume(analysis.foreignFlow.foreignSell ?? 0)} CP
              </strong>
              {analysis.foreignFlow.sellValue && (
                <span className="text-[10px] text-terminal-text-muted block">
                  {(analysis.foreignFlow.sellValue / 1e9).toFixed(1)} tỷ VND
                </span>
              )}
            </div>
            <div>
              <span className="text-[10px] text-terminal-text-muted block">Foreign Net (Ròng):</span>
              <strong className={isForeignNetBuy ? 'text-terminal-up' : 'text-terminal-down'}>
                {analysis.foreignFlow.foreignNet >= 0 ? `+${formatVolume(analysis.foreignFlow.foreignNet)}` : formatVolume(analysis.foreignFlow.foreignNet)} CP
              </strong>
              {analysis.foreignFlow.netValue && (
                <span className={`text-[10px] block ${isForeignNetBuy ? 'text-terminal-up' : 'text-terminal-down'}`}>
                  {analysis.foreignFlow.netValue >= 0 ? `+${(analysis.foreignFlow.netValue / 1e9).toFixed(1)}` : (analysis.foreignFlow.netValue / 1e9).toFixed(1)} tỷ VND
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1 text-xs text-terminal-text-muted">
            <Info className="w-4 h-4 text-terminal-text-muted/60 shrink-0" />
            <span>Không có dữ liệu giao dịch khối ngoại phiên này (hệ thống không suy đoán khi thiếu dữ liệu).</span>
          </div>
        )}
      </div>

      {/* Institutional Activity: STRICT Constraint - Do not infer without actual data */}
      <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-terminal-text-primary">Hoạt Động Khớp Lệnh Tổ Chức & Lệnh Lớn</span>
          <span className="text-[10px] font-mono text-terminal-text-muted">Nguyên tắc kiểm chứng</span>
        </div>

        {analysis?.institutionalFlow && analysis.institutionalFlow.hasData ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div>
                <span className="text-[10px] text-terminal-text-muted block">Lệnh lớn Mua:</span>
                <strong className="text-terminal-text-primary">
                  {analysis.institutionalFlow.largeOrdersBuy ? `${(analysis.institutionalFlow.largeOrdersBuy / 1e9).toFixed(1)} tỷ` : 'N/A'}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-terminal-text-muted block">Lệnh lớn Bán:</span>
                <strong className="text-terminal-text-primary">
                  {analysis.institutionalFlow.largeOrdersSell ? `${(analysis.institutionalFlow.largeOrdersSell / 1e9).toFixed(1)} tỷ` : 'N/A'}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-terminal-text-muted block">Mua/Bán ròng Lệnh lớn:</span>
                <strong className={(analysis.institutionalFlow.netBigMoney ?? 0) >= 0 ? 'text-terminal-up' : 'text-terminal-down'}>
                  {(analysis.institutionalFlow.netBigMoney ?? 0) >= 0 ? `+${((analysis.institutionalFlow.netBigMoney ?? 0) / 1e9).toFixed(1)} tỷ` : `${((analysis.institutionalFlow.netBigMoney ?? 0) / 1e9).toFixed(1)} tỷ`}
                </strong>
              </div>
            </div>
            <p className="text-[11px] font-mono text-terminal-text-muted">
              {analysis.institutionalFlow.description}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1 text-xs text-terminal-text-muted">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Không có dữ liệu giao dịch khớp lệnh tổ chức (tuân thủ nguyên tắc không suy đoán hành vi tổ chức khi chưa có dữ liệu thực tế).</span>
          </div>
        )}
      </div>

      {/* Reasons / Insights List */}
      {analysis && analysis.reasons && analysis.reasons.length > 0 && (
        <div className="p-3 rounded-lg bg-terminal-surface-subtle/50 border border-terminal-border/60 space-y-1.5">
          <div className="text-[11px] font-semibold text-terminal-text-primary uppercase font-mono tracking-wider">
            Luận Điểm Đánh Giá Dòng Tiền (Reasons)
          </div>
          <ul className="space-y-1 text-xs text-terminal-text-muted font-mono">
            {analysis.reasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-terminal-accent shrink-0">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
