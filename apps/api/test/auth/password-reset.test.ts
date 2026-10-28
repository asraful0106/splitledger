import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { PASSWORD, newApp, registerUser } from "../helpers/factory";
import { clearMailbox, extractToken, lastMailTo } from "../helpers/mailer";
import { getTestPool, resetDb } from "../helpers/test-db";

const NEW_PASSWORD = "an entirely new passphrase";

let app: Express;

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
});

async function requestReset(email: string): Promise<string> {
  const response = await request(app)
    .post("/api/v1/auth/forgot-password")
    .send({ email });
  expect(response.status).toBe(200);
  const mail = lastMailTo(email);
  if (!mail) {
    throw new Error(`No reset mail for ${email}`);
  }
  return extractToken(mail);
}

describe("POST /auth/forgot-password", () => {
  it("responds generically and sends nothing for an unknown email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ghost@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
    expect(lastMailTo("ghost@example.com")).toBeUndefined();
  });

  it("sends a reset email for a known email", async () => {
    await registerUser(app, "alice@example.com");
    const token = await requestReset("alice@example.com");
    expect(token).toBeTruthy();
  });
});

describe("POST /auth/reset-password", () => {
  it("changes the password", async () => {
    await registerUser(app, "alice@example.com");
    const token = await requestReset("alice@example.com");

    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
  });

  it("rejects a token that was already used", async () => {
    await registerUser(app, "alice@example.com");
    const token = await requestReset("alice@example.com");

    await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    const second = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "yet another passphrase" });

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("invalid_token");
  });

  it("invalidates older reset tokens when a new one is requested", async () => {
    await registerUser(app, "alice@example.com");
    const first = await requestReset("alice@example.com");
    const second = await requestReset("alice@example.com");

    const useFirst = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: first, password: NEW_PASSWORD });
    expect(useFirst.status).toBe(400);

    const useSecond = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: second, password: NEW_PASSWORD });
    expect(useSecond.status).toBe(200);
  });

  it("rejects an expired token", async () => {
    await registerUser(app, "alice@example.com");
    const token = await requestReset("alice@example.com");
    await getTestPool().query(
      "UPDATE email_tokens SET expires_at = now() - interval '1 minute' WHERE type = 'reset'",
    );

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("token_expired");
  });

  it("rejects a password that fails validation", async () => {
    await registerUser(app, "alice@example.com");
    const token = await requestReset("alice@example.com");

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "short" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("validation_error");
  });

  it("rejects an unknown token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "unknown-token", password: NEW_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_token");
  });
});
