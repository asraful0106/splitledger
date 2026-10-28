import type { Queryable } from "../db/tx";

export type TransactionType = "deposit" | "withdrawal";
export type TransactionMode = "split" | "single_part" | "manual";

export interface Transaction {
  id: string;
  accountId: string;
  userId: string;
  type: TransactionType;
  amountMinor: bigint;
  mode: TransactionMode;
  warningAcknowledgedAt: Date | null;
  occurredAt: Date;
  note: string | null;
  category: string | null;
  idempotencyKey: string | null;
  reversesTransactionId: string | null;
  createdAt: Date;
  currency: string;
}

interface TransactionRow {
  id: string;
  account_id: string;
  user_id: string;
  type: TransactionType;
  amount_minor: string;
  mode: TransactionMode;
  warning_acknowledged_at: Date | null;
  occurred_at: Date;
  note: string | null;
  category: string | null;
  idempotency_key: string | null;
  reverses_transaction_id: string | null;
  created_at: Date;
  currency: string;
}

const COLUMNS = `t.id, t.account_id, t.user_id, t.type, t.amount_minor, t.mode,
  t.warning_acknowledged_at, t.occurred_at, t.note, t.category, t.idempotency_key,
  t.reverses_transaction_id, t.created_at, a.currency`;

const FROM = "transactions t JOIN accounts a ON a.id = t.account_id";

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    type: row.type,
    amountMinor: BigInt(row.amount_minor),
    mode: row.mode,
    warningAcknowledgedAt: row.warning_acknowledged_at,
    occurredAt: row.occurred_at,
    note: row.note,
    category: row.category,
    idempotencyKey: row.idempotency_key,
    reversesTransactionId: row.reverses_transaction_id,
    createdAt: row.created_at,
    currency: row.currency,
  };
}

export async function insertTransaction(
  db: Queryable,
  input: {
    accountId: string;
    userId: string;
    type: TransactionType;
    amountMinor: bigint;
    mode: TransactionMode;
    warningAcknowledgedAt: Date | null;
    occurredAt: Date;
    note: string | null;
    category: string | null;
    idempotencyKey: string | null;
    reversesTransactionId: string | null;
  },
): Promise<Transaction> {
  const { rows } = await db.query<TransactionRow>(
    `WITH inserted AS (
       INSERT INTO transactions
         (account_id, user_id, type, amount_minor, mode, warning_acknowledged_at,
          occurred_at, note, category, idempotency_key, reverses_transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *
     )
     SELECT ${COLUMNS} FROM inserted t JOIN accounts a ON a.id = t.account_id`,
    [
      input.accountId,
      input.userId,
      input.type,
      input.amountMinor.toString(),
      input.mode,
      input.warningAcknowledgedAt,
      input.occurredAt,
      input.note,
      input.category,
      input.idempotencyKey,
      input.reversesTransactionId,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to insert transaction");
  }
  return mapTransaction(row);
}

export async function findTransactionForUser(
  db: Queryable,
  userId: string,
  id: string,
): Promise<Transaction | null> {
  const { rows } = await db.query<TransactionRow>(
    `SELECT ${COLUMNS} FROM ${FROM} WHERE t.id = $1 AND t.user_id = $2`,
    [id, userId],
  );
  const row = rows[0];
  return row ? mapTransaction(row) : null;
}

export async function findTransactionByIdempotencyKey(
  db: Queryable,
  userId: string,
  idempotencyKey: string,
): Promise<Transaction | null> {
  const { rows } = await db.query<TransactionRow>(
    `SELECT ${COLUMNS} FROM ${FROM} WHERE t.user_id = $1 AND t.idempotency_key = $2`,
    [userId, idempotencyKey],
  );
  const row = rows[0];
  return row ? mapTransaction(row) : null;
}

export async function findTransactionByReversesId(
  db: Queryable,
  reversesId: string,
): Promise<Transaction | null> {
  const { rows } = await db.query<TransactionRow>(
    `SELECT ${COLUMNS} FROM ${FROM} WHERE t.reverses_transaction_id = $1`,
    [reversesId],
  );
  const row = rows[0];
  return row ? mapTransaction(row) : null;
}

export interface HistoryFilters {
  type?: TransactionType | undefined;
  partId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  cursor?: { occurredAt: Date; id: string } | undefined;
}

export async function listHistory(
  db: Queryable,
  accountId: string,
  filters: HistoryFilters,
  limit: number,
): Promise<Transaction[]> {
  const params: unknown[] = [accountId];
  const conditions: string[] = ["t.account_id = $1"];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`t.type = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`t.occurred_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`t.occurred_at < $${params.length}`);
  }
  if (filters.partId) {
    params.push(filters.partId);
    conditions.push(
      `EXISTS (SELECT 1 FROM transaction_entries e WHERE e.transaction_id = t.id AND e.part_id = $${params.length})`,
    );
  }
  if (filters.cursor) {
    params.push(filters.cursor.occurredAt);
    const tsIndex = params.length;
    params.push(filters.cursor.id);
    const idIndex = params.length;
    conditions.push(`(t.occurred_at, t.id) < ($${tsIndex}, $${idIndex})`);
  }

  params.push(limit);

  const { rows } = await db.query<TransactionRow>(
    `SELECT ${COLUMNS} FROM ${FROM}
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.occurred_at DESC, t.id DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapTransaction);
}
