import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createAccount, createVerifiedSession, newApp } from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { getTestPool, resetDb } from "../helpers/test-db";

let app: Express;
let token: string;

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
  const session = await createVerifiedSession(app, "alice@example.com");
  token = session.accessToken;
});

const SPLIT = [
  { name: "Spending", percentageBp: 6000, sortOrder: 0 },
  { name: "Savings", percentageBp: 2500, sortOrder: 1 },
  { name: "Tax", percentageBp: 1500, sortOrder: 2 },
];

function deposit(
  accountId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return request(app)
    .post(`/api/v1/accounts/${accountId}/deposits`)
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

describe("POST /accounts/:id/deposits", () => {
  it("splits a deposit across the active parts and updates balances", async () => {
    const account = await createAccount(app, token, {
      name: "Salary",
      bankName: "BRAC Bank",
      parts: SPLIT,
    });

    const response = await deposit(account.id, { amountMinor: "10000" });

    expect(response.status).toBe(201);
    expect(response.body.data.transaction).toMatchObject({
      type: "deposit",
      mode: "split",
      amountMinor: "10000",
    });
    expect(
      response.body.data.transaction.entries.map((entry: { amountMinor: string }) => entry.amountMinor),
    ).toEqual(["6000", "2500", "1500"]);
    expect(
      response.body.data.transaction.entries.every(
        (entry: { percentageBpSnapshot: number | null }) => entry.percentageBpSnapshot !== null,
      ),
    ).toBe(true);

    const state = await accountState(account.id);
    expect(state.balanceMinor).toBe("10000");
    expect(state.parts.map((part) => part.balanceMinor)).toEqual(["6000", "2500", "1500"]);
  });

  it("distributes remainders so entries always sum to the deposit", async () => {
    const account = await createAccount(app, token, {
      name: "Salary",
      bankName: "Bank",
      parts: [
        { name: "A", percentageBp: 3334, sortOrder: 0 },
        { name: "B", percentageBp: 3333, sortOrder: 1 },
        { name: "C", percentageBp: 3333, sortOrder: 2 },
      ],
    });

    const response = await deposit(account.id, { amountMinor: "100" });

    expect(
      response.body.data.transaction.entries.map((entry: { amountMinor: string }) => entry.amountMinor),
    ).toEqual(["34", "33", "33"]);
  });

  it("requires the warning acknowledgement for a single-part deposit", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    const spending = account.parts.find((part) => part.name === "Spending");
    if (!spending) throw new Error("missing part");

    const response = await deposit(account.id, {
      amountMinor: "5000",
      mode: "single_part",
      partId: spending.id,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("warning_required");
    expect(response.body.error.details).toMatchObject({
      partName: "Spending",
      amountMinor: "5000",
      percentageBp: 6000,
    });
    expect(await countTransactions()).toBe(0);
  });

  it("stores a single-part deposit when the warning is acknowledged", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    const spending = account.parts.find((part) => part.name === "Spending");
    if (!spending) throw new Error("missing part");

    const response = await deposit(account.id, {
      amountMinor: "5000",
      mode: "single_part",
      partId: spending.id,
      acknowledgedWarning: true,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.transaction).toMatchObject({ mode: "single_part" });
    expect(response.body.data.transaction.warningAcknowledgedAt).not.toBeNull();
    expect(response.body.data.transaction.entries).toHaveLength(1);
    expect(response.body.data.transaction.entries[0]).toMatchObject({
      amountMinor: "5000",
      percentageBpSnapshot: null,
    });
  });

  it("rejects invalid amounts", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });

    for (const amountMinor of ["0", "abc", "1000000001"]) {
      const response = await deposit(account.id, { amountMinor });
      expect(response.status).toBe(422);
    }
  });

  it("rejects deposits into an archived account", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await request(app)
      .post(`/api/v1/accounts/${account.id}/archive`)
      .set("Authorization", bearer(token));

    const response = await deposit(account.id, { amountMinor: "1000" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("account_archived");
  });

  it("deduplicates by Idempotency-Key", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });

    const first = await deposit(account.id, { amountMinor: "1000" }, { "Idempotency-Key": "key-1" });
    const second = await deposit(account.id, { amountMinor: "1000" }, { "Idempotency-Key": "key-1" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.transaction.id).toBe(first.body.data.transaction.id);
    expect(await countTransactions()).toBe(1);
    expect((await accountState(account.id)).balanceMinor).toBe("1000");
  });

  it("deduplicates concurrent retries with the same key", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });

    const [a, b] = await Promise.all([
      deposit(account.id, { amountMinor: "1000" }, { "Idempotency-Key": "race" }),
      deposit(account.id, { amountMinor: "1000" }, { "Idempotency-Key": "race" }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.transaction.id).toBe(b.body.data.transaction.id);
    expect(await countTransactions()).toBe(1);
  });

  it("serializes concurrent deposits and keeps balances exact", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });

    const [a, b] = await Promise.all([
      deposit(account.id, { amountMinor: "1000" }),
      deposit(account.id, { amountMinor: "2000" }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((await accountState(account.id)).balanceMinor).toBe("3000");
  });

  it("writes an audit event", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "1000" });

    const { rows } = await getTestPool().query<{ event: string }>(
      "SELECT event FROM audit_log WHERE event = 'transaction_created'",
    );
    expect(rows).toHaveLength(1);
  });
});
