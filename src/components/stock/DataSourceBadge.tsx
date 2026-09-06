import React from 'react';

export interface DataSourceStatus {
  /** Provider id, e.g. 'KBS' or 'VPS'. */
  source: string;
  /** true = real data loaded; false = source failed / data unavailable. */
  ok: boolean;
  /** Optional short reason shown on hover when not ok. */
  detail?: string;
}

export interface DataSourceBadgeProps {
  historical?: DataSourceStatus | null;
  realtime?: DataSourceStatus | null;
  fundamentals?: DataSourceStatus | null;
  /** Extra statuses for future sources. */
  extra?: DataSourceStatus[];
}

const Pill: React.FC<{ label: string; status: DataSourceStatus }> = ({ label, status }) => (
  <span
    className="inline-flex items-center gap-1"
    title={
      status.ok
        ? `${label}: dữ liệu thật từ ${status.source}`
        : `${label}: KHÔNG khả dụng (${status.source})${status.detail ? ` — ${status.detail}` : ''}`
    }
  >
    <span className="text-terminal-text-muted">
      {label}
      <span className="text-terminal-text-muted/70">:{status.source}</span>
    </span>
    <span className={status.ok ? 'text-emerald-400' : 'text-red-400'} aria-hidden="true">
      {status.ok ? '✓' : '✕'}
    </span>
  </span>
);

/**
 * PHASE 8.5C STEP 13 — small, unobtrusive data-source indicator.
 * Lets the user distinguish REAL data (✓) from unavailable data (✕).
 * Never displays synthetic data as real: unavailable sources show ✕.
 */
export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({
  historical,
  realtime,
  fundamentals,
  extra = [],
}) => {
  const statuses = [
    historical ? { label: 'Lịch sử', status: historical } : null,
    realtime ? { label: 'Realtime', status: realtime } : null,
    fundamentals ? { label: 'BCTC', status: fundamentals } : null,
    ...extra.map((s) => ({ label: s.source, status: s })),
  ].filter(Boolean) as { label: string; status: DataSourceStatus }[];

  if (statuses.length === 0) return null;

  return (
    <div
      id="data-source-badge"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 rounded-lg bg-terminal-surface/60 border border-terminal-border/60 text-[10px] font-mono text-terminal-text-secondary"
    >
      <span className="uppercase tracking-wider text-terminal-text-muted/80">Nguồn dữ liệu thật</span>
      {statuses.map(({ label, status }) => (
        <Pill key={label} label={label} status={status} />
      ))}
    </div>
  );
};