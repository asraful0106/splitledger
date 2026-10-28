import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CSRF_HEADERS,
  PASSWORD,
  bearer,
  createVerifiedSession,
  newApp,
} from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { resetDb } from "../helpers/test-db";

let app: Express;

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
});

describe("authorization isolation", () => {
  it("scopes /me to the authenticated user", async () => {
    const alice = await createVerifiedSession(app, "alice@example.com");
    const bob = await createVerifiedSession(app, "bob@example.com");

    const meAlice = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", bearer(alice.accessToken));
    const meBob = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", bearer(bob.accessToken));

    expect(meAlice.body.data.user.email).toBe("alice@example.com");
    expect(meBob.body.data.user.email).toBe("bob@example.com");
    expect(meAlice.body.data.user.id).not.toBe(meBob.body.data.user.id);
  });

  it("refresh returns the session owner", async () => {
    const alice = await createVerifiedSession(app, "alice@example.com");

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set(CSRF_HEADERS)
      .set("Cookie", alice.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("alice@example.com");
  });
});

describe("rate limiting", () => {
  it("rejects attempts past the login limit", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "nobody@example.com", password: PASSWORD });
      expect(response.status).toBe(401);
    }

    const limited = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: PASSWORD });

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
  });
});
