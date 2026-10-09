import React from 'react';

export interface CurvePoint {
  readonly label: string;
  readonly value: number;
}

export interface EquityCurveChartProps {
  readonly points: readonly CurvePoint[];
  readonly height?: number;
  readonly color?: string;
  /** Drawn as a dashed reference line (e.g. starting capital). */
  readonly baselineValue?: number | null;
  readonly formatValue?: (value: number) => string;
  readonly ariaLabel?: string;
}

const VIEW_WIDTH = 1000;

function finitePoints(points: readonly CurvePoint[]): CurvePoint[] {
  return points.filter((p) => Number.isFinite(p.value));
}

/**
 * Dependency-free SVG equity / drawdown curve.
 *
 * Deliberately not a charting library: the page must render deterministically
 * in `renderToStaticMarkup` tests (no DOM, no ResizeObserver) and must never
 * fabricate a point when the series is empty — an empty series renders an
 * explicit "no data" state instead of a flat zero line.
 */
export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({
  points,
  height = 200,
  color = '#38BDF8',
  baselineValue = null,
  formatValue = (v) => String(Math.round(v)),
  ariaLabel = 'Biểu đồ đường',
}) => {
  const clean = finitePoints(points);

  if (clean.length < 2) {
    return (
      <div className="flex items-center justify-center h-24 border border-dashed border-terminal-border rounded text-[11px] font-mono text-terminal-text-muted">
        Chưa đủ điểm dữ liệu để vẽ biểu đồ.
      </div>
    );
  }

  const values = clean.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (baselineValue !== null && Number.isFinite(baselineValue)) {
    min = Math.min(min, baselineValue);
    max = Math.max(max, baselineValue);
  }
  if (max === min) {
    max = min + 1;
  }

  const padTop = 14;
  const padBottom = 18;
  const innerHeight = Math.max(1, height - padTop - padBottom);

  const x = (i: number) => (i / (clean.length - 1)) * VIEW_WIDTH;
  const y = (v: number) => padTop + innerHeight - ((v - min) / (max - min)) * innerHeight;

  const linePath = clean.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${VIEW_WIDTH},${height - padBottom} L0,${height - padBottom} Z`;
  const baselineY =
    baselineValue !== null && Number.isFinite(baselineValue) ? y(baselineValue) : null;

  const firstLabel = clean[0].label;
  const lastLabel = clean[clean.length - 1].label;
  const lastValue = clean[clean.length - 1].value;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <path d={areaPath} fill="url(#equityFill)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />

      {baselineY !== null && (
        <line
          x1="0"
          x2={VIEW_WIDTH}
          y1={baselineY}
          y2={baselineY}
          stroke="#64748B"
          strokeWidth="1"
          strokeDasharray="6 6"
          vectorEffect="non-scaling-stroke"
        />
      )}

      <circle cx={x(clean.length - 1)} cy={y(lastValue)} r="3.5" fill={color} />

      <text x="4" y={height - 6} fontSize="13" fill="#64748B" fontFamily="monospace">
        {firstLabel}
      </text>
      <text
        x={VIEW_WIDTH - 4}
        y={height - 6}
        fontSize="13"
        fill="#94A3B8"
        fontFamily="monospace"
        textAnchor="end"
      >
        {`${lastLabel} · ${formatValue(lastValue)}`}
      </text>
      <text x="4" y={padTop - 3} fontSize="13" fill="#64748B" fontFamily="monospace">
        {formatValue(max)}
      </text>
    </svg>
  );
};
