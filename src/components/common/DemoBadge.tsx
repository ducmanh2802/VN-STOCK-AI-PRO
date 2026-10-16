import React from 'react';

export interface DemoBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const DemoBadge: React.FC<DemoBadgeProps> = ({ size = 'sm', className = '' }) => {
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 ${sizeClasses[size]} ${className}`}
      title="Dữ liệu mô phỏng / Tính toán hệ thống"
    >
      DEMO
    </span>
  );
};
