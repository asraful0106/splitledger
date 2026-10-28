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

function withdraw(
  accountId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return request(app)
    .post(`/api/v1/accounts/${accountId}/withdrawals`)
    .set("Authorization", bearer(token))
    .set(headers)
    .send(body);
}

async function accountState(accountId: string) {
  const response = await request(app)
    .get(`/api/v1/accounts/${accountId}`)
    .set("Authorization", bearer(token));
  return response.body.data.account as {
    balanceMinor: string;
    parts: Array<{ id: string; name: string; balanceMinor: string }>;
  };
}

async function countTransactions(): Promise<number> {
  const { rows } = await getTestPool().query<{ count: number }>(
    "SELECT count(*)::int AS count FROM transactions",
  );
  return rows[0]?.count ?? 0;
}

describe("POST /accounts/:id/withdrawals", () => {
  it("withdraws from a single part", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    await deposit(account.id, { amountMinor: "10000" });
    const savings = account.parts.find((part) => part.name === "Savings");
    if (!savings) throw new Error("missing part");

    const response = await withdraw(account.id, {
      entries: [{ partId: savings.id, amountMinor: "1000" }],
    });

    expect(response.status).toBe(201);
    expect(response.body.data.transaction).toMatchObject({
      type: "withdrawal",
      mode: "manual",
      amountMinor: "1000",
    });
    expect(response.body.data.transaction.entries).toHaveLength(1);
    expect(response.body.data.transaction.entries[0].amountMinor).toBe("-1000");

    const state = await accountState(account.id);
    expect(state.parts.map((part) => part.balanceMinor)).toEqual(["6000", "1500", "1500"]);
    expect(state.balanceMinor).toBe("9000");
  });

  it("withdraws from several parts", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    await deposit(account.id, { amountMinor: "10000" });
    const spending = account.parts.find((part) => part.name === "Spending");
    const savings = account.parts.find((part) => part.name === "Savings");
    if (!spending || !savings) throw new Error("missing part");

    const response = await withdraw(account.id, {
      entries: [
        { partId: spending.id, amountMinor: "1000" },
        { partId: savings.id, amountMinor: "500" },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.data.transaction.amountMinor).toBe("1500");
    expect(
      response.body.data.transaction.entries.map((entry: { amountMinor: string }) => entry.amountMinor),
    ).toEqual(["-1000", "-500"]);
  });

  it("rejects an overdraw and writes nothing", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    await deposit(account.id, { amountMinor: "10000" });
    const savings = account.parts.find((part) => part.name === "Savings");
    if (!savings) throw new Error("missing part");

    const before = await countTransactions();
    const response = await withdraw(account.id, {
      entries: [{ partId: savings.id, amountMinor: "2501" }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("insufficient_balance");
    expect(response.body.error.details).toMatchObject({
      partName: "Savings",
      balanceMinor: "2500",
      requestedMinor: "2501",
    });
    expect(await countTransactions()).toBe(before);
    expect((await accountState(account.id)).parts.map((part) => part.balanceMinor)).toEqual([
      "6000",
      "2500",
      "1500",
    ]);
  });

  it("rejects a withdrawal from an archived part", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    await deposit(account.id, { amountMinor: "10000" });
    const savings = account.parts.find((part) => part.name === "Savings");
    const spending = account.parts.find((part) => part.name === "Spending");
    const tax = account.parts.find((part) => part.name === "Tax");
    if (!savings || !spending || !tax) throw new Error("missing part");

    await request(app)
      .put(`/api/v1/accounts/${account.id}/parts`)
      .set("Authorization", bearer(token))
      .send({
        parts: [
          { id: spending.id, name: "Spending", percentageBp: 6000, sortOrder: 0 },
          { id: tax.id, name: "Tax", percentageBp: 4000, sortOrder: 1 },
        ],
      });

    const response = await withdraw(account.id, {
      entries: [{ partId: savings.id, amountMinor: "100" }],
    });

    expect(response.status).toBe(404);
  });

  it("rejects a withdrawal from another user's account", async () => {
    const bob = await createVerifiedSession(app, "bob@example.com");
    const bobAccount = await createAccount(app, bob.accessToken, { name: "Bob", bankName: "Bank" });

    const response = await withdraw(bobAccount.id, {
      entries: [{ partId: bobAccount.parts[0]?.id ?? "", amountMinor: "100" }],
    });

    expect(response.status).toBe(404);
  });

  it("deduplicates by Idempotency-Key", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "5000" });
    const part = account.parts[0];
    if (!part) throw new Error("missing part");
    const body = { entries: [{ partId: part.id, amountMinor: "1000" }] };

    const first = await withdraw(account.id, body, { "Idempotency-Key": "w-1" });
    const second = await withdraw(account.id, body, { "Idempotency-Key": "w-1" });

    expect(first.status).toBe(201);
    expect(second.body.data.transaction.id).toBe(first.body.data.transaction.id);
    expect((await accountState(account.id)).balanceMinor).toBe("4000");
  });

  it("writes an audit event", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "5000" });
    const part = account.parts[0];
    if (!part) throw new Error("missing part");

    await withdraw(account.id, { entries: [{ partId: part.id, amountMinor: "1000" }] });

    const { rows } = await getTestPool().query<{ event: string }>(
      "SELECT event FROM audit_log WHERE event = 'transaction_created'",
    );
    expect(rows).toHaveLength(2);
  });
});
