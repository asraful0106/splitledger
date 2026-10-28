import { currencyInfo } from "shared";

export interface ChartPoint {
  x: number;
  y: number;
}

export function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const fraction = value / magnitude;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * magnitude;
}

export function nearestIndex(x: number, xs: number[]): number {
  if (xs.length === 0) {
    return -1;
  }
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  xs.forEach((value, index) => {
    const distance = Math.abs(value - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function smoothPath(points: ChartPoint[]): string {
  const first = points[0];
  if (!first) {
    return "";
  }
  if (points.length === 1) {
    return `M ${round(first.x)} ${round(first.y)}`;
  }

  let path = `M ${round(first.x)} ${round(first.y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    if (!previous || !current || !next) {
      continue;
    }
    const after = points[index + 2] ?? next;

    const control1x = current.x + (next.x - previous.x) / 6;
    const control1y = current.y + (next.y - previous.y) / 6;
    const control2x = next.x - (after.x - current.x) / 6;
    const control2y = next.y - (after.y - current.y) / 6;

    path += ` C ${round(control1x)} ${round(control1y)}, ${round(control2x)} ${round(control2y)}, ${round(next.x)} ${round(next.y)}`;
  }
  return path;
}

export function areaPath(points: ChartPoint[], baselineY: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return "";
  }
  return `${smoothPath(points)} L ${round(last.x)} ${round(baselineY)} L ${round(first.x)} ${round(baselineY)} Z`;
}

const compactFormatters = new Map<string, Intl.NumberFormat>();

export function compactMoney(minor: bigint, currency: string): string {
  const info = currencyInfo(currency);
  let formatter = compactFormatters.get(info.locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(info.locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    compactFormatters.set(info.locale, formatter);
  }
  return `${info.symbol}${formatter.format(Number(minor) / 100)}`;
}
