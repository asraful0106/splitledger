import type { Express } from "express";
import { beforeEach, describe, expect, it } from "vitest";
import { createAccount, createVerifiedSession, newApp } from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { getTestPool, resetDb } from "../helpers/test-db";

let app: Express;
let token: string;
let userId: string;

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
  const session = await createVerifiedSession(app, "alice@example.com");
  token = session.accessToken;
  const { rows } = await getTestPool().query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    ["alice@example.com"],
  );
  userId = rows[0]?.id ?? "";
});

async function insertTransactionWithEntry(accountId: string, partId: string, entryMinor: string) {
  const client = await getTestPool().connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO transactions (account_id, user_id, type, amount_minor, mode)
       VALUES ($1, $2, 'deposit', 10000, 'split') RETURNING id`,
      [accountId, userId],
    );
    await client.query(
      `INSERT INTO transaction_entries (transaction_id, part_id, amount_minor)
       VALUES ($1, $2, $3)`,
      [inserted.rows[0]?.id, partId, entryMinor],
    );
    return await client.query("COMMIT");
  } finally {
    client.release();
  }
}

describe("ledger invariant (database)", () => {
  it("rejects entries that do not balance the transaction", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const part = account.parts[0];
    if (!part) throw new Error("missing part");

    await expect(insertTransactionWithEntry(account.id, part.id, "5000")).rejects.toThrow();
  });

  it("accepts entries that do balance", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const part = account.parts[0];
    if (!part) throw new Error("missing part");

    await expect(insertTransactionWithEntry(account.id, part.id, "10000")).resolves.toBeDefined();
  });
});
