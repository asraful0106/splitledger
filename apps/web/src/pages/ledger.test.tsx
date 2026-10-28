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

const account = {
  id: "a1",
  name: "Salary",
  bankName: "BRAC Bank",
  last4: "1234",
  currency: "BDT",
  archivedAt: null,
  hasTransactions: false,
  createdAt: "2026-01-02T00:00:00.000Z",
  balanceMinor: "6000",
  parts: [
    { id: "p1", name: "Spending", percentageBp: 6000, sortOrder: 0, balanceMinor: "6000" },
    { id: "p2", name: "Savings", percentageBp: 2500, sortOrder: 1, balanceMinor: "2500" },
    { id: "p3", name: "Tax", percentageBp: 1500, sortOrder: 2, balanceMinor: "1500" },
  ],
};

const transaction = {
  id: "t1",
  accountId: "a1",
  type: "deposit",
  amountMinor: "1000",
  mode: "split",
  currency: "BDT",
  occurredAt: "2026-01-02T00:00:00.000Z",
  note: null,
  category: null,
  warningAcknowledgedAt: null,
  reversesTransactionId: null,
  isReversal: false,
  entries: [
    { id: "e1", partId: "p1", partName: "Spending", amountMinor: "600", percentageBpSnapshot: 6000 },
  ],
};

function base(url: string): Response | undefined {
  if (url.endsWith("/auth/refresh")) {
    return jsonResponse(200, { data: { accessToken: "t", user } });
  }
  if (url.endsWith("/auth/me")) {
    return jsonResponse(200, { data: { user } });
  }
  return undefined;
}

function handler(extra: (url: string, init?: RequestInit) => Response | undefined) {
  return (url: string, init?: RequestInit): Response | undefined => {
    const custom = extra(url, init);
    if (custom) return custom;

    const auth = base(url);
    if (auth) return auth;

    if (url.match(/\/accounts\/a1$/) && (init?.method ?? "GET") === "GET") {
      return jsonResponse(200, { data: { account } });
    }
    if (url.includes("/accounts/a1/transactions")) {
      return jsonResponse(200, { data: { transactions: [], nextCursor: null } });
    }
    return undefined;
  };
}

function requestBody(fetchMock: { mock: { calls: unknown[][] } }, suffix: string): unknown {
  const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith(suffix));
  const init = call?.[1] as RequestInit | undefined;
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}

async function openAccount() {
  renderApp(<App />, "/accounts/a1");
  await screen.findByRole("heading", { name: "Salary" });
}

describe("deposit sheet", () => {
  it("previews the split and posts a split deposit", async () => {
    const fetchMock = stubFetch(
      handler((url, init) => {
        if (url.endsWith("/accounts/a1/deposits") && init?.method === "POST") {
          return jsonResponse(201, { data: { transaction } });
        }
        return undefined;
      }),
    );

    const ui = userEvent.setup();
    await openAccount();

    await ui.click(screen.getByRole("button", { name: "Deposit" }));
    await ui.type(await screen.findByLabelText("Amount"), "10");

    expect(await screen.findByText("৳6.00")).toBeInTheDocument();
    expect(screen.getByText("৳2.50")).toBeInTheDocument();

    await ui.click(screen.getByRole("button", { name: "Confirm deposit" }));

    await waitFor(() => {
      expect(requestBody(fetchMock, "/accounts/a1/deposits")).toMatchObject({
        amountMinor: "1000",
        mode: "split",
      });
    });
  });

  it("requires acknowledging the warning for a single-part deposit", async () => {
    stubFetch(handler(() => undefined));

    const ui = userEvent.setup();
    await openAccount();

    await ui.click(screen.getByRole("button", { name: "Deposit" }));
    await ui.type(await screen.findByLabelText("Amount"), "10");
    await ui.click(screen.getByRole("button", { name: "Single part" }));
    await ui.selectOptions(screen.getByLabelText("Part"), "p1");

    expect(await screen.findByText(/skips your split rules/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm deposit" })).toBeDisabled();

    await ui.click(screen.getByRole("button", { name: "I understand" }));

    expect(screen.getByRole("button", { name: "Confirm deposit" })).toBeEnabled();
  });
});

describe("withdraw sheet", () => {
  it("blocks an amount larger than the part balance", async () => {
    stubFetch(handler(() => undefined));

    const ui = userEvent.setup();
    await openAccount();

    await ui.click(screen.getByRole("button", { name: "Withdraw" }));
    await ui.type(await screen.findByLabelText(/^Spending — ৳60\.00 available$/), "61");

    expect(await screen.findByText("More than this part holds")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm withdrawal" })).toBeDisabled();
  });
});

describe("history", () => {
  it("renders transactions and reverses after confirmation", async () => {
    const fetchMock = stubFetch(
      handler((url, init) => {
        if (url.includes("/accounts/a1/transactions")) {
          return jsonResponse(200, { data: { transactions: [transaction], nextCursor: null } });
        }
        if (url.endsWith("/transactions/t1/reverse") && init?.method === "POST") {
          return jsonResponse(201, { data: { transaction: { ...transaction, id: "t2" } } });
        }
        return undefined;
      }),
    );

    const ui = userEvent.setup();
    renderApp(<App />, "/accounts/a1/transactions");

    expect(await screen.findByText("Deposit")).toBeInTheDocument();

    await ui.click(screen.getByRole("button", { name: "Reverse" }));
    await ui.click(await screen.findByRole("button", { name: "Confirm reversal" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).endsWith("/transactions/t1/reverse")),
      ).toBe(true);
    });
  });
});
