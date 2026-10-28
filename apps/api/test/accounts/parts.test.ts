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

function partByName(
  account: { parts: Array<{ id: string; name: string; percentageBp: number }> },
  name: string,
): { id: string; name: string; percentageBp: number } {
  const part = account.parts.find((candidate) => candidate.name === name);
  if (!part) {
    throw new Error(`Part ${name} not found`);
  }
  return part;
}

describe("PUT /accounts/:id/parts", () => {
  it("replaces the active set with new parts", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    const response = await request(app)
      .put(`/api/v1/accounts/${account.id}/parts`)
      .set("Authorization", bearer(accessToken))
      .send({
        parts: [
          { name: "Spending", percentageBp: 6000, sortOrder: 0 },
          { name: "Savings", percentageBp: 2500, sortOrder: 1 },
          { name: "Tax", percentageBp: 1500, sortOrder: 2 },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.parts).toHaveLength(3);
    expect(response.body.data.parts.every((part: { id?: string }) => part.id)).toBe(true);

    const { rows } = await getTestPool().query<{ total: number }>(
      "SELECT COALESCE(SUM(percentage_bp), 0)::int AS total FROM parts WHERE account_id = $1 AND archived_at IS NULL",
      [account.id],
    );
    expect(rows[0]?.total).toBe(10000);
  });

  it("soft-archives parts dropped from the payload", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken, {
      name: "Split",
      bankName: "Bank",
      parts: [
        { name: "Keep", percentageBp: 5000, sortOrder: 0 },
        { name: "Drop", percentageBp: 5000, sortOrder: 1 },
      ],
    });
    const keep = partByName(account, "Keep");

    const response = await request(app)
      .put(`/api/v1/accounts/${account.id}/parts`)
      .set("Authorization", bearer(accessToken))
      .send({ parts: [{ id: keep.id, name: "Keep", percentageBp: 10000, sortOrder: 0 }] });

    expect(response.status).toBe(200);
    expect(response.body.data.parts).toHaveLength(1);

    const { rows } = await getTestPool().query<{ name: string; archived: boolean }>(
      "SELECT name, (archived_at IS NOT NULL) AS archived FROM parts WHERE account_id = $1 ORDER BY name ASC",
      [account.id],
    );
    expect(rows).toEqual([
      { name: "Drop", archived: true },
      { name: "Keep", archived: false },
    ]);
  });

  it("rejects a set that does not sum to 100%", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    const response = await request(app)
      .put(`/api/v1/accounts/${account.id}/parts`)
      .set("Authorization", bearer(accessToken))
      .send({ parts: [{ name: "Only", percentageBp: 6000 }] });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "parts_sum_invalid",
      details: { sum: 6000, expected: 10000 },
    });
  });

  it("rejects an out-of-range percentage", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    const response = await request(app)
      .put(`/api/v1/accounts/${account.id}/parts`)
      .set("Authorization", bearer(accessToken))
      .send({ parts: [{ name: "Too big", percentageBp: 12000 }] });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("validation_error");
  });

  it("rejects an empty parts list", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    const response = await request(app)
      .put(`/api/v1/accounts/${account.id}/parts`)
      .set("Authorization", bearer(accessToken))
      .send({ parts: [] });

    expect(response.status).toBe(422);
  });

  it("rejects a part that belongs to another account", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const first = await createAccount(app, accessToken, { name: "First", bankName: "Bank" });
    const second = await createAccount(app, accessToken, { name: "Second", bankName: "Bank" });
    const foreignPart = partByName(second, "General");

    const response = await request(app)
      .put(`/api/v1/accounts/${first.id}/parts`)
      .set("Authorization", bearer(accessToken))
      .send({ parts: [{ id: foreignPart.id, name: "General", percentageBp: 10000 }] });

    expect(response.status).toBe(404);
  });

  it("records parts_updated in the audit log", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    await request(app)
      .put(`/api/v1/accounts/${account.id}/parts`)
      .set("Authorization", bearer(accessToken))
      .send({ parts: [{ name: "Everything", percentageBp: 10000 }] });

    const { rows } = await getTestPool().query<{ event: string }>(
      "SELECT event FROM audit_log WHERE event = 'parts_updated'",
    );
    expect(rows).toHaveLength(1);
  });

  it("lists active parts via GET", async () => {
    const { accessToken } = await createVerifiedSession(app, "alice@example.com");
    const account = await createAccount(app, accessToken);

    const response = await request(app)
      .get(`/api/v1/accounts/${account.id}/parts`)
      .set("Authorization", bearer(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.parts).toHaveLength(1);
  });
});
