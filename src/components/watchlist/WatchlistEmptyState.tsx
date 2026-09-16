import React from 'react';
import { Card } from '../ui/Card';
import { Bookmark, Plus, Sparkles, Building2, Cpu, Zap, TrendingUp } from 'lucide-react';

interface WatchlistEmptyStateProps {
  onAddStock: (symbol: string) => void;
  onAddMultipleStocks: (symbols: string[]) => void;
}

const STARTER_BASKETS = [
  {
    id: 'vn30',
    title: 'Top VN30 Bluechips',
    description: '10 cổ phiếu vốn hóa lớn và thanh khoản cao nhất thị trường Việt Nam',
    icon: <Sparkles className="w-4 h-4 text-amber-400" />,
    symbols: ['HPG', 'FPT', 'VCB', 'SSI', 'MWG', 'TCB', 'VNM', 'MSN', 'VHM', 'GAS'],
  },
  {
    id: 'banking',
    title: 'Ngân Hàng & Chứng Khoán',
    description: 'Các ngân hàng đầu ngành và công ty chứng khoán dẫn dắt dòng tiền',
    icon: <Building2 className="w-4 h-4 text-indigo-400" />,
    symbols: ['VCB', 'TCB', 'MBB', 'ACB', 'VPB', 'SSI', 'VND', 'VCI'],
  },
  {
    id: 'tech_growth',
    title: 'Công Nghệ & Sản Xuất Tăng Trưởng',
    description: 'Doanh nghiệp xuất khẩu, công nghệ và sản xuất cơ bản xuất sắc',
    icon: <Cpu className="w-4 h-4 text-emerald-400" />,
    symbols: ['FPT', 'HPG', 'DGC', 'NKG', 'VHC', 'GMD'],
  },
  {
    id: 'energy_retail',
    title: 'Năng Lượng & Bán Lẻ',
    description: 'Hưởng lợi từ sức cầu tiêu dùng nội địa và chu kỳ hàng hóa năng lượng',
    icon: <Zap className="w-4 h-4 text-cyan-400" />,
    symbols: ['GAS', 'PLX', 'PVD', 'MWG', 'FRT', 'PNJ'],
  },
];

export const WatchlistEmptyState: React.FC<WatchlistEmptyStateProps> = ({
  onAddStock,
  onAddMultipleStocks,
}) => {
  return (
    <Card variant="default" className="p-6 text-center space-y-6 max-w-3xl mx-auto my-6">
      {/* Icon & Message */}
      <div className="space-y-2">
        <div className="w-12 h-12 rounded-full bg-terminal-surface-subtle border border-terminal-border flex items-center justify-center mx-auto text-terminal-accent">
          <Bookmark className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-terminal-text-primary font-mono uppercase tracking-tight">
          Danh Mục Theo Dõi Đang Trống
        </h3>
        <p className="text-xs text-terminal-text-muted max-w-md mx-auto leading-relaxed">
          Bạn chưa thêm mã cổ phiếu nào vào danh mục theo dõi cá nhân. Hãy thêm nhanh các rổ cổ phiếu gợi ý dưới đây hoặc tìm kiếm mã mong muốn.
        </p>
      </div>

      {/* Starter Baskets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
        {STARTER_BASKETS.map((basket) => (
          <div
            key={basket.id}
            className="p-3.5 rounded-lg bg-terminal-surface border border-terminal-border hover:border-terminal-accent/40 transition-all space-y-2.5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-terminal-bg border border-terminal-border">
                  {basket.icon}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-terminal-text-primary font-mono">
                    {basket.title}
                  </h4>
                  <p className="text-[11px] text-terminal-text-muted">{basket.description}</p>
                </div>
              </div>

              {/* Symbol chips */}
              <div className="flex flex-wrap gap-1 pt-2">
                {basket.symbols.map((sym) => (
                  <span
                    key={sym}
                    className="px-2 py-0.5 rounded bg-terminal-bg border border-terminal-border text-[11px] font-mono text-terminal-text-secondary"
                  >
                    {sym}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => onAddMultipleStocks(basket.symbols)}
              className="w-full py-1.5 px-3 bg-terminal-surface-subtle hover:bg-terminal-accent hover:text-white border border-terminal-border text-xs font-mono font-medium rounded text-terminal-text-primary flex items-center justify-center gap-1.5 transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm {basket.symbols.length} mã này</span>
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
};
