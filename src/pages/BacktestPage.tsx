import React from 'react';

export const BacktestPage: React.FC = () => {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold font-mono text-terminal-text-primary">Kiểm Thử Lịch Sử (Backtest Runner)</h1>
      <p className="text-sm text-terminal-text-muted">Mô phỏng hiệu suất chiến lược trên dữ liệu OHLCV lịch sử từ KBS với chi phí và trượt giá thực tế.</p>
    </div>
  );
};
