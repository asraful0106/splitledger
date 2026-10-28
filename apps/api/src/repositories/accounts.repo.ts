import type { Queryable } from "../db/tx";

export interface Account {
  id: string;
  userId: string;
  name: string;
  bankName: string;
  last4: string | null;
  currency: string;
  archivedAt: Date | null;
  createdAt: Date;
  hasTransactions: boolean;
}

interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  bank_name: string;
  last4: string | null;
  currency: string;
  archived_at: Date | null;
  created_at: Date;
  has_transactions: boolean;
}

const COLUMNS =
  "id, user_id, name, bank_name, last4, currency, archived_at, created_at, EXISTS (SELECT 1 FROM transactions t WHERE t.account_id = accounts.id) AS has_transactions";

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    bankName: row.bank_name,
    last4: row.last4,
    currency: row.currency,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    hasTransactions: row.has_transactions,
  };
}

export async function insertAccount(
  db: Queryable,
  input: {
    userId: string;
    name: string;
    bankName: string;
    last4: string | null;
    currency: string;
  },
): Promise<Account> {
  const { rows } = await db.query<AccountRow>(
    `INSERT INTO accounts (user_id, name, bank_name, last4, currency)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [input.userId, input.name, input.bankName, input.last4, input.currency],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to insert account");
  }
  return mapAccount(row);
}

export async function listAccountsByUser(
  db: Queryable,
  userId: string,
  includeArchived: boolean,
): Promise<Account[]> {
  const { rows } = await db.query<AccountRow>(
    `SELECT ${COLUMNS} FROM accounts
     WHERE user_id = $1 ${includeArchived ? "" : "AND archived_at IS NULL"}
     ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(mapAccount);
}

export async function findAccountForUser(
  db: Queryable,
  userId: string,
  id: string,
): Promise<Account | null> {
  const { rows } = await db.query<AccountRow>(
    `SELECT ${COLUMNS} FROM accounts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const row = rows[0];
  return row ? mapAccount(row) : null;
}

export async function findAccountForUserForUpdate(
  db: Queryable,
  userId: string,
  id: string,
): Promise<Account | null> {
  const { rows } = await db.query<AccountRow>(
    `SELECT ${COLUMNS} FROM accounts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [id, userId],
  );
  const row = rows[0];
  return row ? mapAccount(row) : null;
}

export async function updateAccount(
  db: Queryable,
  id: string,
  input: {
    name?: string | undefined;
    bankName?: string | undefined;
    last4?: string | null | undefined;
    currency?: string | undefined;
  },
): Promise<Account> {
  const sets: string[] = [];
  const values: unknown[] = [];

  const push = (column: string, value: unknown): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (input.name !== undefined) push("name", input.name);
  if (input.bankName !== undefined) push("bank_name", input.bankName);
  if (input.last4 !== undefined) push("last4", input.last4);
  if (input.currency !== undefined) push("currency", input.currency);

  if (sets.length === 0) {
    throw new Error("No account fields to update");
  }

  values.push(id);
  const { rows } = await db.query<AccountRow>(
    `UPDATE accounts SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${COLUMNS}`,
    values,
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to update account");
  }
  return mapAccount(row);
}

export async function archiveAccount(db: Queryable, id: string): Promise<Account> {
  const { rows } = await db.query<AccountRow>(
    `UPDATE accounts SET archived_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to archive account");
  }
  return mapAccount(row);
}
