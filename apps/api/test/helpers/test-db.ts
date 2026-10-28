import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "../../src/load-env";

const here = dirname(fileURLToPath(import.meta.url));

export const ENV_FILE = resolve(here, "../../../.env");

function baseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgres://splitledger:splitledger@localhost:5432/splitledger"
  );
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  const current = databaseName(baseUrl()) || "splitledger";
  return withDatabase(baseUrl(), `${current}_test`);
}

export function adminDatabaseUrl(): string {
  return withDatabase(baseUrl(), "postgres");
}

let pool: pg.Pool | null = null;

export function getTestPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  }
  return pool;
}

export async function resetDb(): Promise<void> {
  await getTestPool().query(
    "TRUNCATE users, email_tokens, refresh_tokens, accounts, parts, audit_log RESTART IDENTITY CASCADE",
  );
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
