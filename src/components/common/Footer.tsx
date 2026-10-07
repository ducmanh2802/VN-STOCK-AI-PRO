import { SourceBadge } from './SourceBadge';
import { ShieldAlert, Terminal } from 'lucide-react';

export function Footer() {
  return (
    <footer id="app-footer" className="mt-12 border-t border-terminal-border bg-terminal-bg py-8 px-4 lg:px-8 text-terminal-text-muted text-xs">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-terminal-border">
          <div className="flex items-center gap-2 font-mono text-terminal-text-primary font-bold">
            <Terminal className="w-4 h-4 text-terminal-accent" />
            <span>VN STOCK AI PLATFORM</span>
            <span className="text-terminal-text-muted font-normal">v1.0.0 (Phase 1 Foundation)</span>
          </div>
          <SourceBadge size="sm" />
        </div>

        <div className="flex items-start gap-2.5 text-terminal-text-muted text-[11px] leading-relaxed">
          <ShieldAlert className="w-4 h-4 text-terminal-ref shrink-0 mt-0.5" />
          <p>
            <strong>CẢNH BÁO PHÁP LÝ & TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM:</strong> Giá, thanh khoản và lịch sử giao dịch hiển thị <strong>REAL DATA</strong> được lấy trực tiếp từ nguồn thị trường (VPS, KBS); các nhãn <strong>CALCULATED</strong> là giá trị tính toán từ dữ liệu thật theo công thức được ghi rõ; trường nào không có nguồn sẽ hiển thị <strong>--</strong> (không khả dụng) thay vì một con số suy đoán. Nền tảng vẫn đang được phát triển, không phải hệ thống giao dịch trực tiếp, không phải tư vấn đầu tư và không đưa ra khuyến nghị mua/bán cổ phiếu thực tế. Người dùng tự chịu hoàn toàn trách nhiệm đối với các quyết định đầu tư của mình.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] font-mono text-terminal-text-muted">
          <span>© 2025 VN STOCK AI · Nền tảng phân tích chứng khoán Việt Nam (HOSE, HNX, UPCOM)</span>
          <div className="flex items-center gap-4">
            <span>TypeScript Strict Mode</span>
            <span>TanStack Query & Zustand</span>
            <span>Design Tokens Terminal UI</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
