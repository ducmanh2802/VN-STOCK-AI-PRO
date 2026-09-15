import React, { useState, useEffect } from 'react';
import {
  Database,
  Activity,
  CheckCircle2,
  Clock,
  RefreshCw,
  Server,
  Zap,
  Layers,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { DataStatusBadge } from '../components/ui/DataStatusBadge';

interface EndpointHealth {
  name: string;
  endpoint: string;
  provider: string;
  status: 'LIVE' | 'DEGRADED' | 'UNAVAILABLE';
  latencyMs: number | null;
  description: string;
}

export const DataStatusPage: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [feeds, setFeeds] = useState<EndpointHealth[]>([
    {
      name: 'VPS Realtime Quote Stream',
      endpoint: '/api/market-data/quote/HPG',
      provider: 'VPS Securities API',
      status: 'LIVE',
      latencyMs: null,
      description: 'Dữ liệu báo giá thời gian thực khớp lệnh, bước giá và khối lượng (VND/share)',
    },
    {
      name: 'KBS Historical Candlestick Service',
      endpoint: '/api/market-data/history/HPG?timeframe=1M',
      provider: 'KB Securities Vietnam (KBS)',
      status: 'LIVE',
      latencyMs: null,
      description: 'Dữ liệu lịch sử nến ngày OHLCV, chỉ báo kỹ thuật SMA/EMA/RSI/MACD',
    },
    {
      name: 'VPS Fundamentals & Financial Statements',
      endpoint: '/api/market-data/fundamentals/HPG',
      provider: 'VPS Corporate Disclosures',
      status: 'LIVE',
      latencyMs: null,
      description: 'Báo cáo tài chính chuẩn hóa theo quý (Doanh thu, LNST, Tài sản, Nợ)',
    },
    {
      name: 'Quantitative Signal & Recommendation Engine',
      endpoint: '/api/recommendations/rankings?strategy=SHORT_TERM',
      provider: 'Internal Quant Pipeline',
      status: 'LIVE',
      latencyMs: null,
      description: 'Bảng xếp hạng chiến lược đa khung thời gian (Ngắn, Trung, Dài hạn)',
    },
    {
      name: 'TradingEngine & PaperBroker Engine',
      endpoint: '/api/trading/status',
      provider: 'Process-Local Trading Engine',
      status: 'LIVE',
      latencyMs: null,
      description: 'Cơ chế khớp lệnh giả lập, kiểm soát rủi ro RiskGuard và bảo toàn danh mục',
    },
    {
      name: 'Macroeconomic Intelligence Registry',
      endpoint: '/api/macro/indicators',
      provider: 'Macro Intelligence Layer',
      status: 'LIVE',
      latencyMs: null,
      description: 'Chỉ số vĩ mô Việt Nam (Lãi suất điều hành NHNN, CPI, Tỷ giá USD/VND)',
    },
  ]);

  const measureLatency = async () => {
    setChecking(true);
    const updatedFeeds = await Promise.all(
      feeds.map(async (feed) => {
        const start = performance.now();
        try {
          const res = await fetch(feed.endpoint, { cache: 'no-store' });
          const end = performance.now();
          const latency = Math.round(end - start);
          if (res.ok) {
            return { ...feed, latencyMs: latency, status: (latency > 1500 ? 'DEGRADED' : 'LIVE') as 'LIVE' | 'DEGRADED' };
          } else {
            return { ...feed, latencyMs: latency, status: 'UNAVAILABLE' as const };
          }
        } catch {
          const end = performance.now();
          return { ...feed, latencyMs: Math.round(end - start), status: 'UNAVAILABLE' as const };
        }
      })
    );
    setFeeds(updatedFeeds);
    setChecking(false);
  };

  useEffect(() => {
    measureLatency();
  }, []);

  const liveFeeds = feeds.filter((f) => f.status === 'LIVE').length;
  const latencies = feeds.map((f) => f.latencyMs).filter((l): l is number => l !== null);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  return (
    <div id="page-data-status" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#263244]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Database className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold font-sans text-slate-100">
              Data Quality & Live Feed Health Monitor
            </h1>
            <DataStatusBadge
              status={liveFeeds === feeds.length ? 'LIVE' : liveFeeds > 0 ? 'PARTIAL' : 'UNAVAILABLE'}
              compact
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Giám sát thời gian thực tính khả dụng, độ trễ và độ tin cậy của các luồng dữ liệu VPS, KBS, Macro và TradingEngine
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={measureLatency}
            disabled={checking}
            leftIcon={RefreshCw}
          >
            {checking ? 'Đang đo ping...' : 'Đo lại độ trễ mạng'}
          </Button>
        </div>
      </div>

      {/* Top Health Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="ĐỘ TRỄ TRUNG BÌNH"
          value={avgLatency !== null ? `${avgLatency}ms` : 'Đang đo...'}
          subValue="Độ trễ khứ hồi HTTP thực tế"
          badge={avgLatency && avgLatency < 200 ? 'FAST' : 'NORMAL'}
          badgeVariant="success"
          icon={Zap}
          status="LIVE"
        />

        <MetricCard
          label="LUỒNG DỮ LIỆU HOẠT ĐỘNG"
          value={`${liveFeeds} / ${feeds.length}`}
          subValue="Các dịch vụ dữ liệu chính đang kết nối"
          badge={liveFeeds === feeds.length ? 'ALL HEALTHY' : 'PARTIAL'}
          badgeVariant={liveFeeds === feeds.length ? 'success' : 'warning'}
          status="LIVE"
        />

        <MetricCard
          label="CHÍNH SÁCH BẢO TOÀN DỮ LIỆU"
          value="FAIL CLOSED"
          subValue="Từ chối dữ liệu giả khi mất kết nối"
          badge="ZERO MOCK"
          badgeVariant="indigo"
          icon={ShieldCheck}
          status="LIVE"
        />

        <MetricCard
          label="KIỂM TRA CHÉO NGUỒN CẤP"
          value="VPS + KBS"
          subValue="So khớp giá đóng cửa và thanh khoản"
          badge="CROSS-CHECK"
          badgeVariant="neutral"
          icon={Server}
          status="LIVE"
        />
      </div>

      {/* Providers Table */}
      <div className="bg-[#111827] border border-[#263244] rounded-xl overflow-hidden">
        <div className="p-4 bg-[#0E1522] border-b border-[#263244] flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
            Chi tiết kết nối các nguồn cấp dữ liệu ({feeds.length})
          </span>
          <span className="text-[10px] font-mono text-slate-400">Real ping verified via fetch</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#111827] border-b border-[#263244] text-[11px] font-mono text-slate-400">
                <th className="py-2.5 px-4 font-semibold">Tên luồng dữ liệu</th>
                <th className="py-2.5 px-4 font-semibold">Đơn vị cung cấp</th>
                <th className="py-2.5 px-4 font-semibold">Trạng thái</th>
                <th className="py-2.5 px-4 font-semibold">Độ trễ (Ping)</th>
                <th className="py-2.5 px-4 font-semibold">Mục đích sử dụng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263244]">
              {feeds.map((p, idx) => (
                <tr key={idx} className="hover:bg-[#182231] transition-colors font-mono">
                  <td className="py-3 px-4 text-slate-200 font-bold font-sans">
                    {p.name}
                    <span className="block text-[10px] font-mono text-slate-400 font-normal">
                      {p.endpoint}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-sans">{p.provider}</td>
                  <td className="py-3 px-4">
                    <DataStatusBadge status={p.status} compact />
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    {p.latencyMs !== null ? (
                      <span className={p.latencyMs < 300 ? 'text-emerald-400' : 'text-amber-400'}>
                        {p.latencyMs}ms
                      </span>
                    ) : (
                      <span className="text-slate-500">Đang kiểm tra...</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400 font-sans text-[11px] max-w-xs">
                    {p.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
