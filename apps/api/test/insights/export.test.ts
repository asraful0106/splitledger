import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createAccount, createVerifiedSession, newApp } from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { resetDb } from "../helpers/test-db";

let app: Express;
let token: string;

const FROM = "2026-10-01T00:00:00+06:00";
const TO = "2026-11-01T00:00:00+06:00";

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

function exportCsv(
  params: { from: string; to: string; accountId?: string; type?: "deposit" | "withdrawal" },
  authToken: string = token,
) {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.accountId) {
    search.set("accountId", params.accountId);
  }
  if (params.type) {
    search.set("type", params.type);
  }
  return request(app)
    .get(`/api/v1/insights/export.csv?${search.toString()}`)
    .set("Authorization", bearer(authToken));
}

function lines(csv: string): string[] {
  return csv.replace(/^\uFEFF/, "").trimEnd().split("\n");
}

describe("GET /insights/export.csv", () => {
  it("writes one row per entry with signed amounts", async () => {
    const account = await createAccount(app, token, {
      name: "Salary",
      bankName: "Bank",
      parts: [
        { name: "Spending", percentageBp: 6000, sortOrder: 0 },
        { name: "Savings", percentageBp: 4000, sortOrder: 1 },
      ],
    });
    const spending = account.parts.find((part) => part.name === "Spending");
    if (!spending) throw new Error("missing part");

    await deposit(account.id, { amountMinor: "10000", occurredAt: "2026-10-05T10:00:00+06:00" });
    await request(app)
      .post(`/api/v1/accounts/${account.id}/withdrawals`)
      .set("Authorization", bearer(token))
      .send({
        entries: [{ partId: spending.id, amountMinor: "1000" }],
        occurredAt: "2026-10-06T10:00:00+06:00",
      });

    const response = await exportCsv({ from: FROM, to: TO });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("attachment");

    const rows = lines(response.text);
    expect(rows[0]).toBe(
      "occurred_at,account,currency,transaction_id,type,mode,part,amount,amount_minor,note,category",
    );
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain("2026-10-05T10:00:00+06:00");
    expect(rows[1]).toContain("Salary");
    expect(rows[1]).toContain("BDT");
    expect(rows[1]).toContain("deposit");
    expect(rows[1]).toContain("6000");
    expect(rows[3]).toContain("-10.00");
    expect(rows[3]).toContain("-1000");
  });

  it("includes the account currency", async () => {
    const account = await createAccount(app, token, {
      name: "New York",
      bankName: "Bank",
      currency: "USD",
    });
    await deposit(account.id, { amountMinor: "2500", occurredAt: "2026-10-05T10:00:00+06:00" });

    const response = await exportCsv({ from: FROM, to: TO });
    const rows = lines(response.text);

    expect(rows[1]).toContain("USD");
    expect(rows[1]).toContain("25.00");
  });

  it("escapes commas, quotes and newlines", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, {
      amountMinor: "1000",
      occurredAt: "2026-10-05T10:00:00+06:00",
      note: 'Rent, "October"\nsecond line',
    });

    const response = await exportCsv({ from: FROM, to: TO });
    expect(response.text).toContain('"Rent, ""October""\nsecond line"');
  });

  it("filters by type and account", async () => {
    const first = await createAccount(app, token, { name: "First", bankName: "Bank" });
    const second = await createAccount(app, token, { name: "Second", bankName: "Bank" });
    await deposit(first.id, { amountMinor: "1000", occurredAt: "2026-10-05T10:00:00+06:00" });
    await deposit(second.id, { amountMinor: "2000", occurredAt: "2026-10-06T10:00:00+06:00" });

    const byAccount = await exportCsv({ from: FROM, to: TO, accountId: first.id });
    expect(lines(byAccount.text)).toHaveLength(2);

    const byType = await exportCsv({ from: FROM, to: TO, type: "withdrawal" });
    expect(lines(byType.text)).toHaveLength(1);
  });

  it("is scoped to the owner", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "1000", occurredAt: "2026-10-05T10:00:00+06:00" });

    const bob = await createVerifiedSession(app, "bob@example.com");
    const own = await exportCsv({ from: FROM, to: TO }, bob.accessToken);
    expect(lines(own.text)).toHaveLength(1);

    const foreign = await exportCsv(
      { from: FROM, to: TO, accountId: account.id },
      bob.accessToken,
    );
    expect(foreign.status).toBe(404);
  });
});
