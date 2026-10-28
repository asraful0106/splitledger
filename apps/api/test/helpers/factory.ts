import type { Express } from "express";
import request from "supertest";
import { createApp } from "../../src/app";
import { env } from "../../src/env";
import { extractToken, lastMailTo } from "./mailer";

export const PASSWORD = "correct horse battery staple";

export const CSRF_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

export function newApp(): Express {
  return createApp();
}

export function refreshCookieFromHeaders(headers: Record<string, unknown>): string {
  const header = headers["set-cookie"];
  const list = Array.isArray(header)
    ? (header as string[])
    : typeof header === "string"
      ? [header]
      : [];
  const name = env.REFRESH_COOKIE_NAME;
  const found = list.find((value) => value.startsWith(`${name}=`));
  if (!found) {
    throw new Error("Refresh cookie was not set");
  }
  return found.split(";")[0] ?? "";
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export async function registerUser(
  app: Express,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  const response = await request(app).post("/api/v1/auth/register").send({ email, password });
  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
}

export async function verifyUser(app: Express, email: string): Promise<void> {
  const mail = lastMailTo(email);
  if (!mail) {
    throw new Error(`No verification email for ${email}`);
  }
  const response = await request(app)
    .post("/api/v1/auth/verify-email")
    .send({ token: extractToken(mail) });
  if (response.status !== 200) {
    throw new Error(`verify failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
}

export interface Session {
  accessToken: string;
  cookie: string;
}

export async function loginUser(
  app: Express,
  email: string,
  password: string = PASSWORD,
): Promise<Session> {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  if (response.status !== 200) {
    throw new Error(`login failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return {
    accessToken: response.body.data.accessToken as string,
    cookie: refreshCookieFromHeaders(response.headers),
  };
}

export async function createVerifiedSession(app: Express, email: string): Promise<Session> {
  await registerUser(app, email);
  await verifyUser(app, email);
  return loginUser(app, email);
}

export interface AccountSummary {
  id: string;
  name: string;
  bankName: string;
  last4: string | null;
  currency: string;
  balanceMinor: string;
  parts: Array<{
    id: string;
    name: string;
    percentageBp: number;
    sortOrder: number;
    balanceMinor: string;
  }>;
}

export async function createAccount(
  app: Express,
  token: string,
  body: Record<string, unknown> = { name: "Test Account", bankName: "Dutch-Bangla Bank" },
): Promise<AccountSummary> {
  const response = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", bearer(token))
    .send(body);
  if (response.status !== 201) {
    throw new Error(`create account failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data.account as AccountSummary;
}
