import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { jsonResponse, stubFetch } from "../test/fetch-mock";
import { renderApp } from "../test/render";

const user = {
  id: "u1",
  email: "alice@example.com",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    name: "Dhaka",
    bankName: "City Bank",
    last4: null,
    currency: "BDT",
    archivedAt: null,
    hasTransactions: false,
    createdAt: "2026-01-02T00:00:00.000Z",
    balanceMinor: "0",
    parts: [
      {
        id: "p1",
        name: "General",
        percentageBp: 10000,
        sortOrder: 0,
        balanceMinor: "0",
        lowBalanceThresholdMinor: null,
      },
    ],
    ...overrides,
  };
}

function base(url: string, init?: RequestInit): Response | undefined {
  if (url.endsWith("/auth/refresh")) {
    return jsonResponse(200, { data: { accessToken: "t", user } });
  }
  if (url.endsWith("/auth/me")) {
    return jsonResponse(200, { data: { user } });
  }
  if (url.includes("/insights/alerts")) {
    return jsonResponse(200, { data: { alerts: [] } });
  }
  if (url.includes("/insights/summary")) {
    return jsonResponse(200, {
      data: {
        from: "2026-10-01T00:00:00+06:00",
        to: "2026-11-01T00:00:00+06:00",
        buckets: [
          {
            currency: "BDT",
            totals: { inflowMinor: "10000", outflowMinor: "0", netMinor: "10000" },
            parts: [],
            series: [{ bucket: "2026-10", inflowMinor: "10000", outflowMinor: "0", netMinor: "10000" }],
          },
          {
            currency: "USD",
            totals: { inflowMinor: "2500", outflowMinor: "0", netMinor: "2500" },
            parts: [],
            series: [{ bucket: "2026-10", inflowMinor: "2500", outflowMinor: "0", netMinor: "2500" }],
          },
        ],
      },
    });
  }
  if (url.includes("/accounts/a1/transactions")) {
    return jsonResponse(200, { data: { transactions: [], nextCursor: null } });
  }
  if (url.match(/\/accounts\/a1$/) && (init?.method ?? "GET") === "GET") {
    return undefined;
  }
  return undefined;
}

describe("multi-currency", () => {
  it("shows one total per currency on home", async () => {
    stubFetch((url, init) => {
      const shared = base(url, init);
      if (shared) return shared;
      if (url.endsWith("/accounts") && (init?.method ?? "GET") === "GET") {
        return jsonResponse(200, {
          data: {
            accounts: [
              account({ balanceMinor: "10000" }),
              account({
                id: "a2",
                name: "New York",
                currency: "USD",
                balanceMinor: "2500",
                parts: [],
              }),
            ],
          },
        });
      }
      return undefined;
    });

    renderApp(<App />, "/");

    await screen.findByText("Dhaka");
    const header = document.querySelector(".home-header");
    expect(header?.textContent).toContain("৳100.00");
    expect(header?.textContent).toContain("$25.00");
  });

  it("creates an account in the selected currency", async () => {
    const fetchMock = stubFetch((url, init) => {
      const shared = base(url, init);
      if (shared) return shared;
      if (url.endsWith("/accounts") && init?.method === "POST") {
        return jsonResponse(201, { data: { account: account({ currency: "USD" }) } });
      }
      if (url.match(/\/accounts\/a1$/) && (init?.method ?? "GET") === "GET") {
        return jsonResponse(200, { data: { account: account({ currency: "USD" }) } });
      }
      if (url.endsWith("/accounts") && (init?.method ?? "GET") === "GET") {
        return jsonResponse(200, { data: { accounts: [account()] } });
      }
      return undefined;
    });

    const ui = userEvent.setup();
    renderApp(<App />, "/accounts/new");

    await ui.type(await screen.findByLabelText("Nickname"), "New York");
    await ui.type(screen.getByLabelText("Bank name"), "Bank");
    await ui.selectOptions(screen.getByLabelText("Currency"), "USD");
    await ui.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/accounts") &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
      expect(body.currency).toBe("USD");
    });
  });

  it("locks the currency once the account has transactions", async () => {
    stubFetch((url, init) => {
      const shared = base(url, init);
      if (shared) return shared;
      if (url.match(/\/accounts\/a1$/) && (init?.method ?? "GET") === "GET") {
        return jsonResponse(200, {
          data: { account: account({ hasTransactions: true, balanceMinor: "1000" }) },
        });
      }
      return undefined;
    });

    renderApp(<App />, "/accounts/a1");

    const select = await screen.findByLabelText("Currency");
    expect(select).toBeDisabled();
    expect(
      screen.getByText("Currency is locked once an account has transactions."),
    ).toBeInTheDocument();
  });

  it("renders a section per currency on insights", async () => {
    stubFetch((url, init) => {
      const shared = base(url, init);
      if (shared) return shared;
      if (url.endsWith("/accounts") && (init?.method ?? "GET") === "GET") {
        return jsonResponse(200, {
          data: { accounts: [account(), account({ id: "a2", name: "New York", currency: "USD" })] },
        });
      }
      return undefined;
    });

    renderApp(<App />, "/insights");

    expect(await screen.findByText("BDT")).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getAllByText("৳100.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$25.00").length).toBeGreaterThan(0);
  });
});
