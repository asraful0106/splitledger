import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import runner from "node-pg-migrate";
import pg from "pg";
import { adminDatabaseUrl, databaseName, testDatabaseUrl } from "./helpers/test-db";

const here = dirname(fileURLToPath(import.meta.url));

export default async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = `postgres://${process.env.POSTGRES_USER ?? "splitledger"}:${
      process.env.POSTGRES_PASSWORD ?? "splitledger"
    }@localhost:5432/splitledger`;
  }

  const name = databaseName(testDatabaseUrl());
  const admin = new pg.Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.end();
  }

  await runner({
    databaseUrl: testDatabaseUrl(),
    dir: resolve(here, "../migrations"),
    direction: "up",
    migrationsTable: "pgmigrations",
    log: () => {},
  });
}
