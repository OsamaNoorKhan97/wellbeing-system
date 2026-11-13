import { useEffect, useRef, useState, type ReactNode } from 'react';

export const chartColors = { teal: '#0f766e', blue: '#0284c7', amber: '#d97706', violet: '#7c3aed', rose: '#e11d48', slate: '#94a3b8', green: '#16a34a' };

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
}

interface ChartProps {
  labels: string[];
  series: Series[];
  height?: number;
  /** Fixed top of the scale, for example 5 for ratings. Defaults to the largest value. */
  max?: number;
  min?: number;
  formatValue?: (value: number) => string;
  /** Text alternative for screen readers. */
  summary: string;
}

const MARGIN = { top: 12, right: 12, bottom: 26, left: 34 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * magnitude) return step * magnitude;
  return value;
}

function Legend({ series }: { series: { name: string; color: string }[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: { name: string; color: string; value: string }[] }) {
  const alignRight = x > width / 2;
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={alignRight ? { right: width - x + 10 } : { left: x + 10 }}
    >
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((row) => (
        <p key={row.name} className="flex items-center justify-between gap-3 text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: row.color }} aria-hidden />
            {row.name}
          </span>
          <span className="font-medium text-ink tabular-nums">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

function useCartesian({ labels, series, height = 220, max, min = 0, stacked = false }: ChartProps & { stacked?: boolean }) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const dataMax = Math.max(0, ...(stacked ? totals : series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const top = max ?? niceMax(dataMax);
  const y = (value: number) => MARGIN.top + innerHeight - ((value - min) / (top - min || 1)) * innerHeight;
  // Prefer a number of intervals that lands on whole numbers (0-5 in steps of 1, 0-10 in steps of 2, ...).
  const range = top - min;
  const intervals = range % 4 === 0 ? 4 : range % 5 === 0 ? 5 : 4;
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => min + (range * i) / intervals);
  const labelEvery = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(innerWidth / 56))));
  return { ref, width, hover, setHover, innerWidth, innerHeight, y, ticks, labelEvery, height };
}

function Axes({ ticks, y, width, formatValue }: { ticks: number[]; y: (v: number) => number; width: number; formatValue: (v: number) => string }) {
  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray={tick === ticks[0] ? undefined : '3 3'} />
          <text x={MARGIN.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="10" fill="#64748b">
            {formatValue(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

const defaultFormat = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export function LineChart(props: ChartProps) {
  const { labels, series, formatValue = defaultFormat, summary } = props;
  const chart = useCartesian(props);
  const step = labels.length > 1 ? chart.innerWidth / (labels.length - 1) : 0;
  const x = (index: number) => MARGIN.left + (labels.length > 1 ? index * step : chart.innerWidth / 2);

  // Gaps (null values, e.g. averages withheld for privacy) break the line instead of being drawn as zero.
  const pathFor = (values: (number | null)[]) => {
    let path = '';
    let penDown = false;
    values.forEach((value, index) => {
      if (value === null) {
        penDown = false;
        return;
      }
      path += `${penDown ? 'L' : 'M'}${x(index).toFixed(1)},${chart.y(value).toFixed(1)}`;
      penDown = true;
    });
    return path;
  };

  return (
    <div>
      <Legend series={series} />
      <div ref={chart.ref} className="relative" onMouseLeave={() => chart.setHover(null)}>
        {chart.width > 0 && (
          <svg
            width={chart.width}
            height={chart.height}
            role="img"
            aria-label={summary}
            onMouseMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const index = step ? Math.round((event.clientX - bounds.left - MARGIN.left) / step) : 0;
              chart.setHover(Math.min(labels.length - 1, Math.max(0, index)));
            }}
          >
            <Axes ticks={chart.ticks} y={chart.y} width={chart.width} formatValue={formatValue} />
            {labels.map((label, index) =>
              index % chart.labelEvery === 0 ? (
                <text key={index} x={x(index)} y={chart.height - 8} textAnchor="middle" fontSize="10" fill="#64748b">
                  {label}
                </text>
              ) : null,
            )}
            {chart.hover !== null && <line x1={x(chart.hover)} x2={x(chart.hover)} y1={MARGIN.top} y2={chart.height - MARGIN.bottom} stroke="#94a3b8" />}
            {series.map((item) => (
              <g key={item.name}>
                <path d={pathFor(item.values)} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {item.values.map((value, index) =>
                  value !== null && (labels.length <= 14 || index === chart.hover || item.values[index - 1] == null && item.values[index + 1] == null) ? (
                    <circle key={index} cx={x(index)} cy={chart.y(value)} r={index === chart.hover ? 4 : 2.5} fill="#fff" stroke={item.color} strokeWidth="2" />
                  ) : null,
                )}
              </g>
            ))}
          </svg>
        )}
        {chart.hover !== null && (
          <Tooltip
            x={x(chart.hover)}
            width={chart.width}
            title={labels[chart.hover]}
            rows={series.map((item) => {
              const value = item.values[chart.hover!];
              return { name: item.name, color: item.color, value: value === null || value === undefined ? 'Hidden' : formatValue(value) };
            })}
          />
        )}
      </div>
    </div>
  );
}

export function BarChart(props: ChartProps) {
  const { labels, series, formatValue = defaultFormat, summary } = props;
  const chart = useCartesian({ ...props, stacked: true });
  const band = labels.length ? chart.innerWidth / labels.length : 0;
  const barWidth = Math.min(36, band * 0.62);
  const baseline = chart.y(0);

  return (
    <div>
      <Legend series={series} />
      <div ref={chart.ref} className="relative" onMouseLeave={() => chart.setHover(null)}>
        {chart.width > 0 && (
          <svg width={chart.width} height={chart.height} role="img" aria-label={summary}>
            <Axes ticks={chart.ticks} y={chart.y} width={chart.width} formatValue={formatValue} />
            {labels.map((label, index) => {
              const center = MARGIN.left + band * index + band / 2;
              let offset = 0;
              return (
                <g key={index} onMouseEnter={() => chart.setHover(index)}>
                  <rect x={MARGIN.left + band * index} y={MARGIN.top} width={band} height={chart.innerHeight} fill={chart.hover === index ? '#f1f5f9' : 'transparent'} />
                  {series.map((item) => {
                    const value = item.values[index] ?? 0;
                    const barHeight = baseline - chart.y(value);
                    const top = baseline - offset - barHeight;
                    offset += barHeight;
                    return barHeight > 0 ? <rect key={item.name} x={center - barWidth / 2} y={top} width={barWidth} height={barHeight} rx="2" fill={item.color} /> : null;
                  })}
                  {index % chart.labelEvery === 0 && (
                    <text x={center} y={chart.height - 8} textAnchor="middle" fontSize="10" fill="#64748b">
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {chart.hover !== null && (
          <Tooltip
            x={MARGIN.left + band * chart.hover + band / 2}
            width={chart.width}
            title={labels[chart.hover]}
            rows={series.map((item) => ({ name: item.name, color: item.color, value: formatValue(item.values[chart.hover!] ?? 0) }))}
          />
        )}
      </div>
    </div>
  );
}

export function DonutChart({ segments, centerValue, centerLabel, summary }: {
  segments: { label: string; value: number; color: string }[];
  centerValue: ReactNode;
  centerLabel: string;
  summary: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label={summary}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="16" />
          {total > 0 &&
            segments.map((segment) => {
              const length = (segment.value / total) * circumference;
              const circle = (
                <circle
                  key={segment.label}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="16"
                  strokeDasharray={`${Math.max(0, length - 1.5)} ${circumference}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return segment.value > 0 ? circle : null;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-ink tabular-nums">{centerValue}</span>
          <span className="text-xs text-slate-500">{centerLabel}</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: segment.color }} aria-hidden />
            {segment.label}
            <span className="ml-auto pl-4 font-medium text-ink tabular-nums">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
