import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CSRF_HEADERS,
  PASSWORD,
  createVerifiedSession,
  loginUser,
  newApp,
  registerUser,
  verifyUser,
} from "../helpers/factory";
import { clearMailbox, extractToken, lastMailTo } from "../helpers/mailer";
import { getTestPool, resetDb } from "../helpers/test-db";

let app: Express;

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
});

function refreshRequest(cookie?: string) {
  const req = request(app).post("/api/v1/auth/refresh").set(CSRF_HEADERS);
  return cookie ? req.set("Cookie", cookie) : req;
}

describe("POST /auth/login", () => {
  it("returns an access token and an httpOnly refresh cookie", async () => {
    await registerUser(app, "alice@example.com");
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });

    expect(response.status).toBe(200);
    expect(typeof response.body.data.accessToken).toBe("string");

    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(setCookie.some((value) => value.includes("HttpOnly"))).toBe(true);
    expect(setCookie.some((value) => value.includes("SameSite=Strict"))).toBe(true);
  });

  it("allows login before the email is verified", async () => {
    await registerUser(app, "alice@example.com");
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user.emailVerified).toBe(false);
  });

  it("rejects a wrong password with a generic error", async () => {
    await registerUser(app, "alice@example.com");
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password-here" });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: "invalid_credentials",
      message: "Invalid email or password",
    });
  });

  it("rejects an unknown email with the same generic error", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("invalid_credentials");
  });
});

describe("POST /auth/refresh", () => {
  it("requires the CSRF header", async () => {
    const session = await createVerifiedSession(app, "alice@example.com");
    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", session.cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("forbidden");
  });

  it("rejects a missing cookie", async () => {
    const response = await refreshRequest();
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("invalid_token");
  });

  it("rotates the refresh token", async () => {
    const session = await createVerifiedSession(app, "alice@example.com");
    const response = await refreshRequest(session.cookie);

    expect(response.status).toBe(200);
    expect(typeof response.body.data.accessToken).toBe("string");

    const rotated = response.headers["set-cookie"] as unknown as string[];
    const newCookie = rotated.find((value) => value.includes("sl_refresh") || value.includes("HttpOnly"));
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(session.cookie);
  });

  it("detects reuse and revokes the whole family", async () => {
    const session = await createVerifiedSession(app, "alice@example.com");
    const rotated = await refreshRequest(session.cookie);
    const rotatedCookieHeader = rotated.headers["set-cookie"] as unknown as string[];
    const rotatedCookie = rotatedCookieHeader[0]?.split(";")[0] ?? "";

    const reuse = await refreshRequest(session.cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("token_reuse_detected");

    const afterRevoke = await refreshRequest(rotatedCookie);
    expect(afterRevoke.status).toBe(401);
  });
});

describe("logout", () => {
  it("revokes the presented refresh token", async () => {
    const session = await createVerifiedSession(app, "alice@example.com");
    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", session.cookie);

    expect(logout.status).toBe(200);

    const after = await refreshRequest(session.cookie);
    expect(after.status).toBe(401);
  });

  it("logout-all requires auth and revokes every session", async () => {
    const session = await createVerifiedSession(app, "alice@example.com");

    const unauthorized = await request(app).post("/api/v1/auth/logout-all");
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${session.accessToken}`);
    expect(authorized.status).toBe(200);

    const after = await refreshRequest(session.cookie);
    expect(after.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("returns the current user", async () => {
    const session = await createVerifiedSession(app, "alice@example.com");
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("alice@example.com");
  });

  it("rejects a missing token", async () => {
    const response = await request(app).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthenticated");
  });

  it("rejects an invalid token", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not-a-token");
    expect(response.status).toBe(401);
  });
});

describe("audit log", () => {
  it("records registration, verification, login and failed login", async () => {
    await createVerifiedSession(app, "alice@example.com");
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password-here" });

    const { rows } = await getTestPool().query<{ event: string }>(
      "SELECT event FROM audit_log ORDER BY id",
    );
    const events = rows.map((row) => row.event);

    expect(events).toEqual(
      expect.arrayContaining(["user_registered", "email_verified", "login", "login_failed"]),
    );
  });

  it("records token reuse", async () => {
    const session = await createVerifiedSession(app, "alice@example.com");
    await refreshRequest(session.cookie);
    await refreshRequest(session.cookie);

    const { rows } = await getTestPool().query<{ event: string }>(
      "SELECT event FROM audit_log WHERE event = 'token_reuse'",
    );
    expect(rows.length).toBe(1);
  });
});

describe("password reset revokes sessions", () => {
  it("signs out other sessions after a reset", async () => {
    await registerUser(app, "alice@example.com");
    await verifyUser(app, "alice@example.com");
    const session = await loginUser(app, "alice@example.com");

    const forgot = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "alice@example.com" });
    expect(forgot.status).toBe(200);

    const mail = lastMailTo("alice@example.com");
    if (!mail) {
      throw new Error("No reset mail");
    }

    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: extractToken(mail), password: "a very different passphrase" });
    expect(reset.status).toBe(200);

    const after = await refreshRequest(session.cookie);
    expect(after.status).toBe(401);
  });
});
