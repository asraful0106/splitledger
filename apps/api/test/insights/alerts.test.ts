import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createAccount, createVerifiedSession, newApp } from "../helpers/factory";
import { clearMailbox } from "../helpers/mailer";
import { resetDb } from "../helpers/test-db";

let app: Express;
let token: string;

type AccountPart = {
  id: string;
  name: string;
  percentageBp: number;
  lowBalanceThresholdMinor?: string | null;
};

beforeEach(async () => {
  app = newApp();
  await resetDb();
  clearMailbox();
  const session = await createVerifiedSession(app, "alice@example.com");
  token = session.accessToken;
});

function putParts(
  accountId: string,
  parts: AccountPart[],
  thresholds: Record<string, string | null | undefined> = {},
  authToken: string = token,
) {
  return request(app)
    .put(`/api/v1/accounts/${accountId}/parts`)
    .set("Authorization", bearer(authToken))
    .send({
      parts: parts.map((part, index) => {
        const threshold = thresholds[part.name];
        return {
          id: part.id,
          name: part.name,
          percentageBp: part.percentageBp,
          sortOrder: index,
          ...(threshold !== undefined ? { lowBalanceThresholdMinor: threshold } : {}),
        };
      }),
    });
}

function deposit(accountId: string, amountMinor: string) {
  return request(app)
    .post(`/api/v1/accounts/${accountId}/deposits`)
    .set("Authorization", bearer(token))
    .send({ amountMinor });
}

function alerts(authToken: string = token) {
  return request(app)
    .get("/api/v1/insights/alerts")
    .set("Authorization", bearer(authToken));
}

async function makeAccount(name = "Salary") {
  return createAccount(app, token, { name, bankName: "Bank" });
}

describe("part low-balance thresholds", () => {
  it("sets, preserves and clears the threshold", async () => {
    const account = await makeAccount();
    const part = account.parts[0];
    if (!part) throw new Error("missing part");

    const set = await putParts(account.id, account.parts, { General: "5000" });
    expect(set.status).toBe(200);
    expect(set.body.data.parts[0].lowBalanceThresholdMinor).toBe("5000");

    // Omitting the field keeps the existing threshold.
    const preserved = await putParts(account.id, account.parts);
    expect(preserved.body.data.parts[0].lowBalanceThresholdMinor).toBe("5000");

    const cleared = await putParts(account.id, account.parts, { General: null });
    expect(cleared.body.data.parts[0].lowBalanceThresholdMinor).toBeNull();
  });
});

describe("GET /insights/alerts", () => {
  it("alerts when a part falls below its threshold", async () => {
    const account = await makeAccount();
    const part = account.parts[0];
    if (!part) throw new Error("missing part");
    await putParts(account.id, account.parts, { General: "5000" });
    await deposit(account.id, "4000");

    const response = await alerts();

    expect(response.status).toBe(200);
    expect(response.body.data.alerts).toHaveLength(1);
    expect(response.body.data.alerts[0]).toMatchObject({
      accountName: "Salary",
      partName: "General",
      balanceMinor: "4000",
      thresholdMinor: "5000",
    });
  });

  it("does not alert at or above the threshold", async () => {
    const account = await makeAccount();
    await putParts(account.id, account.parts, { General: "5000" });
    await deposit(account.id, "5000");

    const response = await alerts();
    expect(response.body.data.alerts).toHaveLength(0);
  });

  it("ignores parts without a threshold", async () => {
    const account = await makeAccount();
    await deposit(account.id, "1000");

    const response = await alerts();
    expect(response.body.data.alerts).toHaveLength(0);
  });

  it("ignores archived accounts", async () => {
    const account = await makeAccount();
    await putParts(account.id, account.parts, { General: "5000" });
    await deposit(account.id, "1000");
    await request(app)
      .post(`/api/v1/accounts/${account.id}/archive`)
      .set("Authorization", bearer(token));

    const response = await alerts();
    expect(response.body.data.alerts).toHaveLength(0);
  });

  it("is scoped to the owner", async () => {
    const account = await makeAccount();
    await putParts(account.id, account.parts, { General: "5000" });
    await deposit(account.id, "1000");

    const bob = await createVerifiedSession(app, "bob@example.com");
    const response = await alerts(bob.accessToken);
    expect(response.body.data.alerts).toHaveLength(0);
  });
});
