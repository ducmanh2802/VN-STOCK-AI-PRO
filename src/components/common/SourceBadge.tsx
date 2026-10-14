import React from 'react';

/**
 * P27 §9 — DATA PROVENANCE BADGE.
 *
 * Every panel must say what kind of data it is actually showing. Calling live
 * VPS / KBS numbers "DEMO DATA" is just as false as calling a fixture "real":
 * the badge is driven by an explicit `variant` instead of being hard-coded.
 */
export type DataProvenance = 'real' | 'calculated' | 'demo' | 'unavailable';

/**
 * Derive badge provenance from `isDemo` flags (fail closed: unknown is never REAL).
 * - empty array -> 'unavailable'
 * - any flag === true -> 'demo'
 * - every flag === false -> 'real'
 * - otherwise (null / undefined present) -> 'unavailable'
 */
export function provenanceFromIsDemo(
  flags: ReadonlyArray<boolean | null | undefined>,
): DataProvenance {
  if (flags.length === 0) return 'unavailable';
  if (flags.some((f) => f === true)) return 'demo';
  if (flags.every((f) => f === false)) return 'real';
  return 'unavailable';
}

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
    classes: 'border-terminal-up/40 bg-terminal-up/10 text-terminal-up',
    dot: 'bg-terminal-up',
  },
  calculated: {
    label: 'CALCULATED',
    title: 'Giá trị tính toán từ dữ liệu thật bằng công thức được nêu rõ',
    classes: 'border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent-text',
    dot: 'bg-terminal-accent-text',
  },
  demo: {
    label: 'DEMO DATA',
    title: 'Dữ liệu mô phỏng / fixture — KHÔNG phản ánh thị trường thật',
    classes: 'border-terminal-ref/40 bg-terminal-ref/10 text-terminal-ref',
    dot: 'bg-terminal-ref',
  },
  unavailable: {
    label: 'NO DATA',
    title: 'Không có dữ liệu nguồn cho nội dung này',
    classes: 'border-terminal-text-muted/40 bg-terminal-text-muted/10 text-terminal-text-muted',
    dot: 'bg-terminal-text-muted',
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
