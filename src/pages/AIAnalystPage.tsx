import { AIMarketSummary } from '../types/market';
import { AIMarketSummaryCard } from '../components/dashboard/AIMarketSummaryCard';
import { DemoBadge } from '../components/common/DemoBadge';
import { Sparkles, Brain, ShieldAlert, Cpu } from 'lucide-react';

interface AIAnalystPageProps {
  aiSummary: AIMarketSummary;
}

export function AIAnalystPage({ aiSummary }: AIAnalystPageProps) {
  return (
    <div id="page-ai-analyst" className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white font-mono uppercase tracking-tight">
              Trung Tâm Phân Tích Trí Tuệ Nhân Tạo (AI Analyst)
            </h1>
            <DemoBadge size="sm" />
          </div>
          <p className="text-xs text-slate-400">
            Hệ thống phân tích thị trường và cổ phiếu tự động dựa trên mô hình dữ liệu tài chính
          </p>
        </div>
      </div>

      {/* Phase 1 Live AI Market Summary Card */}
      <AIMarketSummaryCard summary={aiSummary} />

      {/* Preview of Upcoming Phase 7 AI Stock Deep Analyst Framework */}
      <div className="p-5 rounded-lg bg-[#111622] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-800 text-blue-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono text-slate-100 uppercase">
                Khung Phân Tích Cổ Phiếu Chuyên Sâu (AI Stock Analyst Framework)
              </h3>
              <p className="text-xs text-slate-400">
                Lộ trình triển khai Phase 7 - Báo cáo phân tích từng mã độc lập
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-blue-600/15 text-blue-300 border border-blue-500/30 text-xs font-mono font-semibold">
            Roadmap Phase 7
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800">
            <div className="text-emerald-400 font-bold mb-1">1. THESIS & BULL CASE</div>
            <p className="text-slate-400 text-[11px] font-sans">
              Luận điểm đầu tư chính, động lực mở rộng quy mô, năng lực cạnh tranh hào kinh tế (Moat) và kịch bản tăng trưởng vượt trội.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800">
            <div className="text-amber-400 font-bold mb-1">2. BASE CASE & CATALYSTS</div>
            <p className="text-slate-400 text-[11px] font-sans">
              Kịch bản cơ sở theo kế hoạch kinh doanh doanh nghiệp, các yếu tố kích hoạt giá (Catalysts: hệ thống KRX, nhà máy mới, chu kỳ ngành).
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800">
            <div className="text-rose-400 font-bold mb-1">3. BEAR CASE & RISKS</div>
            <p className="text-slate-400 text-[11px] font-sans">
              Kịch bản tiêu cực khi vĩ mô bất lợi, áp lực nợ vay, rủi ro biến động nguyên vật liệu đầu vào và vi phạm ngưỡng kỹ thuật.
            </p>
          </div>
        </div>

        {/* AI Transparency & Strict Ethics Notice */}
        <div className="p-3.5 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="flex items-center gap-2 text-slate-300 font-bold font-mono">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Quy Tắc Đạo Đức Dữ Liệu AI (AI Data Strict Rules)</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400 font-sans">
            <li>Hệ thống <strong>không bao giờ bịa đặt số liệu tài chính</strong> (Doanh thu, Lợi nhuận, EPS, Giá mục tiêu).</li>
            <li>Phân định rõ ràng: <span className="text-slate-200">REAL DATA</span> (Dữ liệu thật), <span className="text-amber-300">DEMO DATA</span> (Dữ liệu mô phỏng), <span className="text-blue-300">CALCULATED DATA</span> (Công thức toán học) và <span className="text-blue-400">AI INTERPRETATION</span> (Giải thích định tính).</li>
            <li>Các mô hình DCF và định giá tương lai sẽ được tính toán bằng <strong>TypeScript deterministic calculations</strong>, AI chỉ đóng vai trò phân tích và diễn giải ngữ cảnh.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
