import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createAccount, createVerifiedSession, newApp } from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { getTestPool, resetDb } from "../helpers/test-db";

let app: Express;

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
});

describe("POST /accounts", () => {
  it("creates an account with a default General part", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");

    const response = await request(app)
      .post("/api/v1/accounts")
      .set("Authorization", bearer(accessToken))
      .send({ name: "Salary", bankName: "BRAC Bank", last4: "1234" });

    expect(response.status).toBe(201);
    expect(response.body.data.account).toMatchObject({
      name: "Salary",
      bankName: "BRAC Bank",
      last4: "1234",
      currency: "BDT",
      balanceMinor: "0",
    });
    expect(response.body.data.account.parts).toHaveLength(1);
    expect(response.body.data.account.parts[0]).toMatchObject({
      name: "General",
      percentageBp: 10000,
    });
  });

  it("creates an account with an explicit valid split", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");

    const response = await request(app)
      .post("/api/v1/accounts")
      .set("Authorization", bearer(accessToken))
      .send({
        name: "Salary",
        bankName: "BRAC Bank",
        parts: [
          { name: "Spending", percentageBp: 6000, sortOrder: 0 },
          { name: "Savings", percentageBp: 2500, sortOrder: 1 },
          { name: "Tax", percentageBp: 1500, sortOrder: 2 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.account.parts.map((part: { name: string }) => part.name)).toEqual([
      "Spending",
      "Savings",
      "Tax",
    ]);
  });

  it("rejects a split that does not sum to 100%", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");

    const response = await request(app)
      .post("/api/v1/accounts")
      .set("Authorization", bearer(accessToken))
      .send({ name: "Salary", bankName: "BRAC Bank", parts: [{ name: "Only", percentageBp: 5000 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("parts_sum_invalid");
  });

  it("rejects duplicate part names", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");

    const response = await request(app)
      .post("/api/v1/accounts")
      .set("Authorization", bearer(accessToken))
      .send({
        name: "Salary",
        bankName: "BRAC Bank",
        parts: [
          { name: "Savings", percentageBp: 5000 },
          { name: "savings", percentageBp: 5000 },
        ],
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("validation_error");
  });

  it("requires authentication", async () => {
    const response = await request(app).post("/api/v1/accounts").send({ name: "x", bankName: "y" });
    expect(response.status).toBe(401);
  });
});

describe("account listing and lifecycle", () => {
  it("hides archived accounts by default", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const kept = await createAccount(app, accessToken, { name: "Kept", bankName: "Bank A" });
    const archived = await createAccount(app, accessToken, { name: "Archived", bankName: "Bank B" });

    await request(app)
      .post(`/api/v1/accounts/${archived.id}/archive`)
      .set("Authorization", bearer(accessToken));

    const list = await request(app).get("/api/v1/accounts").set("Authorization", bearer(accessToken));
    expect(list.body.data.accounts.map((account: { id: string }) => account.id)).toEqual([kept.id]);

    const withArchived = await request(app)
      .get("/api/v1/accounts?includeArchived=true")
      .set("Authorization", bearer(accessToken));
    expect(withArchived.body.data.accounts).toHaveLength(2);
  });

  it("returns a single account with its parts", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}`)
      .set("Authorization", bearer(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.account.parts).toHaveLength(1);
  });

  it("updates account fields", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    const response = await request(app)
      .patch(`/api/v1/accounts/${account.id}`)
      .set("Authorization", bearer(accessToken))
      .send({ name: "Renamed", last4: null });

    expect(response.status).toBe(200);
    expect(response.body.data.account).toMatchObject({ name: "Renamed", last4: null });
  });

  it("rejects an empty patch", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    const response = await request(app)
      .patch(`/api/v1/accounts/${account.id}`)
      .set("Authorization", bearer(accessToken))
      .send({});

    expect(response.status).toBe(422);
  });
});

describe("authorization isolation", () => {
  it("hides another user's account from every endpoint", async () => {
    const alice = await createVerifiedSession(app, "alice@example.com");
    const bob = await createVerifiedSession(app, "bob@example.com");
    const bobAccount = await createAccount(app, bob.accessToken, {
      name: "Bob",
      bankName: "Bank",
    });

    const get = await request(app)
      .get(`/api/v1/accounts/${bobAccount.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(get.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/v1/accounts/${bobAccount.id}`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ name: "Hack" });
    expect(patch.status).toBe(404);

    const archive = await request(app)
      .post(`/api/v1/accounts/${bobAccount.id}/archive`)
      .set("Authorization", bearer(alice.accessToken));
    expect(archive.status).toBe(404);

    const parts = await request(app)
      .get(`/api/v1/accounts/${bobAccount.id}/parts`)
      .set("Authorization", bearer(alice.accessToken));
    expect(parts.status).toBe(404);

    const put = await request(app)
      .put(`/api/v1/accounts/${bobAccount.id}/parts`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ parts: [{ name: "X", percentageBp: 10000 }] });
    expect(put.status).toBe(404);
  });

  it("does not list another user's accounts", async () => {
    const alice = await createVerifiedSession(app, "alice@example.com");
    const bob = await createVerifiedSession(app, "bob@example.com");
    await createAccount(app, bob.accessToken);

    const list = await request(app).get("/api/v1/accounts").set("Authorization", bearer(alice.accessToken));

    expect(list.body.data.accounts).toEqual([]);
  });
});

describe("audit log", () => {
  it("records account lifecycle events", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    await request(app)
      .post(`/api/v1/accounts/${account.id}/archive`)
      .set("Authorization", bearer(accessToken));

    const { rows } = await getTestPool().query<{ event: string }>(
      "SELECT event FROM audit_log WHERE event LIKE 'account_%' ORDER BY id",
    );
    expect(rows.map((row) => row.event)).toEqual(["account_created", "account_archived"]);
  });
});
