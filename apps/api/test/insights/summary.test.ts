import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createAccount, createVerifiedSession, newApp } from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { resetDb } from "../helpers/test-db";

let app: Express;
let token: string;

const SPLIT = [
  { name: "Spending", percentageBp: 6000, sortOrder: 0 },
  { name: "Savings", percentageBp: 2500, sortOrder: 1 },
  { name: "Tax", percentageBp: 1500, sortOrder: 2 },
];

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

function withdraw(accountId: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/v1/accounts/${accountId}/withdrawals`)
    .set("Authorization", bearer(token))
    .send(body);
}

function summary(
  params: { from: string; to: string; accountId?: string; granularity?: string },
  authToken: string = token,
) {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.accountId) {
    search.set("accountId", params.accountId);
  }
  if (params.granularity) {
    search.set("granularity", params.granularity);
  }
  return request(app)
    .get(`/api/v1/insights/summary?${search.toString()}`)
    .set("Authorization", bearer(authToken));
}

type Bucket = {
  currency: string;
  totals: { inflowMinor: string; outflowMinor: string; netMinor: string };
  parts: Array<{
    partName: string;
    inflowMinor: string;
    outflowMinor: string;
    netMinor: string;
  }>;
  series: Array<{ bucket: string; inflowMinor: string }>;
};

function firstBucket(body: { data: { buckets: Bucket[] } }): Bucket {
  const bucket = body.data.buckets[0];
  if (!bucket) throw new Error("no bucket");
  return bucket;
}

describe("GET /insights/summary", () => {
  it("aggregates inflow, outflow and net per part", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank", parts: SPLIT });
    const spending = account.parts.find((part) => part.name === "Spending");
    if (!spending) throw new Error("missing part");

    await deposit(account.id, { amountMinor: "10000", occurredAt: "2026-10-05T10:00:00+06:00" });
    await withdraw(account.id, {
      entries: [{ partId: spending.id, amountMinor: "1000" }],
      occurredAt: "2026-10-06T10:00:00+06:00",
    });

    const response = await summary({ from: FROM, to: TO });

    expect(response.status).toBe(200);
    expect(response.body.data.buckets).toHaveLength(1);
    const bucket = firstBucket(response.body);
    expect(bucket.currency).toBe("BDT");
    expect(bucket.totals).toEqual({
      inflowMinor: "10000",
      outflowMinor: "1000",
      netMinor: "9000",
    });
    expect(
      bucket.parts.map((part) => [
        part.partName,
        part.inflowMinor,
        part.outflowMinor,
        part.netMinor,
      ]),
    ).toEqual([
      ["Savings", "2500", "0", "2500"],
      ["Spending", "6000", "1000", "5000"],
      ["Tax", "1500", "0", "1500"],
    ]);
  });

  it("includes the start boundary and excludes the end boundary", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });

    await deposit(account.id, { amountMinor: "1000", occurredAt: FROM });
    await deposit(account.id, { amountMinor: "2000", occurredAt: TO });

    const response = await summary({ from: FROM, to: TO });

    expect(firstBucket(response.body).totals.inflowMinor).toBe("1000");
  });

  it("filters by account", async () => {
    const first = await createAccount(app, token, { name: "First", bankName: "Bank" });
    const second = await createAccount(app, token, { name: "Second", bankName: "Bank" });
    await deposit(first.id, { amountMinor: "1000", occurredAt: "2026-10-05T10:00:00+06:00" });
    await deposit(second.id, { amountMinor: "2000", occurredAt: "2026-10-06T10:00:00+06:00" });

    const response = await summary({ from: FROM, to: TO, accountId: first.id });

    const bucket = firstBucket(response.body);
    expect(bucket.totals.inflowMinor).toBe("1000");
    expect(bucket.parts).toHaveLength(1);
  });

  it("groups months in Dhaka time by default", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "1000", occurredAt: "2026-10-15T12:00:00+06:00" });
    // 02:00 Dhaka on 1 Nov is still 31 Oct in UTC — it must land in the November bucket.
    await deposit(account.id, { amountMinor: "2000", occurredAt: "2026-11-01T02:00:00+06:00" });

    const response = await summary({
      from: "2026-10-01T00:00:00+06:00",
      to: "2026-12-01T00:00:00+06:00",
    });

    const bucket = firstBucket(response.body);
    expect(bucket.series.map((point) => point.bucket)).toEqual(["2026-10", "2026-11"]);
    expect(bucket.series.map((point) => point.inflowMinor)).toEqual(["1000", "2000"]);
  });

  it("groups by day in Dhaka time when asked", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "1000", occurredAt: "2026-10-05T10:00:00+06:00" });
    await deposit(account.id, { amountMinor: "2000", occurredAt: "2026-10-06T09:00:00+06:00" });
    // 02:00 Dhaka on 1 Nov is 31 Oct in UTC — the day bucket must be 1 Nov.
    await deposit(account.id, { amountMinor: "3000", occurredAt: "2026-11-01T02:00:00+06:00" });

    const response = await summary({
      from: "2026-10-01T00:00:00+06:00",
      to: "2026-12-01T00:00:00+06:00",
      granularity: "day",
    });

    const bucket = firstBucket(response.body);
    expect(bucket.series.map((point) => point.bucket)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-11-01",
    ]);
  });

  it("groups by ISO week when asked", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    // 2026-10-05 is a Monday; the 7th is in the same week.
    await deposit(account.id, { amountMinor: "1000", occurredAt: "2026-10-05T10:00:00+06:00" });
    await deposit(account.id, { amountMinor: "2000", occurredAt: "2026-10-07T10:00:00+06:00" });
    await deposit(account.id, { amountMinor: "3000", occurredAt: "2026-10-13T10:00:00+06:00" });

    const response = await summary({ from: FROM, to: TO, granularity: "week" });

    const bucket = firstBucket(response.body);
    expect(bucket.series.map((point) => point.bucket)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(bucket.series.map((point) => point.inflowMinor)).toEqual(["3000", "3000"]);
  });

  it("rejects an unsupported granularity", async () => {
    const response = await summary({ from: FROM, to: TO, granularity: "year" });
    expect(response.status).toBe(422);
  });

  it("counts a reversal as its own transaction type", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    const created = await deposit(account.id, {
      amountMinor: "1000",
      occurredAt: "2026-10-05T10:00:00+06:00",
    });
    await request(app)
      .post(`/api/v1/transactions/${created.body.data.transaction.id as string}/reverse`)
      .set("Authorization", bearer(token));

    const response = await summary({ from: FROM, to: TO });

    expect(firstBucket(response.body).totals).toEqual({
      inflowMinor: "1000",
      outflowMinor: "1000",
      netMinor: "0",
    });
  });

  it("never mixes currencies in one bucket", async () => {
    const bdt = await createAccount(app, token, { name: "Dhaka", bankName: "Bank" });
    const usd = await createAccount(app, token, {
      name: "New York",
      bankName: "Bank",
      currency: "USD",
    });
    await deposit(bdt.id, { amountMinor: "10000", occurredAt: "2026-10-05T10:00:00+06:00" });
    await deposit(usd.id, { amountMinor: "2500", occurredAt: "2026-10-06T10:00:00+06:00" });

    const response = await summary({ from: FROM, to: TO });
    const buckets = response.body.data.buckets as Bucket[];

    expect(buckets).toHaveLength(2);
    expect(buckets.map((bucket) => bucket.currency)).toEqual(["BDT", "USD"]);
    expect(buckets.map((bucket) => bucket.totals.inflowMinor)).toEqual(["10000", "2500"]);
  });

  it("rejects an inverted range", async () => {
    const response = await summary({ from: TO, to: FROM });
    expect(response.status).toBe(422);
  });

  it("is scoped to the owner", async () => {
    const account = await createAccount(app, token, { name: "Salary", bankName: "Bank" });
    await deposit(account.id, { amountMinor: "1000", occurredAt: "2026-10-05T10:00:00+06:00" });

    const bob = await createVerifiedSession(app, "bob@example.com");
    const own = await summary({ from: FROM, to: TO }, bob.accessToken);
    expect(own.body.data.buckets).toEqual([]);

    const foreign = await summary(
      { from: FROM, to: TO, accountId: account.id },
      bob.accessToken,
    );
    expect(foreign.status).toBe(404);
  });
});
