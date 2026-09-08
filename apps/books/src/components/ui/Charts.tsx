/** Small dependency-free SVG charts used on the dashboard and reports. */
import { useId } from 'react';

import { formatCurrencyCompact } from '@/utils/format';

export interface SeriesPoint {
  label: string;
  incoming: number;
  outgoing: number;
}

interface GroupedBarChartProps {
  data: SeriesPoint[];
  incomingLabel?: string;
  outgoingLabel?: string;
  height?: number;
  currency?: string;
}

export function GroupedBarChart({
  data,
  incomingLabel = 'Money in',
  outgoingLabel = 'Money out',
  height = 260,
  currency = 'INR',
}: GroupedBarChartProps) {
  const titleId = useId();
  const width = Math.max(320, data.length * 64);
  const padding = { top: 16, right: 8, bottom: 34, left: 8 };
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.flatMap((point) => [point.incoming, point.outgoing]));
  const groupWidth = width / Math.max(1, data.length);
  const barWidth = Math.min(18, groupWidth / 3);

  if (!data.length) {
    return <p className="chart-empty">No activity in this period yet.</p>;
  }

  return (
    <figure className="chart">
      <figcaption className="chart-legend">
        <span>
          <i className="legend-swatch swatch-in" aria-hidden="true" />
          {incomingLabel}
        </span>
        <span>
          <i className="legend-swatch swatch-out" aria-hidden="true" />
          {outgoingLabel}
        </span>
      </figcaption>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId} className="chart-svg" preserveAspectRatio="xMinYMid meet">
          <title id={titleId}>
            {incomingLabel} versus {outgoingLabel} by period
          </title>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + plotHeight * ratio;
            return <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid" />;
          })}
          {data.map((point, index) => {
            const centre = index * groupWidth + groupWidth / 2;
            const inHeight = (point.incoming / max) * plotHeight;
            const outHeight = (point.outgoing / max) * plotHeight;
            return (
              <g key={`${point.label}-${index}`}>
                <rect
                  x={centre - barWidth - 2}
                  y={padding.top + plotHeight - inHeight}
                  width={barWidth}
                  height={Math.max(inHeight, 1)}
                  className="bar-in"
                  rx={2}
                >
                  <title>{`${point.label} ${incomingLabel}: ${formatCurrencyCompact(point.incoming, currency)}`}</title>
                </rect>
                <rect
                  x={centre + 2}
                  y={padding.top + plotHeight - outHeight}
                  width={barWidth}
                  height={Math.max(outHeight, 1)}
                  className="bar-out"
                  rx={2}
                >
                  <title>{`${point.label} ${outgoingLabel}: ${formatCurrencyCompact(point.outgoing, currency)}`}</title>
                </rect>
                <text x={centre} y={height - 12} textAnchor="middle" className="chart-axis-label">
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

interface SplitBarProps {
  segments: Array<{ label: string; value: number; tone: 'current' | 'overdue' | 'neutral' }>;
  total: number;
}

export function SplitBar({ segments, total }: SplitBarProps) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <div className="split-bar" role="img" aria-label={segments.map((segment) => `${segment.label}: ${segment.value}`).join(', ')}>
      {segments.map((segment) => (
        <span
          key={segment.label}
          className={`split-segment segment-${segment.tone}`}
          style={{ width: `${Math.max(0, (segment.value / safeTotal) * 100)}%` }}
          title={`${segment.label}: ${formatCurrencyCompact(segment.value)}`}
        />
      ))}
    </div>
  );
}

interface DonutProps {
  slices: Array<{ label: string; value: number }>;
  size?: number;
  currency?: string;
}

const DONUT_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626'];

export function DonutChart({ slices, size = 160, currency = 'INR' }: DonutProps) {
  const titleId = useId();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return <p className="chart-empty">Nothing to chart yet.</p>;
  const radius = size / 2;
  const strokeWidth = size * 0.22;
  const innerRadius = radius - strokeWidth / 2;
  const circumference = 2 * Math.PI * innerRadius;
  let offset = 0;

  return (
    <figure className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>Distribution chart</title>
        <g transform={`rotate(-90 ${radius} ${radius})`}>
          {slices.map((slice, index) => {
            const fraction = slice.value / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={slice.label}
                cx={radius}
                cy={radius}
                r={innerRadius}
                fill="none"
                stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              >
                <title>{`${slice.label}: ${formatCurrencyCompact(slice.value, currency)}`}</title>
              </circle>
            );
            offset += dash;
            return element;
          })}
        </g>
      </svg>
      <ul className="donut-legend">
        {slices.map((slice, index) => (
          <li key={slice.label}>
            <i className="legend-swatch" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} aria-hidden="true" />
            <span className="donut-label">{slice.label}</span>
            <span className="donut-value">{formatCurrencyCompact(slice.value, currency)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
