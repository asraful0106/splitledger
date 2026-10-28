import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { PASSWORD, loginUser, newApp, registerUser, verifyUser } from "../helpers/factory";
import { clearMailbox, extractToken, lastMailTo } from "../helpers/mailer";
import { getTestPool, resetDb } from "../helpers/test-db";

let app: Express;

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
});

function tokenFromLastMail(email: string): string {
  const mail = lastMailTo(email);
  if (!mail) {
    throw new Error(`No mail for ${email}`);
  }
  return extractToken(mail);
}

describe("POST /auth/register", () => {
  it("creates an unverified user and sends a verification email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "alice@example.com", password: PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      email: "alice@example.com",
      emailVerified: false,
    });
    expect(response.body.data.user.id).toBeTruthy();
    expect(tokenFromLastMail("alice@example.com")).toBeTruthy();
  });

  it("rejects a duplicate email with a stable code", async () => {
    await registerUser(app, "alice@example.com");
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "ALICE@example.com", password: PASSWORD });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("email_taken");
  });

  it("rejects a short password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "short@example.com", password: "abc123" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("validation_error");
  });

  it("rejects a common password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "common@example.com", password: "password123" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("validation_error");
  });

  it("rejects a password containing the email local part", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "jonathan@example.com", password: "jonathan-secret" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("validation_error");
  });
});

describe("POST /auth/verify-email", () => {
  it("verifies the email and reports it on login", async () => {
    await registerUser(app, "alice@example.com");
    await verifyUser(app, "alice@example.com");
    const session = await loginUser(app, "alice@example.com");

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user.emailVerified).toBe(true);
  });

  it("rejects a token that was already used", async () => {
    await registerUser(app, "alice@example.com");
    const token = tokenFromLastMail("alice@example.com");

    await request(app).post("/api/v1/auth/verify-email").send({ token });
    const second = await request(app).post("/api/v1/auth/verify-email").send({ token });

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("invalid_token");
  });

  it("rejects an expired token", async () => {
    await registerUser(app, "alice@example.com");
    const token = tokenFromLastMail("alice@example.com");
    await getTestPool().query(
      "UPDATE email_tokens SET expires_at = now() - interval '1 minute' WHERE type = 'verify'",
    );

    const response = await request(app).post("/api/v1/auth/verify-email").send({ token });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("token_expired");
  });

  it("rejects an unknown token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: "not-a-real-token" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_token");
  });
});
