import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createAccount, createVerifiedSession, newApp } from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { resetDb } from "../helpers/test-db";

let app: Express;
let token: string;

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
  const session = await createVerifiedSession(app, "alice@example.com");
  token = session.accessToken;
});

function createAccountWith(currency: string, name = "Account") {
  return request(app)
    .post("/api/v1/accounts")
    .set("Authorization", bearer(token))
    .send({ name, bankName: "Bank", currency });
}

function patchAccount(accountId: string, body: Record<string, unknown>) {
  return request(app)
    .patch(`/api/v1/accounts/${accountId}`)
    .set("Authorization", bearer(token))
    .send(body);
}

function deposit(accountId: string) {
  return request(app)
    .post(`/api/v1/accounts/${accountId}/deposits`)
    .set("Authorization", bearer(token))
    .send({ amountMinor: "1000" });
}

describe("account currency", () => {
  it("creates accounts in a supported currency", async () => {
    const response = await createAccountWith("USD", "New York");

    expect(response.status).toBe(201);
    expect(response.body.data.account.currency).toBe("USD");
  });

  it("defaults to BDT", async () => {
    const response = await request(app)
      .post("/api/v1/accounts")
      .set("Authorization", bearer(token))
      .send({ name: "Dhaka", bankName: "Bank" });

    expect(response.body.data.account.currency).toBe("BDT");
  });

  it("rejects an unsupported currency", async () => {
    const response = await createAccountWith("JPY");
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("validation_error");
  });

  it("allows changing the currency while the account has no transactions", async () => {
    const created = await createAccountWith("BDT", "Fresh");
    const accountId = created.body.data.account.id as string;

    const response = await patchAccount(accountId, { currency: "USD" });

    expect(response.status).toBe(200);
    expect(response.body.data.account.currency).toBe("USD");
    expect(response.body.data.account.hasTransactions).toBe(false);
  });

  it("locks the currency once the account has a transaction", async () => {
    const account = await createAccount(app, token, { name: "Daily", bankName: "Bank" });
    await deposit(account.id);

    const blocked = await patchAccount(account.id, { currency: "USD" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe("currency_locked");

    const sameCurrency = await patchAccount(account.id, { currency: "BDT" });
    expect(sameCurrency.status).toBe(200);

    const otherFields = await patchAccount(account.id, { name: "Renamed", currency: "BDT" });
    expect(otherFields.status).toBe(200);
    expect(otherFields.body.data.account.name).toBe("Renamed");
  });

  it("reports hasTransactions on the account view", async () => {
    const account = await createAccount(app, token, { name: "Daily", bankName: "Bank" });
    expect(account.parts.length).toBeGreaterThan(0);

    const before = await request(app)
      .get(`/api/v1/accounts/${account.id}`)
      .set("Authorization", bearer(token));
    expect(before.body.data.account.hasTransactions).toBe(false);

    await deposit(account.id);

    const after = await request(app)
      .get(`/api/v1/accounts/${account.id}`)
      .set("Authorization", bearer(token));
    expect(after.body.data.account.hasTransactions).toBe(true);
  });

  it("carries the account currency on transactions", async () => {
    const account = await createAccountWith("EUR", "Berlin");
    const accountId = account.body.data.account.id as string;

    const created = await request(app)
      .post(`/api/v1/accounts/${accountId}/deposits`)
      .set("Authorization", bearer(token))
      .send({ amountMinor: "1000" });

    expect(created.body.data.transaction.currency).toBe("EUR");
  });
});
