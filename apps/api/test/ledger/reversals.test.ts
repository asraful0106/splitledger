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

function withdraw(accountId: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/v1/accounts/${accountId}/withdrawals`)
    .set("Authorization", bearer(token))
    .send(body);
}

function reverse(transactionId: string, authToken: string = token) {
  return request(app)
    .post(`/api/v1/transactions/${transactionId}/reverse`)
    .set("Authorization", bearer(authToken));
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

describe("POST /transactions/:id/reverse", () => {
  it("reverses a deposit with an opposite-type transaction", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    const created = await deposit(account.id, { amountMinor: "10000" });
    const originalId = created.body.data.transaction.id as string;

    const reversal = await reverse(originalId);

    expect(reversal.status).toBe(201);
    expect(reversal.body.data.transaction).toMatchObject({
      type: "withdrawal",
      amountMinor: "10000",
      reversesTransactionId: originalId,
      isReversal: true,
    });
    expect(
      reversal.body.data.transaction.entries.map((entry: { amountMinor: string }) => entry.amountMinor),
    ).toEqual(["-6000", "-2500", "-1500"]);

    const state = await accountState(account.id);
    expect(state.balanceMinor).toBe("0");
    expect(state.parts.map((part) => part.balanceMinor)).toEqual(["0", "0", "0"]);
  });

  it("leaves the original transaction untouched", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const created = await deposit(account.id, { amountMinor: "10000" });
    const originalId = created.body.data.transaction.id as string;

    await reverse(originalId);

    const { rows } = await getTestPool().query<{
      amount_minor: string;
      type: string;
      reverses_transaction_id: string | null;
    }>("SELECT amount_minor, type, reverses_transaction_id FROM transactions WHERE id = $1", [
      originalId,
    ]);
    expect(rows[0]).toMatchObject({
      amount_minor: "10000",
      type: "deposit",
      reverses_transaction_id: null,
    });

    const entries = await getTestPool().query<{ amount_minor: string }>(
      "SELECT amount_minor FROM transaction_entries WHERE transaction_id = $1 ORDER BY created_at ASC",
      [originalId],
    );
    expect(entries.rows.map((row) => row.amount_minor)).toEqual(["10000"]);
  });

  it("reverses a withdrawal", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "5000" });
    const part = account.parts[0];
    if (!part) throw new Error("missing part");

    const withdrawal = await withdraw(account.id, {
      entries: [{ partId: part.id, amountMinor: "2000" }],
    });
    const withdrawalId = withdrawal.body.data.transaction.id as string;

    const reversal = await reverse(withdrawalId);

    expect(reversal.status).toBe(201);
    expect(reversal.body.data.transaction).toMatchObject({ type: "deposit", amountMinor: "2000" });
    expect((await accountState(account.id)).balanceMinor).toBe("5000");
  });

  it("rejects reversing the same transaction twice", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const created = await deposit(account.id, { amountMinor: "1000" });
    const originalId = created.body.data.transaction.id as string;

    await reverse(originalId);
    const second = await reverse(originalId);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("already_reversed");
  });

  it("rejects a reversal that would overdraw a part", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    const created = await deposit(account.id, { amountMinor: "10000" });
    const originalId = created.body.data.transaction.id as string;
    const spending = account.parts.find((part) => part.name === "Spending");
    if (!spending) throw new Error("missing part");

    await withdraw(account.id, { entries: [{ partId: spending.id, amountMinor: "6000" }] });
    const response = await reverse(originalId);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("insufficient_balance");
  });

  it("does not let another user reverse a transaction", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const created = await deposit(account.id, { amountMinor: "1000" });
    const originalId = created.body.data.transaction.id as string;

    const bob = await createVerifiedSession(app, "bob@example.com");
    const response = await reverse(originalId, bob.accessToken);

    expect(response.status).toBe(404);
  });

  it("writes an audit event", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const created = await deposit(account.id, { amountMinor: "1000" });
    await reverse(created.body.data.transaction.id as string);

    const { rows } = await getTestPool().query<{ event: string }>(
      "SELECT event FROM audit_log WHERE event = 'transaction_reversed'",
    );
    expect(rows).toHaveLength(1);
  });
});
