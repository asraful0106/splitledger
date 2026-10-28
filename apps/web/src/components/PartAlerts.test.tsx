import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AccountView } from "../lib/accounts";
import { jsonResponse, stubFetch } from "../test/fetch-mock";
import { renderApp } from "../test/render";
import { PartAlerts } from "./PartAlerts";

const account: AccountView = {
  id: "a1",
  name: "Daily",
  bankName: "City Bank",
  last4: null,
  currency: "BDT",
  archivedAt: null,
  hasTransactions: false,
  createdAt: "2026-01-02T00:00:00.000Z",
  balanceMinor: "6000",
  parts: [
    {
      id: "p1",
      name: "Spending",
      percentageBp: 6000,
      sortOrder: 0,
      balanceMinor: "6000",
      lowBalanceThresholdMinor: null,
    },
    {
      id: "p2",
      name: "Savings",
      percentageBp: 4000,
      sortOrder: 1,
      balanceMinor: "0",
      lowBalanceThresholdMinor: "2500",
    },
  ],
};

describe("PartAlerts", () => {
  it("saves thresholds through the parts endpoint", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith("/accounts/a1/parts") && init?.method === "PUT") {
        return jsonResponse(200, { data: { parts: [] } });
      }
      return undefined;
    });

    const ui = userEvent.setup();
    const onSaved = vi.fn();
    renderApp(<PartAlerts account={account} onSaved={onSaved} />);

    const spending = screen.getByLabelText("Spending — alert below");
    await ui.clear(spending);
    await ui.type(spending, "50");
    await ui.click(screen.getByRole("button", { name: "Save alert levels" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith("/accounts/a1/parts"),
      );
      const init = call?.[1] as RequestInit | undefined;
      const body = JSON.parse(String(init?.body)) as {
        parts: Array<{ name: string; lowBalanceThresholdMinor: string | null }>;
      };
      expect(body.parts).toEqual([
        expect.objectContaining({ name: "Spending", lowBalanceThresholdMinor: "5000" }),
        expect.objectContaining({ name: "Savings", lowBalanceThresholdMinor: "2500" }),
      ]);
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("clears a threshold when set to zero", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith("/accounts/a1/parts") && init?.method === "PUT") {
        return jsonResponse(200, { data: { parts: [] } });
      }
      return undefined;
    });

    const ui = userEvent.setup();
    renderApp(<PartAlerts account={account} onSaved={() => undefined} />);

    const savings = screen.getByLabelText("Savings — alert below");
    await ui.clear(savings);
    await ui.click(screen.getByRole("button", { name: "Save alert levels" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith("/accounts/a1/parts"),
      );
      const init = call?.[1] as RequestInit | undefined;
      const body = JSON.parse(String(init?.body)) as {
        parts: Array<{ name: string; lowBalanceThresholdMinor: string | null }>;
      };
      const trimmed = body.parts.find((part) => part.name === "Savings");
      expect(trimmed?.lowBalanceThresholdMinor).toBeNull();
    });
  });
});
