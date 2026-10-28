import type { Queryable } from "../db/tx";

export interface Part {
  id: string;
  accountId: string;
  name: string;
  percentageBp: number;
  sortOrder: number;
  lowBalanceThresholdMinor: bigint | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface PartWithBalance extends Part {
  balanceMinor: bigint;
}

interface PartRow {
  id: string;
  account_id: string;
  name: string;
  percentage_bp: number;
  sort_order: number;
  low_balance_threshold_minor: string | null;
  archived_at: Date | null;
  created_at: Date;
}

interface PartWithBalanceRow extends PartRow {
  balance_minor: string;
}

const COLUMNS =
  "id, account_id, name, percentage_bp, sort_order, low_balance_threshold_minor, archived_at, created_at";

function mapPart(row: PartRow): Part {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    percentageBp: row.percentage_bp,
    sortOrder: row.sort_order,
    lowBalanceThresholdMinor:
      row.low_balance_threshold_minor === null ? null : BigInt(row.low_balance_threshold_minor),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

export async function listActiveParts(db: Queryable, accountId: string): Promise<Part[]> {
  const { rows } = await db.query<PartRow>(
    `SELECT ${COLUMNS} FROM parts
     WHERE account_id = $1 AND archived_at IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [accountId],
  );
  return rows.map(mapPart);
}

export async function listActivePartsWithBalances(
  db: Queryable,
  accountIds: string[],
): Promise<PartWithBalance[]> {
  if (accountIds.length === 0) {
    return [];
  }

  const { rows } = await db.query<PartWithBalanceRow>(
    `SELECT p.id, p.account_id, p.name, p.percentage_bp, p.sort_order,
            p.low_balance_threshold_minor, p.archived_at, p.created_at,
            COALESCE(SUM(e.amount_minor), 0)::bigint AS balance_minor
     FROM parts p
     LEFT JOIN transaction_entries e ON e.part_id = p.id
     WHERE p.account_id = ANY($1::uuid[]) AND p.archived_at IS NULL
     GROUP BY p.id
     ORDER BY p.sort_order ASC, p.created_at ASC`,
    [accountIds],
  );

  return rows.map((row) => ({ ...mapPart(row), balanceMinor: BigInt(row.balance_minor) }));
}

export async function insertPart(
  db: Queryable,
  input: {
    accountId: string;
    name: string;
    percentageBp: number;
    sortOrder: number;
    lowBalanceThresholdMinor?: bigint | null | undefined;
  },
): Promise<Part> {
  const { rows } = await db.query<PartRow>(
    `INSERT INTO parts (account_id, name, percentage_bp, sort_order, low_balance_threshold_minor)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [
      input.accountId,
      input.name,
      input.percentageBp,
      input.sortOrder,
      input.lowBalanceThresholdMinor === undefined || input.lowBalanceThresholdMinor === null
        ? null
        : input.lowBalanceThresholdMinor.toString(),
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to insert part");
  }
  return mapPart(row);
}

export async function updatePart(
  db: Queryable,
  id: string,
  accountId: string,
  input: {
    name: string;
    percentageBp: number;
    sortOrder: number;
    lowBalanceThresholdMinor?: bigint | null | undefined;
  },
): Promise<Part | null> {
  const sets = ["name = $3", "percentage_bp = $4", "sort_order = $5"];
  const params: unknown[] = [id, accountId, input.name, input.percentageBp, input.sortOrder];

  if (input.lowBalanceThresholdMinor !== undefined) {
    params.push(
      input.lowBalanceThresholdMinor === null ? null : input.lowBalanceThresholdMinor.toString(),
    );
    sets.push(`low_balance_threshold_minor = $${params.length}`);
  }

  const { rows } = await db.query<PartRow>(
    `UPDATE parts SET ${sets.join(", ")}
     WHERE id = $1 AND account_id = $2 AND archived_at IS NULL
     RETURNING ${COLUMNS}`,
    params,
  );
  const row = rows[0];
  return row ? mapPart(row) : null;
}

export async function archiveMissingParts(
  db: Queryable,
  accountId: string,
  keepIds: string[],
): Promise<void> {
  await db.query(
    `UPDATE parts SET archived_at = now()
     WHERE account_id = $1 AND archived_at IS NULL AND NOT (id = ANY($2::uuid[]))`,
    [accountId, keepIds],
  );
}

export async function activePartsSum(db: Queryable, accountId: string): Promise<number> {
  const { rows } = await db.query<{ total: number }>(
    `SELECT COALESCE(SUM(percentage_bp), 0)::int AS total
     FROM parts WHERE account_id = $1 AND archived_at IS NULL`,
    [accountId],
  );
  return rows[0]?.total ?? 0;
}

export async function lockActivePartsForUpdate(
  db: Queryable,
  accountId: string,
): Promise<Part[]> {
  const { rows } = await db.query<PartRow>(
    `SELECT ${COLUMNS} FROM parts
     WHERE account_id = $1 AND archived_at IS NULL
     ORDER BY sort_order ASC, created_at ASC
     FOR UPDATE`,
    [accountId],
  );
  return rows.map(mapPart);
}

export async function lockPartsForUpdate(
  db: Queryable,
  accountId: string,
  partIds: string[],
): Promise<Part[]> {
  if (partIds.length === 0) {
    return [];
  }
  const { rows } = await db.query<PartRow>(
    `SELECT ${COLUMNS} FROM parts
     WHERE account_id = $1 AND id = ANY($2::uuid[])
     ORDER BY id ASC
     FOR UPDATE`,
    [accountId, partIds],
  );
  return rows.map(mapPart);
}
