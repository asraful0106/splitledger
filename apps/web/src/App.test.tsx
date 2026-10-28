import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { jsonResponse, stubFetch } from "./test/fetch-mock";
import { renderApp } from "./test/render";

const user = {
  id: "u1",
  email: "alice@example.com",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function anonymousRefresh(url: string) {
  return url.endsWith("/auth/refresh")
    ? jsonResponse(401, { error: { code: "invalid_token", message: "no" } })
    : undefined;
}

describe("routing", () => {
  it("redirects an anonymous visitor to the login screen", async () => {
    stubFetch((url) => anonymousRefresh(url));
    renderApp(<App />, "/");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("restores a session from the refresh cookie", async () => {
    stubFetch((url) => {
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(200, { data: { accessToken: "t", user } });
      }
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, { data: { user } });
      }
      if (url.endsWith("/accounts")) {
        return jsonResponse(200, { data: { accounts: [] } });
      }
      return undefined;
    });

    renderApp(<App />, "/");

    expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
  });
});

describe("login", () => {
  it("shows validation messages for empty input", async () => {
    stubFetch((url) => anonymousRefresh(url));
    const ui = userEvent.setup();
    renderApp(<App />, "/login");

    await ui.click(await screen.findByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(await screen.findByText("Password is required")).toBeInTheDocument();
  });

  it("signs in and lands on home", async () => {
    stubFetch((url) => {
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(401, { error: { code: "invalid_token", message: "no" } });
      }
      if (url.endsWith("/auth/login")) {
        return jsonResponse(200, { data: { user, accessToken: "t" } });
      }
      if (url.endsWith("/auth/me")) {
        return jsonResponse(200, { data: { user } });
      }
      if (url.endsWith("/accounts")) {
        return jsonResponse(200, { data: { accounts: [] } });
      }
      return undefined;
    });

    const ui = userEvent.setup();
    renderApp(<App />, "/login");

    await ui.type(await screen.findByLabelText("Email"), "alice@example.com");
    await ui.type(screen.getByLabelText("Password"), "correct horse battery");
    await ui.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("link", { name: "Add account" })).toBeInTheDocument();
  });
});

describe("register", () => {
  it("shows the verify-email state after signing up", async () => {
    stubFetch((url) => {
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(401, { error: { code: "invalid_token", message: "no" } });
      }
      if (url.endsWith("/auth/register")) {
        return jsonResponse(201, { data: { user: { ...user, emailVerified: false } } });
      }
      return undefined;
    });

    const ui = userEvent.setup();
    renderApp(<App />, "/register");

    await ui.type(await screen.findByLabelText("Email"), "new@example.com");
    await ui.type(screen.getByLabelText("Password"), "correct horse battery");
    await ui.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });
});
