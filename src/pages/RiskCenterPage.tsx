import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Percent, Sliders } from 'lucide-react';
import { MetricCard } from '../components/ui/MetricCard';
import { DemoBadge } from '../components/common/DemoBadge';

export const RiskCenterPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Trung Tâm Quản Trị Rủi Ro (RiskCenter)</h1>
              <DemoBadge size="sm" />
            </div>
            <p className="text-xs text-terminal-text-muted">
              Kiểm soát quy mô vị thế, giới hạn sụt giảm Max Drawdown & quy tắc Fail-Closed
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Risk Guard Status"
          value="ENFORCED"
          subValue="Tất cả 12 quy tắc an toàn đang bật"
          status="LIVE"
          badge="SAFE"
          badgeVariant="success"
        />
        <MetricCard
          label="Max Risk / Trade"
          value="1.50%"
          subValue="Tối đa 1.5% tổng NAV mỗi vị thế"
        />
        <MetricCard
          label="Max Drawdown Cap"
          value="10.00%"
          subValue="Tự động khóa giao dịch nếu chạm ngưỡng"
        />
        <MetricCard
          label="Fail-Closed Guard"
          value="ACTIVE"
          subValue="Dữ liệu cũ/lỗi sẽ dừng tạo lệnh"
          status="LIVE"
          badge="GUARD"
          badgeVariant="indigo"
        />
      </div>


      <div className="bg-terminal-surface border border-terminal-border rounded p-5 space-y-4">
        <h2 className="section-eyebrow">Quy tắc cốt lõi của RiskGuard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-terminal-bg border border-terminal-border rounded p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Vietnamese Board Lot Sizing</span>
            </div>
            <p className="text-terminal-text-muted">
              Mọi khối lượng lệnh cổ phiếu cơ sở bắt buộc làm tròn xuống bội số của 100 cổ phiếu (lô chẵn HOSE/HNX).
            </p>
          </div>

          <div className="bg-terminal-bg border border-terminal-border rounded p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Price Band Protection</span>
            </div>
            <p className="text-terminal-text-muted">
              Lệnh mua/bán không được vượt ra ngoài biên độ Trần/Sàn (±7% HOSE, ±10% HNX, ±15% UPCOM).
            </p>
          </div>

          <div className="bg-terminal-bg border border-terminal-border rounded p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Fail-Closed Freshness Guard</span>
            </div>
            <p className="text-terminal-text-muted">
              Khi dữ liệu thị trường có trạng thái STALE hoặc UNAVAILABLE, hệ thống lập tức khóa tín hiệu mua mới.
            </p>
          </div>

          <div className="bg-terminal-bg border border-terminal-border rounded p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Anti-Lookahead Bias Protection</span>
            </div>
            <p className="text-terminal-text-muted">
              Thời gian xuất bản dữ liệu hoặc sự kiện tương lai không bao giờ được phép tham gia định giá quá khứ.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
