/** Small dependency-free SVG charts used on the dashboard and reports. */
import { useId, useState } from 'react';
import { BarChart3, LineChart as LineChartIcon, AreaChart as AreaChartIcon, TrendingUp } from 'lucide-react';

import { formatCurrency, formatCurrencyCompact } from '@/utils/format';

export interface SeriesPoint {
  label: string;
  incoming: number;
  outgoing: number;
}

export type ChartType = 'bar' | 'line' | 'area' | 'net';

export interface GroupedBarChartProps {
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

// -----------------------------------------------------------------------------
// Smooth Curve Path Math Helpers
// -----------------------------------------------------------------------------

function getSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function getAreaPath(points: Array<{ x: number; y: number }>, bottomY: number): string {
  if (points.length === 0) return '';
  const line = getSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x.toFixed(1)} ${bottomY.toFixed(1)} L ${first.x.toFixed(1)} ${bottomY.toFixed(1)} Z`;
}

// -----------------------------------------------------------------------------
// Line & Area Chart
// -----------------------------------------------------------------------------

export interface LineChartProps {
  data: SeriesPoint[];
  incomingLabel?: string;
  outgoingLabel?: string;
  height?: number;
  currency?: string;
  showArea?: boolean;
}

export function LineChart({
  data,
  incomingLabel = 'Money in',
  outgoingLabel = 'Money out',
  height = 260,
  currency = 'INR',
  showArea = false,
}: LineChartProps) {
  const chartId = useId().replace(/:/g, '');
  const width = Math.max(340, data.length * 64);
  const padding = { top: 20, right: 24, bottom: 36, left: 24 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const bottomY = padding.top + plotHeight;

  if (!data.length) {
    return <p className="chart-empty">No activity in this period yet.</p>;
  }

  const max = Math.max(1, ...data.flatMap((point) => [point.incoming, point.outgoing]));

  const inPoints = data.map((point, index) => {
    const x = data.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index / (data.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - (point.incoming / max) * plotHeight;
    return { x, y, point };
  });

  const outPoints = data.map((point, index) => {
    const x = data.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index / (data.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - (point.outgoing / max) * plotHeight;
    return { x, y, point };
  });

  const inLinePath = getSmoothPath(inPoints);
  const outLinePath = getSmoothPath(outPoints);
  const inAreaPath = getAreaPath(inPoints, bottomY);
  const outAreaPath = getAreaPath(outPoints, bottomY);

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
        <svg viewBox={`0 0 ${width} ${height}`} role="img" className="chart-svg" preserveAspectRatio="xMinYMid meet">
          <defs>
            <linearGradient id={`grad-in-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`grad-out-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d97706" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + plotHeight * ratio;
            return <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid" />;
          })}

          {/* Area Fills if enabled */}
          {showArea && (
            <>
              <path d={inAreaPath} fill={`url(#grad-in-${chartId})`} />
              <path d={outAreaPath} fill={`url(#grad-out-${chartId})`} />
            </>
          )}

          {/* Outgoing Line */}
          <path
            d={outLinePath}
            fill="none"
            stroke="#d97706"
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Incoming Line */}
          <path
            d={inLinePath}
            fill="none"
            stroke="#059669"
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points and Hover Titles */}
          {inPoints.map(({ x, y, point }, index) => (
            <g key={`in-pt-${index}`}>
              <circle cx={x} cy={y} r={4.5} fill="#ffffff" stroke="#059669" strokeWidth={2.5}>
                <title>{`${point.label} ${incomingLabel}: ${formatCurrency(point.incoming, currency)}`}</title>
              </circle>
            </g>
          ))}

          {outPoints.map(({ x, y, point }, index) => (
            <g key={`out-pt-${index}`}>
              <circle cx={x} cy={y} r={4.5} fill="#ffffff" stroke="#d97706" strokeWidth={2.5}>
                <title>{`${point.label} ${outgoingLabel}: ${formatCurrency(point.outgoing, currency)}`}</title>
              </circle>
              {/* Axis Label */}
              <text x={x} y={height - 12} textAnchor="middle" className="chart-axis-label">
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}

// -----------------------------------------------------------------------------
// Net Trend Chart (Single Net Trajectory Curve)
// -----------------------------------------------------------------------------

export interface NetTrendChartProps {
  data: SeriesPoint[];
  netLabel?: string;
  height?: number;
  currency?: string;
}

export function NetTrendChart({
  data,
  netLabel = 'Net Position',
  height = 260,
  currency = 'INR',
}: NetTrendChartProps) {
  const chartId = useId().replace(/:/g, '');
  const width = Math.max(340, data.length * 64);
  const padding = { top: 20, right: 24, bottom: 36, left: 24 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const bottomY = padding.top + plotHeight;

  if (!data.length) {
    return <p className="chart-empty">No activity in this period yet.</p>;
  }

  const netValues = data.map((p) => p.incoming - p.outgoing);
  const minVal = Math.min(0, ...netValues);
  const maxVal = Math.max(0, ...netValues);
  const range = Math.max(1, maxVal - minVal);
  const zeroY = padding.top + ((maxVal - 0) / range) * plotHeight;

  const points = data.map((point, index) => {
    const net = point.incoming - point.outgoing;
    const x = data.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index / (data.length - 1)) * plotWidth;
    const y = padding.top + ((maxVal - net) / range) * plotHeight;
    return { x, y, net, point };
  });

  const linePath = getSmoothPath(points);
  const areaPath = getAreaPath(points, bottomY);

  return (
    <figure className="chart">
      <figcaption className="chart-legend">
        <span>
          <i className="legend-swatch" style={{ background: '#2563eb' }} aria-hidden="true" />
          {netLabel}
        </span>
      </figcaption>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" className="chart-svg" preserveAspectRatio="xMinYMid meet">
          <defs>
            <linearGradient id={`grad-net-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + plotHeight * ratio;
            return <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid" />;
          })}

          {/* Zero baseline */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={zeroY}
            y2={zeroY}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />

          {/* Area Fill */}
          <path d={areaPath} fill={`url(#grad-net-${chartId})`} />

          {/* Net Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map(({ x, y, net, point }, index) => {
            const isPositive = net >= 0;
            const ptColor = isPositive ? '#059669' : '#dc2626';
            return (
              <g key={`net-pt-${index}`}>
                <circle cx={x} cy={y} r={4.5} fill="#ffffff" stroke={ptColor} strokeWidth={2.5}>
                  <title>{`${point.label} ${netLabel}: ${formatCurrency(net, currency)}`}</title>
                </circle>
                <text x={x} y={height - 12} textAnchor="middle" className="chart-axis-label">
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

// -----------------------------------------------------------------------------
// Chart Type Selector & Interactive Series Chart
// -----------------------------------------------------------------------------

export interface ChartTypeToggleProps {
  value: ChartType;
  onChange: (type: ChartType) => void;
  allowedTypes?: ChartType[];
}

export function ChartTypeToggle({
  value,
  onChange,
  allowedTypes = ['bar', 'line', 'area', 'net'],
}: ChartTypeToggleProps) {
  const options: Array<{ type: ChartType; label: string; icon: typeof BarChart3 }> = [
    { type: 'bar', label: 'Bar', icon: BarChart3 },
    { type: 'line', label: 'Line', icon: LineChartIcon },
    { type: 'area', label: 'Area', icon: AreaChartIcon },
    { type: 'net', label: 'Net', icon: TrendingUp },
  ];

  return (
    <div className="chart-type-picker" role="group" aria-label="Select chart visual style">
      {options
        .filter((opt) => allowedTypes.includes(opt.type))
        .map((opt) => {
          const Icon = opt.icon;
          const isActive = value === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              className={`chart-pill ${isActive ? 'active' : ''}`}
              onClick={() => onChange(opt.type)}
              title={`Switch to ${opt.label} chart`}
            >
              <Icon size={13} />
              <span>{opt.label}</span>
            </button>
          );
        })}
    </div>
  );
}

export interface InteractiveSeriesChartProps {
  data: SeriesPoint[];
  incomingLabel?: string;
  outgoingLabel?: string;
  netLabel?: string;
  height?: number;
  currency?: string;
  defaultType?: ChartType;
  selectedType?: ChartType;
  onTypeChange?: (type: ChartType) => void;
  allowedTypes?: ChartType[];
}

export function InteractiveSeriesChart({
  data,
  incomingLabel = 'Money in',
  outgoingLabel = 'Money out',
  netLabel = 'Net Position',
  height = 260,
  currency = 'INR',
  defaultType = 'bar',
  selectedType,
  onTypeChange,
  allowedTypes = ['bar', 'line', 'area', 'net'],
}: InteractiveSeriesChartProps) {
  const [internalType, setInternalType] = useState<ChartType>(defaultType);
  const activeType = selectedType ?? internalType;

  const handleTypeChange = (type: ChartType) => {
    if (onTypeChange) onTypeChange(type);
    else setInternalType(type);
  };

  return (
    <div className="interactive-chart-container">
      <div className="chart-toolbar-row">
        <ChartTypeToggle value={activeType} onChange={handleTypeChange} allowedTypes={allowedTypes} />
      </div>

      {activeType === 'bar' && (
        <GroupedBarChart
          data={data}
          incomingLabel={incomingLabel}
          outgoingLabel={outgoingLabel}
          height={height}
          currency={currency}
        />
      )}

      {activeType === 'line' && (
        <LineChart
          data={data}
          incomingLabel={incomingLabel}
          outgoingLabel={outgoingLabel}
          height={height}
          currency={currency}
          showArea={false}
        />
      )}

      {activeType === 'area' && (
        <LineChart
          data={data}
          incomingLabel={incomingLabel}
          outgoingLabel={outgoingLabel}
          height={height}
          currency={currency}
          showArea={true}
        />
      )}

      {activeType === 'net' && (
        <NetTrendChart
          data={data}
          netLabel={netLabel}
          height={height}
          currency={currency}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sparkline (Mini Trendline for Stat Cards)
// -----------------------------------------------------------------------------

export interface SparklineProps {
  values: number[];
  tone?: 'positive' | 'negative' | 'neutral' | 'warning';
  height?: number;
  width?: number;
}

const SPARK_COLORS: Record<string, string> = {
  positive: '#059669',
  negative: '#dc2626',
  warning: '#d97706',
  neutral: '#2563eb',
};

export function Sparkline({
  values,
  tone = 'neutral',
  height = 28,
  width = 110,
}: SparklineProps) {
  const sparkId = useId().replace(/:/g, '');
  const color = SPARK_COLORS[tone] ?? SPARK_COLORS.neutral;

  if (!values || values.length < 2) {
    return (
      <svg width={width} height={height} className="sparkline-svg" aria-hidden="true">
        <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke={color} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const paddingY = 4;
  const plotH = height - paddingY * 2;

  const points = values.map((val, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = paddingY + plotH - ((val - min) / range) * plotH;
    return { x, y };
  });

  const linePath = getSmoothPath(points);
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const lastPoint = points[points.length - 1];

  return (
    <svg width={width} height={height} className="sparkline-svg" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-grad-${sparkId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-grad-${sparkId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint.x} cy={lastPoint.y} r={2.5} fill={color} />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Horizontal Bar Ranking Chart
// -----------------------------------------------------------------------------

export interface HorizontalBarItem {
  label: string;
  value: number;
  sublabel?: string;
  badge?: string;
  color?: string;
}

export interface HorizontalBarChartProps {
  items: HorizontalBarItem[];
  currency?: string;
  maxItems?: number;
  emptyText?: string;
}

export function HorizontalBarChart({
  items,
  currency = 'INR',
  maxItems = 5,
  emptyText = 'No data to display.',
}: HorizontalBarChartProps) {
  const displayItems = items.slice(0, maxItems);
  const maxValue = Math.max(1, ...displayItems.map((item) => item.value));

  if (!displayItems.length || maxValue === 0) {
    return <p className="chart-empty">{emptyText}</p>;
  }

  const defaultColors = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626'];

  return (
    <div className="hbar-chart">
      {displayItems.map((item, idx) => {
        const pct = Math.min(100, Math.max(4, (item.value / maxValue) * 100));
        const barColor = item.color ?? defaultColors[idx % defaultColors.length];
        return (
          <div key={item.label} className="hbar-item">
            <div className="hbar-row">
              <span className="hbar-label">
                <span className="strong">{item.label}</span>
                {item.sublabel ? <small className="text-muted"> · {item.sublabel}</small> : null}
              </span>
              <span className="hbar-value num strong">{formatCurrency(item.value, currency)}</span>
            </div>
            <div className="hbar-track">
              <div
                className="hbar-fill"
                style={{ width: `${pct}%`, background: barColor }}
                title={`${item.label}: ${formatCurrency(item.value, currency)}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Split Bar & Donut Chart (Existing Preserved Implementations)
// -----------------------------------------------------------------------------

export interface SplitBarProps {
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

export interface DonutProps {
  slices: Array<{ label: string; value: number }>;
  size?: number;
  currency?: string;
}

export const DONUT_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626'];

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

// -----------------------------------------------------------------------------
// Radial Progress Meter (Circular Gauge)
// -----------------------------------------------------------------------------

export interface RadialProgressProps {
  value: number;
  max: number;
  label?: string;
  sublabel?: string;
  size?: number;
  strokeWidth?: number;
  tone?: 'positive' | 'negative' | 'warning' | 'neutral';
  centerText?: string;
}

export function RadialProgress({
  value,
  max,
  label,
  sublabel,
  size = 110,
  strokeWidth = 10,
  tone = 'positive',
  centerText,
}: RadialProgressProps) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const toneColors: Record<string, string> = {
    positive: '#059669',
    negative: '#dc2626',
    warning: '#d97706',
    neutral: '#2563eb',
  };
  const color = toneColors[tone] ?? toneColors.positive;

  return (
    <div className="radial-progress-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radial-progress-svg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="radial-progress-text"
          fill="currentColor"
        >
          {centerText ?? `${Math.round(pct)}%`}
        </text>
      </svg>
      {(label || sublabel) && (
        <div className="radial-progress-info">
          {label && <span className="radial-progress-label strong">{label}</span>}
          {sublabel && <small className="radial-progress-sublabel text-muted">{sublabel}</small>}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Working Capital & Comparative Gauge (AR vs AP vs Cash)
// -----------------------------------------------------------------------------

export interface ComparisonBarProps {
  receivables: number;
  payables: number;
  currency?: string;
}

export function ComparisonBar({ receivables, payables, currency = 'INR' }: ComparisonBarProps) {
  const max = Math.max(1, receivables, payables);
  const arPct = Math.min(100, Math.max(4, (receivables / max) * 100));
  const apPct = Math.min(100, Math.max(4, (payables / max) * 100));
  const net = receivables - payables;

  return (
    <div className="comparison-bar-card">
      <div className="comparison-row">
        <div className="comparison-col">
          <div className="row-between small">
            <span className="text-muted">Receivables (What customers owe)</span>
            <span className="num strong" style={{ color: '#059669' }}>{formatCurrency(receivables, currency)}</span>
          </div>
          <div className="hbar-track" style={{ height: 9, marginTop: 4 }}>
            <div className="hbar-fill" style={{ width: `${arPct}%`, background: '#059669' }} />
          </div>
        </div>
      </div>

      <div className="comparison-row" style={{ marginTop: 10 }}>
        <div className="comparison-col">
          <div className="row-between small">
            <span className="text-muted">Payables (What you owe vendors)</span>
            <span className="num strong" style={{ color: '#d97706' }}>{formatCurrency(payables, currency)}</span>
          </div>
          <div className="hbar-track" style={{ height: 9, marginTop: 4 }}>
            <div className="hbar-fill" style={{ width: `${apPct}%`, background: '#d97706' }} />
          </div>
        </div>
      </div>

      <div className="comparison-footer row-between">
        <span className="small text-muted">Net Working Capital (AR - AP):</span>
        <span className={`num strong small ${net >= 0 ? 'text-success' : 'text-danger'}`}>
          {net >= 0 ? `+${formatCurrency(net, currency)} (Surplus)` : `-${formatCurrency(Math.abs(net), currency)} (Deficit)`}
        </span>
      </div>
    </div>
  );
}
