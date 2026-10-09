import React, { useMemo, useState } from 'react';
import {
  FlaskConical,
  SlidersHorizontal,
  Database,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ScoreRing } from '../components/ui/ScoreRing';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { StrategyScorer } from '../lib/analysis/strategy/StrategyScorer';
import { SignalEngine, DEFAULT_THRESHOLDS_BY_HORIZON } from '../lib/analysis/strategy/SignalEngine';
import { StrategyFactory } from '../lib/strategy/StrategyFactory';
import { useRecommendationRankings } from '../hooks/useMarketQueries';
import {
  HORIZON_LABELS,
  SIGNAL_LABELS,
  type InvestmentHorizon,
} from '../types/recommendation';
import { formatNumber, formatPercent } from '../utils/formatters';

type ComponentKey =
  | 'technicalScore'
  | 'fundamentalScore'
  | 'momentumScore'
  | 'moneyFlowScore'
  | 'valuationScore'
  | 'riskScore';

interface ComponentMeta {
  readonly key: ComponentKey;
  readonly label: string;
  readonly hint: string;
  readonly risk: boolean;
}

const COMPONENTS: readonly ComponentMeta[] = [
  { key: 'technicalScore', label: 'Technical', hint: 'Xu hướng & chỉ báo kỹ thuật', risk: false },
  { key: 'fundamentalScore', label: 'Fundamental', hint: 'Tăng trưởng & chất lượng tài chính', risk: false },
  { key: 'momentumScore', label: 'Momentum', hint: 'Động lượng giá', risk: false },
  { key: 'moneyFlowScore', label: 'Money Flow', hint: 'Dòng tiền tổ chức / khối ngoại', risk: false },
  { key: 'valuationScore', label: 'Valuation', hint: 'Biên an toàn so với giá hợp lý', risk: false },
  { key: 'riskScore', label: 'Risk', hint: 'Càng cao = càng rủi ro (đảo chiều khi tính điểm)', risk: true },
];

const DEFAULT_COMPONENTS: Record<ComponentKey, number | null> = {
  technicalScore: 70,
  fundamentalScore: 62,
  momentumScore: 66,
  moneyFlowScore: 58,
  valuationScore: 60,
  riskScore: 35,
};

const sliderCls = 'w-full accent-terminal-accent';

function signalBadge(signal: string): 'up' | 'down' | 'secondary' {
  if (signal === 'BUY') return 'up';
  if (signal === 'SELL') return 'down';
  return 'secondary';
}

/**
 * PHASE 17.3 / 17.4 / 25 — STRATEGY LAB
 *
 * Three deterministic surfaces, none of which can place an order:
 *   1. Strategy scoring sandbox — StrategyScorer + SignalEngine (pure, no IO).
 *   2. Strategy Factory catalogue + fail-closed parameter validation (Phase 25).
 *   3. Live candidate rankings produced by the server from real KBS/VPS bars.
 */
