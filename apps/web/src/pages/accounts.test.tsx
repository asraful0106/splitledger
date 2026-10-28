import { screen } from "@testing-library/react";
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
  balanceMinor: "0",
  parts: [{ id: "p1", name: "General", percentageBp: 10000, sortOrder: 0, balanceMinor: "0" }],
};

function session(url: string): Response | undefined {
  if (url.endsWith("/auth/refresh")) {
    return jsonResponse(200, { data: { accessToken: "t", user } });
  }
  if (url.endsWith("/auth/me")) {
    return jsonResponse(200, { data: { user } });
  }
  return undefined;
}

describe("home", () => {
  it("shows an empty state when there are no accounts", async () => {
    stubFetch((url, init) => {
      const auth = session(url);
      if (auth) return auth;
      if (url.endsWith("/accounts") && (init?.method ?? "GET") === "GET") {
        return jsonResponse(200, { data: { accounts: [] } });
      }
      return undefined;
    });

    renderApp(<App />, "/");

    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
  });

  it("renders an account card with its split", async () => {
    stubFetch((url, init) => {
      const auth = session(url);
      if (auth) return auth;
      if (url.endsWith("/accounts") && (init?.method ?? "GET") === "GET") {
        return jsonResponse(200, { data: { accounts: [account] } });
      }
      return undefined;
    });

    renderApp(<App />, "/");

    expect(await screen.findByRole("link", { name: /Salary/ })).toBeInTheDocument();
    expect(screen.getByText("General · ৳0.00")).toBeInTheDocument();
    expect(screen.getAllByText("৳0.00").length).toBeGreaterThan(0);
  });
});

describe("new account", () => {
  it("creates an account and opens its detail page", async () => {
    stubFetch((url, init) => {
      const auth = session(url);
      if (auth) return auth;
      if (url.endsWith("/accounts") && init?.method === "POST") {
        return jsonResponse(201, { data: { account } });
      }
      if (url.endsWith("/accounts/a1")) {
        return jsonResponse(200, { data: { account } });
      }
      return undefined;
    });

    const ui = userEvent.setup();
    renderApp(<App />, "/accounts/new");

    await ui.type(await screen.findByLabelText("Nickname"), "Salary");
    await ui.type(screen.getByLabelText("Bank name"), "BRAC Bank");
    await ui.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Salary" })).toBeInTheDocument();
  });
});
