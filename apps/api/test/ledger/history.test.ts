import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createAccount, createVerifiedSession, newApp } from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { getTestPool, resetDb } from "../helpers/test-db";

let app: Express;
let token: string;

const SPLIT = [
  { name: "Spending", percentageBp: 6000, sortOrder: 0 },
  { name: "Savings", percentageBp: 2500, sortOrder: 1 },
  { name: "Tax", percentageBp: 1500, sortOrder: 2 },
];

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
  const session = await createVerifiedSession(app, "alice@example.com");
  token = session.accessToken;
});

function deposit(accountId: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/v1/accounts/${accountId}/deposits`)
    .set("Authorization", bearer(token))
    .send(body);
}

function history(accountId: string, query = "") {
  return request(app)
    .get(`/api/v1/accounts/${accountId}/transactions${query}`)
    .set("Authorization", bearer(token));
}

describe("GET /accounts/:id/transactions", () => {
  it("paginates newest first without overlap", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "1000", occurredAt: "2026-01-01T00:00:00.000Z" });
    await deposit(account.id, { amountMinor: "2000", occurredAt: "2026-01-02T00:00:00.000Z" });
    await deposit(account.id, { amountMinor: "3000", occurredAt: "2026-01-03T00:00:00.000Z" });

    const first = await history(account.id, "?limit=2");
    expect(first.status).toBe(200);
    expect(
      first.body.data.transactions.map((tx: { amountMinor: string }) => tx.amountMinor),
    ).toEqual(["3000", "2000"]);
    expect(first.body.data.nextCursor).toBeTruthy();

    const second = await history(
      account.id,
      `?limit=2&cursor=${encodeURIComponent(first.body.data.nextCursor as string)}`,
    );
    expect(
      second.body.data.transactions.map((tx: { amountMinor: string }) => tx.amountMinor),
    ).toEqual(["1000"]);
    expect(second.body.data.nextCursor).toBeNull();
  });

  it("filters by type and by part", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    await deposit(account.id, { amountMinor: "10000" });
    const spending = account.parts.find((part) => part.name === "Spending");
    if (!spending) throw new Error("missing part");
    await request(app)
      .post(`/api/v1/accounts/${account.id}/withdrawals`)
      .set("Authorization", bearer(token))
      .send({ entries: [{ partId: spending.id, amountMinor: "1000" }] });

    const depositsOnly = await history(account.id, "?type=deposit");
    expect(depositsOnly.body.data.transactions).toHaveLength(1);
    expect(depositsOnly.body.data.transactions[0].type).toBe("deposit");

    const spendingOnly = await history(account.id, `?partId=${spending.id}`);
    expect(spendingOnly.body.data.transactions).toHaveLength(2);
  });

  it("rejects an invalid cursor", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const response = await history(account.id, "?cursor=not-a-cursor");
    expect(response.status).toBe(422);
  });

  it("is scoped to the owner", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const bob = await createVerifiedSession(app, "bob@example.com");

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/transactions`)
      .set("Authorization", bearer(bob.accessToken));

    expect(response.status).toBe(404);
  });
});

describe("GET /accounts/:id/summary", () => {
  it("reports part balances and the total", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    await deposit(account.id, { amountMinor: "10000" });

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/summary`)
      .set("Authorization", bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data.summary.totalMinor).toBe("10000");
    expect(
      response.body.data.summary.parts.map((part: { name: string; balanceMinor: string }) => [
        part.name,
        part.balanceMinor,
      ]),
    ).toEqual([
      ["Spending", "6000"],
      ["Savings", "2500"],
      ["Tax", "1500"],
    ]);
  });

  it("reconciles the account total with the entries", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    await deposit(account.id, { amountMinor: "9999" });
    const spending = account.parts.find((part) => part.name === "Spending");
    if (!spending) throw new Error("missing part");
    await request(app)
      .post(`/api/v1/accounts/${account.id}/withdrawals`)
      .set("Authorization", bearer(token))
      .send({ entries: [{ partId: spending.id, amountMinor: "1234" }] });

    const { rows } = await getTestPool().query<{ total: string }>(
      `SELECT COALESCE(SUM(e.amount_minor), 0)::bigint AS total
       FROM transaction_entries e
       JOIN parts p ON p.id = e.part_id
       WHERE p.account_id = $1`,
      [account.id],
    );

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/summary`)
      .set("Authorization", bearer(token));

    expect(response.body.data.summary.totalMinor).toBe(rows[0]?.total);
  });
});
