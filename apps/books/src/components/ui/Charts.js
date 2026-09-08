import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Small dependency-free SVG charts used on the dashboard and reports. */
import { useId } from 'react';
import { formatCurrencyCompact } from '@/utils/format';
export function GroupedBarChart({ data, incomingLabel = 'Money in', outgoingLabel = 'Money out', height = 260, currency = 'INR', }) {
    const titleId = useId();
    const width = Math.max(320, data.length * 64);
    const padding = { top: 16, right: 8, bottom: 34, left: 8 };
    const plotHeight = height - padding.top - padding.bottom;
    const max = Math.max(1, ...data.flatMap((point) => [point.incoming, point.outgoing]));
    const groupWidth = width / Math.max(1, data.length);
    const barWidth = Math.min(18, groupWidth / 3);
    if (!data.length) {
        return _jsx("p", { className: "chart-empty", children: "No activity in this period yet." });
    }
    return (_jsxs("figure", { className: "chart", children: [_jsxs("figcaption", { className: "chart-legend", children: [_jsxs("span", { children: [_jsx("i", { className: "legend-swatch swatch-in", "aria-hidden": "true" }), incomingLabel] }), _jsxs("span", { children: [_jsx("i", { className: "legend-swatch swatch-out", "aria-hidden": "true" }), outgoingLabel] })] }), _jsx("div", { className: "chart-scroll", children: _jsxs("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-labelledby": titleId, className: "chart-svg", preserveAspectRatio: "xMinYMid meet", children: [_jsxs("title", { id: titleId, children: [incomingLabel, " versus ", outgoingLabel, " by period"] }), [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                            const y = padding.top + plotHeight * ratio;
                            return _jsx("line", { x1: padding.left, x2: width - padding.right, y1: y, y2: y, className: "chart-grid" }, ratio);
                        }), data.map((point, index) => {
                            const centre = index * groupWidth + groupWidth / 2;
                            const inHeight = (point.incoming / max) * plotHeight;
                            const outHeight = (point.outgoing / max) * plotHeight;
                            return (_jsxs("g", { children: [_jsx("rect", { x: centre - barWidth - 2, y: padding.top + plotHeight - inHeight, width: barWidth, height: Math.max(inHeight, 1), className: "bar-in", rx: 2, children: _jsx("title", { children: `${point.label} ${incomingLabel}: ${formatCurrencyCompact(point.incoming, currency)}` }) }), _jsx("rect", { x: centre + 2, y: padding.top + plotHeight - outHeight, width: barWidth, height: Math.max(outHeight, 1), className: "bar-out", rx: 2, children: _jsx("title", { children: `${point.label} ${outgoingLabel}: ${formatCurrencyCompact(point.outgoing, currency)}` }) }), _jsx("text", { x: centre, y: height - 12, textAnchor: "middle", className: "chart-axis-label", children: point.label })] }, `${point.label}-${index}`));
                        })] }) })] }));
}
export function SplitBar({ segments, total }) {
    const safeTotal = total > 0 ? total : 1;
    return (_jsx("div", { className: "split-bar", role: "img", "aria-label": segments.map((segment) => `${segment.label}: ${segment.value}`).join(', '), children: segments.map((segment) => (_jsx("span", { className: `split-segment segment-${segment.tone}`, style: { width: `${Math.max(0, (segment.value / safeTotal) * 100)}%` }, title: `${segment.label}: ${formatCurrencyCompact(segment.value)}` }, segment.label))) }));
}
const DONUT_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626'];
export function DonutChart({ slices, size = 160, currency = 'INR' }) {
    const titleId = useId();
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    if (total <= 0)
        return _jsx("p", { className: "chart-empty", children: "Nothing to chart yet." });
    const radius = size / 2;
    const strokeWidth = size * 0.22;
    const innerRadius = radius - strokeWidth / 2;
    const circumference = 2 * Math.PI * innerRadius;
    let offset = 0;
    return (_jsxs("figure", { className: "donut", children: [_jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: "img", "aria-labelledby": titleId, children: [_jsx("title", { id: titleId, children: "Distribution chart" }), _jsx("g", { transform: `rotate(-90 ${radius} ${radius})`, children: slices.map((slice, index) => {
                            const fraction = slice.value / total;
                            const dash = fraction * circumference;
                            const element = (_jsx("circle", { cx: radius, cy: radius, r: innerRadius, fill: "none", stroke: DONUT_COLORS[index % DONUT_COLORS.length], strokeWidth: strokeWidth, strokeDasharray: `${dash} ${circumference - dash}`, strokeDashoffset: -offset, children: _jsx("title", { children: `${slice.label}: ${formatCurrencyCompact(slice.value, currency)}` }) }, slice.label));
                            offset += dash;
                            return element;
                        }) })] }), _jsx("ul", { className: "donut-legend", children: slices.map((slice, index) => (_jsxs("li", { children: [_jsx("i", { className: "legend-swatch", style: { background: DONUT_COLORS[index % DONUT_COLORS.length] }, "aria-hidden": "true" }), _jsx("span", { className: "donut-label", children: slice.label }), _jsx("span", { className: "donut-value", children: formatCurrencyCompact(slice.value, currency) })] }, slice.label))) })] }));
}
