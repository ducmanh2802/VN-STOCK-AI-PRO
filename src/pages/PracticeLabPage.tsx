import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Terminal, Play, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const PracticeLabPage: React.FC = () => {
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between pb-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentView('learn')}
            className="text-xs font-mono text-terminal-text-muted hover:text-terminal-text mr-2"
          >
            ← Học tập
          </button>
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h1 className="page-title">Practice Lab & Interactive Simulations</h1>
            <p className="text-xs text-terminal-text-muted">
              Môi trường giả lập tương tác thực hành phân tích kỹ thuật và quản trị rủi ro
            </p>
          </div>
        </div>
      </div>

      <div className="bg-terminal-surface border border-terminal-border rounded p-6 space-y-4">
        <h2 className="section-eyebrow">Lab 01: Nhận diện mẫu hình nến & Điểm Breakout</h2>
        <p className="text-xs text-terminal-text-muted">
          Thực hành xác định điểm hỗ trợ / kháng cự và tính toán tỷ lệ Lời/Lỗ (Risk/Reward) trước khi vào lệnh.
        </p>
        <div className="pt-2">
          <Button variant="primary" size="sm" onClick={() => setCurrentView('paper-trading')}>
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Mở Paper Trading Sandbox
          </Button>
        </div>

      </div>
    </div>
  );
};
