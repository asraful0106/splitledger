import type { Pool, PoolClient } from "pg";
import { pool } from "./pool";

export interface Queryable {
  query<Row = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
}

function asQueryable(client: Pool | PoolClient): Queryable {
  return client as unknown as Queryable;
}

export const db: Queryable = asQueryable(pool);

export async function withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(asQueryable(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}
