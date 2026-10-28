import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  currencyInfo,
  currentFiscalYearRange,
  currentMonthRange,
  customDateRange,
  dhakaToday,
  formatMoney,
  previousMonthRange,
  type Granularity,
  type PeriodRange,
} from "shared";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import { SegmentedBar } from "../components/SegmentedBar";
import { StatisticsChart } from "../components/StatisticsChart";
import { listAccounts } from "../lib/accounts";
import { messageForError } from "../lib/errors";
import { downloadCsv, getAlerts, getSummary } from "../lib/insights";

type Preset = "month" | "lastMonth" | "fiscalYear" | "custom";

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "fiscalYear", label: "This fiscal year" },
  { id: "custom", label: "Custom" },
];

function isoDate(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function InsightsPage() {
  const { status } = useAuth();
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(() => isoDate(dhakaToday()));
  const [customTo, setCustomTo] = useState(() => isoDate(dhakaToday()));
  const [accountId, setAccountId] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [exportError, setExportError] = useState<string | null>(null);

  const choosePreset = (next: Preset): void => {
    setPreset(next);
    setGranularity(next === "month" || next === "lastMonth" ? "day" : "month");
  };

  const now = useMemo(() => new Date(), []);
  const range: PeriodRange = useMemo(() => {
    switch (preset) {
      case "lastMonth":
        return previousMonthRange(now);
      case "fiscalYear":
        return currentFiscalYearRange(now);
      case "custom":
        return customDateRange(customFrom, customTo);
      default:
        return currentMonthRange(now);
    }
  }, [preset, now, customFrom, customTo]);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
    enabled: status === "authenticated",
  });

  const summaryQuery = useQuery({
    queryKey: ["insights", "summary", range.from, range.to, accountId, granularity],
    enabled: status === "authenticated",
    queryFn: () => {
      const params: { from: string; to: string; accountId?: string; granularity: Granularity } = {
        from: range.from,
        to: range.to,
        granularity,
      };
      if (accountId) {
        params.accountId = accountId;
      }
      return getSummary(params);
    },
  });

  const alertsQuery = useQuery({
    queryKey: ["insights", "alerts"],
    queryFn: getAlerts,
    enabled: status === "authenticated",
  });

  const exportMutation = useMutation({
    mutationFn: () => {
      const params: { from: string; to: string; accountId?: string } = {
        from: range.from,
        to: range.to,
      };
      if (accountId) {
        params.accountId = accountId;
      }
      return downloadCsv(params);
    },
    onError: (error) => setExportError(messageForError(error)),
  });

  const summary = summaryQuery.data;
  const alerts = alertsQuery.data ?? [];

  return (
    <Screen center={false}>
      <div className="stack" style={{ gap: "1.25rem" }}>
        <Link className="link" to="/">
          ← Accounts
        </Link>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <h1 className="auth-title">Insights</h1>
          <span className="account-meta">{range.label}</span>
        </div>

        <div className="mode-toggle" role="group" aria-label="Period">
          {PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`mode-option ${preset === option.id ? "mode-option-active" : ""}`}
              aria-pressed={preset === option.id}
              onClick={() => choosePreset(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mode-toggle" role="group" aria-label="Granularity">
          {(["day", "week", "month"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              className={`mode-option ${granularity === unit ? "mode-option-active" : ""}`}
              aria-pressed={granularity === unit}
              onClick={() => setGranularity(unit)}
            >
              {unit === "day" ? "Day" : unit === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="row" style={{ gap: "0.5rem" }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="insights-from">
                From
              </label>
              <input
                id="insights-from"
                type="date"
                className="field-input"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="insights-to">
                To
              </label>
              <input
                id="insights-to"
                type="date"
                className="field-input"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="field">
          <label className="field-label" htmlFor="insights-account">
            Account
          </label>
          <select
            id="insights-account"
            className="field-input"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">All accounts</option>
            {(accountsQuery.data ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        {summaryQuery.isPending ? <div className="skeleton" /> : null}
        {summaryQuery.isError ? (
          <FormMessage tone="error">{messageForError(summaryQuery.error)}</FormMessage>
        ) : null}

        {summary && summary.buckets.length === 0 ? (
          <FormMessage tone="info">No activity in this period.</FormMessage>
        ) : null}

        {summary?.buckets.map((bucket) => (
          <section key={bucket.currency} className="stack" style={{ gap: "0.75rem" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="section-title">{bucket.currency}</h2>
              <span className="account-meta">{currencyInfo(bucket.currency).name}</span>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <span className="section-title">In</span>
                <span className="summary-value summary-in">
                  {formatMoney(BigInt(bucket.totals.inflowMinor), bucket.currency)}
                </span>
              </div>
              <div className="summary-card">
                <span className="section-title">Out</span>
                <span className="summary-value summary-out">
                  {formatMoney(BigInt(bucket.totals.outflowMinor), bucket.currency)}
                </span>
              </div>
              <div className="summary-card">
                <span className="section-title">Net</span>
                <span className="summary-value">
                  {formatMoney(BigInt(bucket.totals.netMinor), bucket.currency)}
                </span>
              </div>
            </div>

            <StatisticsChart
              series={bucket.series}
              currency={bucket.currency}
              granularity={granularity}
            />

            <div className="stack" style={{ gap: "0.5rem" }}>
              {bucket.parts.length === 0 ? (
                <FormMessage tone="info">No entries in this period.</FormMessage>
              ) : null}
              {bucket.parts.map((part) => (
                <div key={`${part.accountId}-${part.partId}`} className="insight-row">
                  <div className="stack" style={{ gap: 0 }}>
                    <span>{part.partName}</span>
                    <span className="account-meta">{part.accountName}</span>
                  </div>
                  <span className="account-balance">
                    {formatMoney(BigInt(part.netMinor), bucket.currency)}
                  </span>
                </div>
              ))}
            </div>

            {bucket.totals.inflowMinor !== "0" ? (
              <SegmentedBar
                parts={bucket.parts.map((part, index) => ({
                  id: `${part.accountId}-${part.partId}`,
                  name: part.partName,
                  percentageBp: Number(
                    (BigInt(part.inflowMinor) * 10000n) / BigInt(bucket.totals.inflowMinor),
                  ),
                  sortOrder: index,
                  balanceMinor: "0",
                  lowBalanceThresholdMinor: null,
                }))}
                height={10}
              />
            ) : null}
          </section>
        ))}

        <section className="stack" style={{ gap: "0.5rem" }}>
          <h2 className="section-title">Alerts</h2>
          {alertsQuery.isPending ? <div className="skeleton" /> : null}
          {alertsQuery.isError ? (
            <FormMessage tone="error">{messageForError(alertsQuery.error)}</FormMessage>
          ) : null}
          {alertsQuery.isSuccess && alerts.length === 0 ? (
            <FormMessage tone="info">No low-balance alerts. Set alert levels on an account.</FormMessage>
          ) : null}
          {alerts.map((alert) => (
            <div key={alert.partId} className="insight-row">
              <div className="stack" style={{ gap: 0 }}>
                <span>
                  {alert.partName} · {alert.accountName}
                </span>
                <span className="account-meta">
                  {formatMoney(BigInt(alert.balanceMinor), alert.currency)} of{" "}
                  {formatMoney(BigInt(alert.thresholdMinor), alert.currency)} alert level
                </span>
              </div>
              <Link className="link" to={`/accounts/${alert.accountId}`}>
                Open
              </Link>
            </div>
          ))}
        </section>

        {exportError ? <FormMessage tone="error">{exportError}</FormMessage> : null}

        <Button
          variant="ghost"
          loading={exportMutation.isPending}
          onClick={() => {
            setExportError(null);
            exportMutation.mutate();
          }}
        >
          Export CSV
        </Button>
      </div>
    </Screen>
  );
}
