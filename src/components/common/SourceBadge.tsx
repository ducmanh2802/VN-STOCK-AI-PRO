import React from 'react';

/**
 * P27 §9 — DATA PROVENANCE BADGE.
 *
 * Every panel must say what kind of data it is actually showing. Calling live
 * VPS / KBS numbers "DEMO DATA" is just as false as calling a fixture "real":
 * the badge is driven by an explicit `variant` instead of being hard-coded.
 */
export type DataProvenance = 'real' | 'calculated' | 'demo' | 'unavailable';

export interface SourceBadgeProps {
  /** Defaults to `real` — most panels in this app are backed by live providers. */
  variant?: DataProvenance;
  size?: 'sm' | 'md';
  className?: string;
}

const STYLES: Record<DataProvenance, { label: string; title: string; classes: string; dot: string }> = {
  real: {
    label: 'REAL DATA',
    title: 'Dữ liệu thật từ nguồn thị trường (VPS / KBS) — không phải dữ liệu mô phỏng',
    classes: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    dot: 'bg-emerald-400',
  },
  calculated: {
    label: 'CALCULATED',
    title: 'Giá trị tính toán từ dữ liệu thật bằng công thức được nêu rõ',
    classes: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
    dot: 'bg-sky-400',
  },
  demo: {
    label: 'DEMO DATA',
    title: 'Dữ liệu mô phỏng / fixture — KHÔNG phản ánh thị trường thật',
    classes: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    dot: 'bg-amber-400',
  },
  unavailable: {
    label: 'NO DATA',
    title: 'Không có dữ liệu nguồn cho nội dung này',
    classes: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400',
    dot: 'bg-zinc-400',
  },
};

export function SourceBadge({ variant = 'real', size = 'sm', className = '' }: SourceBadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  const style = STYLES[variant];

  return (
    <span
      data-provenance={variant}
      title={style.title}
      className={`inline-flex items-center gap-1 font-mono font-semibold tracking-wider rounded border select-none ${style.classes} ${sizeClasses} ${className}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />
      {style.label}
    </span>
  );
}
