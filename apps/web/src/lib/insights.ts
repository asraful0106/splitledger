import type { Granularity } from "shared";
import { apiFetch, apiFetchText } from "./api";

export interface SummaryPart {
  accountId: string;
  accountName: string;
  partId: string;
  partName: string;
  inflowMinor: string;
  outflowMinor: string;
  netMinor: string;
}

export interface SummarySeriesPoint {
  bucket: string;
  inflowMinor: string;
  outflowMinor: string;
  netMinor: string;
}

export interface SummaryBucket {
  currency: string;
  totals: { inflowMinor: string; outflowMinor: string; netMinor: string };
  parts: SummaryPart[];
  series: SummarySeriesPoint[];
}

export interface InsightsSummary {
  from: string;
  to: string;
  buckets: SummaryBucket[];
}

export interface LowBalanceAlert {
  accountId: string;
  accountName: string;
  currency: string;
  partId: string;
  partName: string;
  balanceMinor: string;
  thresholdMinor: string;
}

interface RangeParams {
  from: string;
  to: string;
  accountId?: string;
  granularity?: Granularity;
}

function rangeSearch(params: RangeParams): string {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.accountId) {
    search.set("accountId", params.accountId);
  }
  if (params.granularity) {
    search.set("granularity", params.granularity);
  }
  return search.toString();
}

export async function getSummary(params: RangeParams): Promise<InsightsSummary> {
  return apiFetch<InsightsSummary>(`/insights/summary?${rangeSearch(params)}`);
}

export async function getAlerts(): Promise<LowBalanceAlert[]> {
  const data = await apiFetch<{ alerts: LowBalanceAlert[] }>("/insights/alerts");
  return data.alerts;
}

export async function downloadCsv(params: RangeParams): Promise<void> {
  const { text, filename } = await apiFetchText(
    `/insights/export.csv?${rangeSearch(params)}`,
  );

  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? "splitledger.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
