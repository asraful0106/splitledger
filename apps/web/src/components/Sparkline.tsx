import { areaPath, smoothPath } from "../lib/chart";
import type { SummarySeriesPoint } from "../lib/insights";

export function Sparkline({ points }: { points: SummarySeriesPoint[] }) {
  if (points.length < 2) {
    return null;
  }

  const width = 120;
  const height = 32;
  const padding = 2;

  const values = points.map((point) => Number(BigInt(point.netMinor)) / 100);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const coords = values.map((value, index) => ({
    x: padding + (index / (values.length - 1)) * (width - padding * 2),
    y: padding + ((max - value) / span) * (height - padding * 2),
  }));

  const latest = values[values.length - 1] ?? 0;
  const stroke = latest >= 0 ? "#34d399" : "#f87171";

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={areaPath(coords, height - padding)} fill={stroke} opacity={0.16} />
      <path
        d={smoothPath(coords)}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
