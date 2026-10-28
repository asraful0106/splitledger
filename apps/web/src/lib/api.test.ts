import { beforeEach, describe, expect, it } from "vitest";
import { jsonResponse, stubFetch } from "../test/fetch-mock";
import { ApiError, apiFetch } from "./api";
import { getAccessToken, setAccessToken } from "./token-store";

describe("apiFetch", () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it("refreshes once and retries after a 401", async () => {
    let meCalls = 0;
    const fetchMock = stubFetch((url) => {
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse(200, { data: { accessToken: "fresh" } });
      }
      if (url.endsWith("/auth/me")) {
        meCalls += 1;
        return meCalls === 1
          ? jsonResponse(401, { error: { code: "unauthenticated", message: "no" } })
          : jsonResponse(200, { data: { user: { id: "1" } } });
      }
      return undefined;
    });

    const result = await apiFetch<{ user: { id: string } }>("/auth/me");

    expect(result.user.id).toBe("1");
    expect(getAccessToken()).toBe("fresh");

    const refreshCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("clears the token when the refresh fails", async () => {
    setAccessToken("stale");
    stubFetch((url) =>
      url.endsWith("/auth/refresh")
        ? jsonResponse(401, { error: { code: "invalid_token", message: "no" } })
        : jsonResponse(401, { error: { code: "unauthenticated", message: "no" } }),
    );

    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
  });

  it("shares a single refresh across concurrent 401s", async () => {
    let refreshCalls = 0;
    stubFetch((url) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, { data: { accessToken: "t" } });
      }
      return jsonResponse(401, { error: { code: "unauthenticated", message: "no" } });
    });

    await Promise.allSettled([apiFetch("/auth/me"), apiFetch("/auth/me")]);

    expect(refreshCalls).toBe(1);
  });

  it("maps an error body to an ApiError", async () => {
    stubFetch(() => jsonResponse(409, { error: { code: "email_taken", message: "taken" } }));

    await expect(
      apiFetch("/auth/register", { method: "POST", body: { email: "a@b.co" }, auth: false }),
    ).rejects.toMatchObject({ code: "email_taken", status: 409 });
  });
});
