import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { currentFiscalYearRange, currentMonthRange } from "shared";
import { App } from "../App";
import { jsonResponse, stubFetch, textResponse } from "../test/fetch-mock";
import { renderApp } from "../test/render";

const user = {
  id: "u1",
  email: "alice@example.com",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const account = {
  id: "a1",
  name: "Daily",
  bankName: "City Bank",
  last4: null,
  currency: "BDT",
  archivedAt: null,
  hasTransactions: true,
  createdAt: "2026-01-02T00:00:00.000Z",
  balanceMinor: "9000",
  parts: [
    {
      id: "p1",
      name: "Spending",
      percentageBp: 6000,
      sortOrder: 0,
      balanceMinor: "6000",
      lowBalanceThresholdMinor: "5000",
    },
  ],
};

const summary = {
  from: "2026-10-01T00:00:00+06:00",
  to: "2026-11-01T00:00:00+06:00",
  buckets: [
    {
      currency: "BDT",
      totals: { inflowMinor: "10000", outflowMinor: "1000", netMinor: "9000" },
      parts: [
        {
          accountId: "a1",
          accountName: "Daily",
          partId: "p1",
          partName: "Spending",
          inflowMinor: "6000",
          outflowMinor: "1000",
          netMinor: "5000",
        },
      ],
      series: [{ bucket: "2026-10", inflowMinor: "10000", outflowMinor: "1000", netMinor: "9000" }],
    },
  ],
};

const alerts = {
  alerts: [
    {
      accountId: "a1",
      accountName: "Daily",
      currency: "BDT",
      partId: "p1",
      partName: "Spending",
      balanceMinor: "4000",
      thresholdMinor: "5000",
    },
  ],
};

function handler(extra: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  return (url: string, init?: RequestInit): Response | undefined => {
    const custom = extra(url, init);
    if (custom) return custom;

    if (url.endsWith("/auth/refresh")) {
      return jsonResponse(200, { data: { accessToken: "t", user } });
    }
    if (url.endsWith("/auth/me")) {
      return jsonResponse(200, { data: { user } });
    }
    if (url.endsWith("/accounts") && (init?.method ?? "GET") === "GET") {
      return jsonResponse(200, { data: { accounts: [account] } });
    }
    if (url.includes("/insights/summary")) {
      return jsonResponse(200, { data: summary });
    }
    if (url.includes("/insights/alerts")) {
      return jsonResponse(200, { data: alerts });
    }
    return undefined;
  };
}

function summaryFromParams(fetchMock: { mock: { calls: unknown[][] } }): Array<string | null> {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes("/insights/summary"))
    .map((url) => new URL(url).searchParams.get("from"));
}

function summaryGranularities(
  fetchMock: { mock: { calls: unknown[][] } },
): Array<string | null> {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes("/insights/summary"))
    .map((url) => new URL(url).searchParams.get("granularity"));
}

describe("insights", () => {
  it("renders totals, parts and alerts", async () => {
    stubFetch(handler());
    renderApp(<App />, "/insights");

    expect(await screen.findByText("৳100.00")).toBeInTheDocument();
    expect(screen.getByText("৳10.00")).toBeInTheDocument();
    expect(screen.getByText("৳90.00")).toBeInTheDocument();
    expect(screen.getByText("Spending")).toBeInTheDocument();
    expect(await screen.findByText(/৳40.00 of ৳50.00 alert level/)).toBeInTheDocument();
  });

  it("requests the fiscal-year range for that preset", async () => {
    const fetchMock = stubFetch(handler());
    const ui = userEvent.setup();
    renderApp(<App />, "/insights");

    await screen.findByText("৳100.00");
    const monthFrom = currentMonthRange(new Date()).from;
    await waitFor(() => expect(summaryFromParams(fetchMock)).toContain(monthFrom));

    await ui.click(screen.getByRole("button", { name: "This fiscal year" }));

    const fiscalFrom = currentFiscalYearRange(new Date()).from;
    await waitFor(() => expect(summaryFromParams(fetchMock)).toContain(fiscalFrom));
  });

  it("defaults to daily granularity and follows the toggle", async () => {
    const fetchMock = stubFetch(handler());
    const ui = userEvent.setup();
    renderApp(<App />, "/insights");

    await screen.findByText("৳100.00");
    await waitFor(() => expect(summaryGranularities(fetchMock)).toContain("day"));

    await ui.click(screen.getByRole("button", { name: "Week" }));
    await waitFor(() => expect(summaryGranularities(fetchMock)).toContain("week"));

    await ui.click(screen.getByRole("button", { name: "This fiscal year" }));
    await waitFor(() => expect(summaryGranularities(fetchMock)).toContain("month"));
  });

  it("downloads the CSV for the selected range", async () => {
    const fetchMock = stubFetch(
      handler((url) => {
        if (url.includes("/insights/export.csv")) {
          return textResponse(200, "occurred_at,account\n", {
            "content-disposition": 'attachment; filename="splitledger.csv"',
          });
        }
        return undefined;
      }),
    );

    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const ui = userEvent.setup();
    renderApp(<App />, "/insights");

    await screen.findByText("৳100.00");
    await ui.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/insights/export.csv"))).toBe(
      true,
    );
    expect(createObjectURL).toHaveBeenCalled();
  });
});
