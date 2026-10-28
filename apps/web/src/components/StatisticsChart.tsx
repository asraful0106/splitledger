import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatMoney, type Granularity } from "shared";
import { areaPath, compactMoney, nearestIndex, niceCeiling, smoothPath } from "../lib/chart";
import type { SummarySeriesPoint } from "../lib/insights";
import { FormMessage } from "./FormMessage";

type Metric = "in" | "out" | "net";

const WIDTH = 360;
const HEIGHT = 180;
const PADDING = { top: 16, right: 12, bottom: 26, left: 48 };

const METRICS: Array<{ id: Metric; label: string; color: string }> = [
  { id: "in", label: "In", color: "#34d399" },
  { id: "out", label: "Out", color: "#f87171" },
  { id: "net", label: "Net", color: "#2dd4bf" },
];

function metricValue(point: SummarySeriesPoint, metric: Metric): bigint {
  if (metric === "in") {
    return BigInt(point.inflowMinor);
  }
  if (metric === "out") {
    return BigInt(point.outflowMinor);
  }
  return BigInt(point.netMinor);
}

function bucketLabel(bucket: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [year, month] = bucket.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)),
    );
  }
  return bucket.slice(5);
}

export function StatisticsChart({
  series,
  currency,
  granularity,
}: {
  series: SummarySeriesPoint[];
  currency: string;
  granularity: Granularity;
}) {
  const gradientId = `chart-${useId().replace(/[:]/g, "")}`;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [metric, setMetric] = useState<Metric>("net");
  const [hovered, setHovered] = useState<number | null>(null);

  if (series.length === 0) {
    return <FormMessage tone="info">No activity in this period.</FormMessage>;
  }

  const active = METRICS.find((entry) => entry.id === metric) ?? {
    id: metric,
    label: metric,
    color: "#2dd4bf",
  };
  const values = series.map((point) => Number(metricValue(point, metric)) / 100);

  const peak = niceCeiling(Math.max(0, ...values) || 1);
  const lowest = Math.min(0, ...values);
  const floor = lowest < 0 ? -niceCeiling(Math.abs(lowest)) : 0;
  const span = peak - floor || 1;

  const plotLeft = PADDING.left;
  const plotRight = WIDTH - PADDING.right;
  const plotTop = PADDING.top;
  const plotBottom = HEIGHT - PADDING.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const xFor = (index: number): number =>
    series.length === 1
      ? plotLeft + plotWidth / 2
      : plotLeft + (index / (series.length - 1)) * plotWidth;
  const yFor = (value: number): number => plotTop + ((peak - value) / span) * plotHeight;

  const points = values.map((value, index) => ({ x: xFor(index), y: yFor(value) }));
  const baselineY = yFor(0);
  const ticks = [0, 1, 2, 3].map((step) => peak - (step / 3) * span);
  const tickIndexes =
    series.length <= 4
      ? series.map((_, index) => index)
      : [
          ...new Set([
            0,
            Math.floor((series.length - 1) / 3),
            Math.floor((2 * (series.length - 1)) / 3),
            series.length - 1,
          ]),
        ];

  const lastValue = values[values.length - 1] ?? 0;
  const accessibleLabel = `${active.label} by ${granularity}: ${series.length} points, latest ${formatMoney(
    BigInt(Math.round(lastValue * 100)),
    currency,
  )}`;

  const handleMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    const localX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const index = nearestIndex(
      localX,
      series.map((_, position) => xFor(position)),
    );
    if (index >= 0) {
      setHovered(index);
    }
  };

  const hoveredPoint = hovered !== null ? series[hovered] : undefined;
  const hoveredX = hovered !== null ? xFor(hovered) : 0;
  const hoveredY = hovered !== null ? yFor(values[hovered] ?? 0) : 0;

  return (
    <div className="chart">
      <div className="mode-toggle" role="group" aria-label="Metric">
        {METRICS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`mode-option ${metric === entry.id ? "mode-option-active" : ""}`}
            aria-pressed={metric === entry.id}
            onClick={() => setMetric(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="chart-canvas">
        <svg
          ref={svgRef}
          className="chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={accessibleLabel}
          onPointerMove={handleMove}
          onPointerLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={active.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={active.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={yFor(value)}
                y2={yFor(value)}
                className="chart-grid"
              />
              <text x={plotLeft - 8} y={yFor(value) + 4} textAnchor="end" className="chart-axis">
                {compactMoney(BigInt(Math.round(value * 100)), currency)}
              </text>
            </g>
          ))}

          <path d={areaPath(points, baselineY)} fill={`url(#${gradientId})`} />
          <path
            d={smoothPath(points)}
            fill="none"
            stroke={active.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {series.length <= 20
            ? points.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={2.5} fill={active.color} />
              ))
            : null}

          {tickIndexes.map((index) => (
            <text
              key={index}
              x={xFor(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="chart-axis"
            >
              {bucketLabel(series[index]?.bucket ?? "", granularity)}
            </text>
          ))}

          {hovered !== null ? (
            <>
              <line
                x1={hoveredX}
                x2={hoveredX}
                y1={plotTop}
                y2={plotBottom}
                className="chart-crosshair"
              />
              <circle
                cx={hoveredX}
                cy={hoveredY}
                r={4}
                fill={active.color}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            </>
          ) : null}
        </svg>

        {hoveredPoint ? (
          <div
            className="chart-tooltip"
            style={{
              left: `${Math.min(88, Math.max(12, (hoveredX / WIDTH) * 100))}%`,
              top: `${(hoveredY / HEIGHT) * 100}%`,
            }}
            aria-hidden="true"
          >
            <span className="chart-tooltip-label">{hoveredPoint.bucket}</span>
            <span className="chart-tooltip-row">
              <span>In</span>
              <span>{formatMoney(BigInt(hoveredPoint.inflowMinor), currency)}</span>
            </span>
            <span className="chart-tooltip-row">
              <span>Out</span>
              <span>{formatMoney(BigInt(hoveredPoint.outflowMinor), currency)}</span>
            </span>
            <span className="chart-tooltip-row">
              <span>Net</span>
              <span>{formatMoney(BigInt(hoveredPoint.netMinor), currency)}</span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
