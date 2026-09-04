import { DemoBadge } from '../components/common/DemoBadge';
import { LineChart, PieChart, Calculator, Scale, ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { ActiveNavView } from '../components/common/Sidebar';

interface PhasePlaceholderPageProps {
  view: ActiveNavView;
  onBackToDashboard: () => void;
}

interface PhaseConfig {
  phaseNumber: number;
  title: string;
  icon: typeof LineChart;
  description: string;
  features: string[];
}

const PHASE_CONFIGS: Partial<Record<ActiveNavView, PhaseConfig>> = {
  technical: {
    phaseNumber: 3,
    title: 'Phân Tích Kỹ Thuật (Technical Analysis)',
    icon: LineChart,
    description: 'Hệ thống biểu đồ nến chuyên sâu và bộ chỉ báo động lượng, xu hướng thị trường.',
    features: [
      'Biểu đồ nến tương tác đa khung thời gian: 1D, 1W, 1M, 3M, 6M, 1Y, 3Y, 5Y',
      'Đường trung bình động: MA20, MA50, MA100, MA200, EMA20',
      'Chỉ báo dao động: RSI, MACD Histogram, Bollinger Bands, ADX, ATR',
      'Tự động nhận diện cấu trúc sóng, vùng Hỗ trợ (Support Zone) & Kháng cự (Resistance Zone)',
      'Phân loại trạng thái tự động: Trend (UP/DOWN/SIDEWAY), Momentum (STRONG/NEUTRAL/WEAK), Volume (HIGH/NORMAL/LOW)',
    ],
  },
  fundamentals: {
    phaseNumber: 4,
    title: 'Báo Cáo Tài Chính & Chất Lượng (Fundamentals)',
    icon: PieChart,
    description: 'Dữ liệu BCTC 5 năm liên tiếp và hệ số chất lượng tài chính Financial Quality Score (0-100).',
    features: [
      'Báo cáo Kết quả Kinh doanh (Income Statement) tối thiểu 5 năm',
      'Bảng Cân đối Kế toán (Balance Sheet) & Báo cáo Lưu chuyển Tiền tệ (Cash Flow Statement)',
      'Đồ thị tăng trưởng: Doanh thu, Lợi nhuận ròng, EPS, Dòng tiền tự do FCF',
      'Financial Quality Score: Chấm điểm Tăng trưởng (Growth), Khả năng sinh lời (Profitability), Hiệu quả sử dụng vốn (Capital Efficiency)',
      'Chỉ số sinh lời & đòn bẩy: ROE, ROA, Gross Margin, Net Margin, Debt/Equity, Current Ratio',
    ],
  },
  valuation: {
    phaseNumber: 5,
    title: 'Mô Hình Định Giá & DCF (Valuation)',
    icon: Calculator,
    description: 'Định giá cổ phiếu đa phương pháp với thuật toán tính toán tất định (Deterministic Calculation).',
    features: [
      'Định giá so sánh: P/E, P/B, EV/EBITDA',
      'Mô hình chiết khấu dòng tiền DCF tự động tính FCFF, Terminal Value, Enterprise Value, Equity Value',
      'Không để AI tự bịa số liệu DCF: Thuật toán tính toán bằng TypeScript deterministic calculations',
      'Bảng độ nhạy (Sensitivity Table): Ma trận WACC (8% - 12%) và Tỷ lệ tăng trưởng dài hạn Terminal Growth (2% - 4%)',
      'Biên an toàn (Margin of Safety) và Upside/Downside so với thị giá hiện tại',
    ],
  },
  compare: {
    phaseNumber: 8,
    title: 'So Sánh Cổ Phiếu Cùng Ngành (Peers Comparison)',
    icon: Scale,
    description: 'Công cụ so sánh đa mã cổ phiếu đối trọng trong cùng phân khúc ngành.',
    features: [
      'Cho phép chọn so sánh tối đa 4 mã cổ phiếu (Ví dụ: HPG vs HSG vs NKG)',
      'Bảng ma trận so sánh: P/E, P/B, EV/EBITDA, ROE, ROA, Net Margin, Biên lợi nhuận',
      'So sánh tốc độ tăng trưởng doanh thu, tăng trưởng lợi nhuận và đòn bẩy tài chính',
      'Chấm điểm đối đầu tương đối (Relative AI Stock Score)',
    ],
  },
};

export function PhasePlaceholderPage({ view, onBackToDashboard }: PhasePlaceholderPageProps) {
  const config = PHASE_CONFIGS[view] || {
    phaseNumber: 2,
    title: 'Chức Năng Đang Phát Triển',
    icon: LineChart,
    description: 'Mô-đun đang nằm trong kế hoạch triển khai các Phase tiếp theo.',
    features: [],
  };

  const Icon = config.icon;

  return (
    <div id="page-phase-roadmap" className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Back Button */}
      <button
        onClick={onBackToDashboard}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111622] border border-slate-800 text-xs text-slate-300 hover:text-white hover:border-slate-700 transition-colors font-mono"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại Dashboard Phase 1
      </button>

      {/* Main Card */}
      <div className="p-6 sm:p-8 rounded-lg bg-[#111622] border border-slate-800 space-y-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-blue-600/15 border border-blue-500/25 flex items-center justify-center text-blue-400">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-mono text-white tracking-tight">
                  {config.title}
                </h1>
                <DemoBadge size="sm" />
              </div>
              <p className="text-xs text-slate-400 mt-1">{config.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg bg-blue-600/15 text-blue-300 border border-blue-500/30 text-xs font-mono font-semibold">
              Kế Hoạch Phase {config.phaseNumber}
            </span>
          </div>
        </div>

        {/* Phase Roadmap Status Banner */}
        <div className="p-4 rounded-lg bg-[#0B0E14] border border-slate-800 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-bold text-white font-mono uppercase">
              Tuân thủ quy tắc triển khai theo từng Phase:
            </p>
            <p className="text-slate-400 leading-relaxed font-sans">
              Hiện tại hệ thống <strong>CHỈ thực hiện PHASE 1</strong> (Dashboard, Market Overview, Heatmap ngành, Top movers, Watchlist và kiến trúc dữ liệu MarketDataProvider tách biệt). Các chức năng chuyên sâu ở Phase {config.phaseNumber} đã được thiết kế sẵn cấu trúc loại dữ liệu và sẽ được hiện thực hóa ở các Phase tiếp theo.
            </p>
          </div>
        </div>

        {/* Planned Feature Set */}
        <div>
          <h3 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider mb-3">
            Danh Sách Tính Năng Quy Hoạch Trong Phase {config.phaseNumber}:
          </h3>
          <div className="space-y-2.5">
            {config.features.map((feat, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-lg bg-[#0B0E14] border border-slate-800/80 text-xs text-slate-300"
              >
                <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span className="font-sans leading-relaxed">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-500">
            VN STOCK AI · Thiết kế theo chuẩn Financial Terminal
          </span>
          <button
            onClick={onBackToDashboard}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-mono font-semibold transition-colors shadow-xs"
          >
            Trải nghiệm Dashboard Phase 1
          </button>
        </div>
      </div>
    </div>
  );
}
