interface DemoBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function DemoBadge({ size = 'sm', className = '' }: DemoBadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      id="badge-demo-data"
      title="Dữ liệu mô phỏng trong giai đoạn thử nghiệm (DEMO DATA)"
      className={`inline-flex items-center gap-1 font-mono font-semibold tracking-wider rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 select-none ${sizeClasses} ${className}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      DEMO DATA
    </span>
  );
}