export const StrategyLabPage: React.FC = () => {
  const [horizon, setHorizon] = useState<InvestmentHorizon>('SHORT_TERM');
  const [components, setComponents] = useState<Record<ComponentKey, number | null>>(DEFAULT_COMPONENTS);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(
    StrategyFactory.getAllStrategies()[0]?.id ?? ''
  );
  const [paramText, setParamText] = useState<string>(
    JSON.stringify(
      StrategyFactory.getAllStrategies()[0]?.defaultParameters ?? {},
      null,
      2
    )
  );

  const rankingsQuery = useRecommendationRankings(horizon);

  const scoreResult = useMemo(
    () =>
      StrategyScorer.score(
        {
          technicalScore: components.technicalScore,
          fundamentalScore: components.fundamentalScore,
          momentumScore: components.momentumScore,
          moneyFlowScore: components.moneyFlowScore,
          valuationScore: components.valuationScore,
          riskScore: components.riskScore,
        },
        horizon
      ),
    [components, horizon]
  );

  const signalResult = useMemo(() => SignalEngine.generateFromScoreResult(scoreResult), [scoreResult]);

  const strategies = useMemo(() => StrategyFactory.getAllStrategies(), []);
  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId) ?? strategies[0];

  const paramValidation = useMemo(() => {
    if (!selectedStrategy) return { valid: false, errors: ['Không có chiến lược nào được đăng ký.'] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(paramText);
    } catch (err) {
      return {
        valid: false,
        errors: [`JSON không hợp lệ: ${err instanceof Error ? err.message : String(err)}`],
      };
    }
    return StrategyFactory.validateParameters(selectedStrategy.id, parsed);
  }, [paramText, selectedStrategy]);

  const selectStrategy = (id: string) => {
    const found = strategies.find((s) => s.id === id);
    if (!found) return;
    setSelectedStrategyId(id);
    setParamText(JSON.stringify(found.defaultParameters, null, 2));
  };

  const rankings = Array.isArray(rankingsQuery.data?.rankings) ? rankingsQuery.data!.rankings : [];

  const thresholds = DEFAULT_THRESHOLDS_BY_HORIZON[horizon];

  return (
    <div id="page-strategy-lab" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-terminal-border">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <FlaskConical className="w-4 h-4" />
            </div>
            <h1 className="page-title">Strategy Lab (Quant Studio)</h1>
            <DataStatusBadge status="LIVE" compact />
          </div>
          <p className="text-xs text-terminal-text-muted mt-1">
            Phòng thí nghiệm chiến lược: chấm điểm tất định, kiểm tra tham số fail-closed và bảng
            xếp hạng ứng viên từ dữ liệu KBS/VPS thật.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          <ShieldCheck className="w-3 h-3" /> Recommend-only · không đặt lệnh
        </span>
      </div>

      {/* 1. Scoring sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase text-terminal-text-muted">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Bàn chấm điểm (StrategyScorer)
            </div>
            <div className="flex items-center gap-1.5">
              {(Object.keys(HORIZON_LABELS) as InvestmentHorizon[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
                    horizon === h
                      ? 'border-terminal-accent/60 bg-terminal-accent/15 text-terminal-accent'
                      : 'border-terminal-border text-terminal-text-muted hover:text-terminal-text-primary'
                  }`}
                >
                  {h.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
            {COMPONENTS.map((meta) => {
              const value = components[meta.key];
              return (
                <div key={meta.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <label htmlFor={`sl-${meta.key}`} className="text-terminal-text-secondary">
                      {meta.label}
                      {meta.risk && <span className="text-amber-400 ml-1">(rủi ro)</span>}
                    </label>
                    <span className="flex items-center gap-2">
                      <span className="text-terminal-text-primary">
                        {value === null ? '--' : value}
                      </span>
                      <label className="flex items-center gap-1 text-[10px] text-terminal-text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={value === null}
                          onChange={(e) =>
                            setComponents((prev) => ({
                              ...prev,
                              [meta.key]: e.target.checked ? null : 50,
                            }))
                          }
                        />
                        thiếu DL
                      </label>
                    </span>
                  </div>
                  <input
                    id={`sl-${meta.key}`}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    disabled={value === null}
                    value={value ?? 0}
                    onChange={(e) =>
                      setComponents((prev) => ({ ...prev, [meta.key]: Number(e.target.value) }))
                    }
                    className={sliderCls}
                  />
                  <div className="text-[10px] text-terminal-text-muted">{meta.hint}</div>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] font-mono text-terminal-text-muted border-t border-terminal-border pt-2">
            {HORIZON_LABELS[horizon]} · trọng số chuẩn:{' '}
            {Object.entries(scoreResult.weights)
              .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
              .join(' · ')}
          </div>
        </div>

        <div className="bg-terminal-surface border border-terminal-border rounded-md p-4 flex flex-col items-center justify-center gap-3">
          <ScoreRing
            score={scoreResult.score ?? 0}
            label="STRATEGY SCORE"
            sublabel={`${scoreResult.availableComponents}/6 thành phần`}
          />
          <Badge variant={signalBadge(signalResult.signal)} size="md">
            {SIGNAL_LABELS[signalResult.signal] ?? signalResult.signal}
          </Badge>
          <div className="text-[11px] font-mono text-terminal-text-secondary text-center">
            {signalResult.isValid ? signalResult.reason : 'Không đủ dữ liệu — tín hiệu fail-closed.'}
          </div>
          <div className="w-full text-[10px] font-mono text-terminal-text-muted space-y-1 border-t border-terminal-border pt-2">
            <div className="flex justify-between">
              <span>Ngưỡng BUY</span>
              <span className="text-emerald-400">≥ {thresholds.buyMin}</span>
            </div>
            <div className="flex justify-between">
              <span>Ngưỡng HOLD</span>
              <span className="text-amber-400">≥ {thresholds.holdMin}</span>
            </div>
            <div className="flex justify-between">
              <span>Dưới HOLD</span>
              <span className="text-rose-400">SELL</span>
            </div>
          </div>

          <table className="w-full text-[10px] font-mono">
            <tbody className="divide-y divide-terminal-border">
              {COMPONENTS.map((meta) => {
                const key = meta.key.replace('Score', '') as keyof typeof scoreResult.contributions;
                const contribution = scoreResult.contributions[key];
                if (!contribution) return null;
                return (
                  <tr key={meta.key}>
                    <td className="py-1 text-terminal-text-muted">{meta.label}</td>
                    <td className="py-1 text-right text-terminal-text-secondary">
                      {contribution.score === null ? '--' : contribution.score}
                    </td>
                    <td className="py-1 text-right text-terminal-text-muted">
                      {contribution.normalizedWeight === null
                        ? '—'
                        : `${Math.round(contribution.normalizedWeight * 100)}%`}
                    </td>
                    <td className="py-1 text-right text-terminal-text-primary">
                      {contribution.weightedScore === null
                        ? '--'
                        : formatNumber(contribution.weightedScore, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Strategy Factory catalogue + validator */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-terminal-text-muted">
              Strategy Factory — danh mục chiến lược multi-asset (Phase 25)
            </span>
            <Badge variant="brand" size="xs">
              {strategies.length} strategies
            </Badge>
          </div>

          <div className="space-y-2">
            {strategies.map((s) => {
              const active = s.id === selectedStrategy?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectStrategy(s.id)}
                  className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
                    active
                      ? 'border-terminal-accent/60 bg-terminal-accent/10'
                      : 'border-terminal-border hover:border-terminal-border-bright'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-terminal-text-primary">{s.name}</span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="secondary" size="xs">
                        {s.assetClass}
                      </Badge>
                      {active && <ChevronRight className="w-3.5 h-3.5 text-terminal-accent" />}
                    </span>
                  </div>
                  <div className="text-[11px] text-terminal-text-muted mt-0.5">{s.description}</div>
                  <div className="text-[10px] font-mono text-terminal-text-muted/70 mt-1">
                    {s.id}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-terminal-surface border border-terminal-border rounded-md p-4 space-y-3">
          <div className="text-[11px] font-mono uppercase text-terminal-text-muted">
            Kiểm tra tham số (fail-closed)
          </div>
          <textarea
            value={paramText}
            onChange={(e) => setParamText(e.target.value)}
            rows={10}
            spellCheck={false}
            aria-label="Strategy parameters JSON"
            className="w-full text-[11px] font-mono bg-terminal-surface-elevated border border-terminal-border rounded p-2.5 text-terminal-text-primary focus:outline-none focus:border-terminal-accent"
          />
          <div
            className={`flex items-start gap-2 text-[11px] font-mono rounded border px-2.5 py-2 ${
              paramValidation.valid
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
            }`}
            role="status"
          >
            {paramValidation.valid ? (
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            )}
            <div>
              <div className="uppercase text-[10px]">
                {paramValidation.valid ? 'Tham số hợp lệ' : 'Từ chối (fail-closed)'}
              </div>
              {(paramValidation.errors ?? []).map((err) => (
                <div key={err} className="mt-0.5">
                  {err}
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] font-mono text-terminal-text-muted">
            StrategyFactory không eval chuỗi động; tham số sai → tín hiệu HOLD/FLAT, không phải
            lệnh giả.
          </div>
        </div>
      </div>

      {/* 3. Live rankings */}
      <div className="bg-terminal-surface border border-terminal-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-terminal-border flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[11px] font-mono uppercase text-terminal-text-muted">
            <Database className="w-3.5 h-3.5" /> Ứng viên xếp hạng theo {horizon.replace('_', ' ')}
          </span>
          <span className="flex items-center gap-2">
            <DataStatusBadge
              status={
                rankingsQuery.isLoading
                  ? 'LOADING'
                  : rankingsQuery.error
                    ? 'DATA_UNAVAILABLE'
                    : rankings.length > 0
                      ? 'LIVE'
                      : 'PARTIAL'
              }
              compact
            />
            <Button
              size="xs"
              variant="outline"
              onClick={() => rankingsQuery.refetch()}
              isLoading={rankingsQuery.isFetching}
            >
              Tải lại
            </Button>
          </span>
        </div>

        {rankingsQuery.error && (
          <div className="px-4 py-3 text-[11px] font-mono text-amber-400 bg-amber-500/5 border-b border-terminal-border">
            Bảng xếp hạng yêu cầu nguồn dữ liệu đang gián đoạn — hiển thị trạng thái fail-closed,
            không có số liệu thay thế.
          </div>
        )}

        {rankings.length === 0 && !rankingsQuery.error ? (
          <EmptyState
            compact
            title="NO_CANDIDATES"
            description="Chưa có ứng viên nào được xếp hạng cho khung chiến lược này."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono border-collapse">
              <thead>
                <tr className="bg-terminal-surface-subtle text-[10px] uppercase text-terminal-text-muted">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Mã</th>
                  <th className="px-3 py-2">Doanh nghiệp</th>
                  <th className="px-3 py-2 text-right">Điểm</th>
                  <th className="px-3 py-2">Tín hiệu</th>
                  <th className="px-3 py-2">Độ tin cậy</th>
                  <th className="px-3 py-2 text-right">Kỳ vọng</th>
                  <th className="px-3 py-2 text-right">R:R</th>
                  <th className="px-3 py-2">Nguồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border">
                {rankings.map((r) => (
                  <tr key={r.symbol} className="hover:bg-terminal-surface-hover">
                    <td className="px-3 py-1.5 text-terminal-text-muted">{r.rank}</td>
                    <td className="px-3 py-1.5 font-bold text-terminal-text-primary">{r.symbol}</td>
                    <td className="px-3 py-1.5 text-terminal-text-secondary">
                      {r.companyName ?? '--'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-terminal-text-primary">
                      {formatNumber(r.score, 1)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant={signalBadge(r.signal)} size="xs">
                        {r.signal}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-terminal-text-secondary">{r.confidence}</td>
                    <td className="px-3 py-1.5 text-right">
                      {formatPercent(r.expectedReturn)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-terminal-text-secondary">
                      {formatNumber(r.riskReward, 2)}
                    </td>
                    <td className="px-3 py-1.5 text-terminal-text-muted">{r.dataStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-2 border-t border-terminal-border text-[10px] font-mono text-terminal-text-muted">
          Điểm tổng hợp được tính trên nến KBS + báo cáo VPS; thiếu dữ liệu → điểm null và cờ
          DATA_UNAVAILABLE, không phải 0 giả.
        </div>
      </div>

      <Card variant="subtle" className="text-[10px] font-mono text-terminal-text-muted leading-relaxed">
        Strategy Lab là bề mặt nghiên cứu: nó chấm điểm và mô phỏng tín hiệu, không bao giờ tự ý
        chuyển HOLD/FLAT thành BUY/SELL và không chạm vào RiskGuard / TradingEngine.
      </Card>
    </div>
  );
};
