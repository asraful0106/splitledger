import type { Queryable } from "../db/tx";

export interface Entry {
  id: string;
  transactionId: string;
  partId: string;
  amountMinor: bigint;
  percentageBpSnapshot: number | null;
  createdAt: Date;
}

export interface EntryWithPart extends Entry {
  partName: string;
}

interface EntryRow {
  id: string;
  transaction_id: string;
  part_id: string;
  amount_minor: string;
  percentage_bp_snapshot: number | null;
  created_at: Date;
  part_name?: string;
}

function mapEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    partId: row.part_id,
    amountMinor: BigInt(row.amount_minor),
    percentageBpSnapshot: row.percentage_bp_snapshot,
    createdAt: row.created_at,
  };
}

export async function insertEntries(
  db: Queryable,
  entries: Array<{
    transactionId: string;
    partId: string;
    amountMinor: bigint;
    percentageBpSnapshot: number | null;
  }>,
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const params: unknown[] = [];
  const values = entries.map((entry, index) => {
    const base = index * 4;
    params.push(
      entry.transactionId,
      entry.partId,
      entry.amountMinor.toString(),
      entry.percentageBpSnapshot,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });

  await db.query(
    `INSERT INTO transaction_entries
       (transaction_id, part_id, amount_minor, percentage_bp_snapshot)
     VALUES ${values.join(", ")}`,
    params,
  );
}

export async function listEntriesForTransaction(
  db: Queryable,
  transactionId: string,
): Promise<Entry[]> {
  const { rows } = await db.query<EntryRow>(
    `SELECT id, transaction_id, part_id, amount_minor, percentage_bp_snapshot, created_at
     FROM transaction_entries WHERE transaction_id = $1 ORDER BY created_at ASC`,
    [transactionId],
  );
  return rows.map(mapEntry);
}

export async function listEntriesForTransactions(
  db: Queryable,
  transactionIds: string[],
): Promise<EntryWithPart[]> {
  if (transactionIds.length === 0) {
    return [];
  }

  const { rows } = await db.query<EntryRow>(
    `SELECT e.id, e.transaction_id, e.part_id, e.amount_minor, e.percentage_bp_snapshot,
            e.created_at, p.name AS part_name
     FROM transaction_entries e
     JOIN parts p ON p.id = e.part_id
     WHERE e.transaction_id = ANY($1::uuid[])
     ORDER BY e.created_at ASC`,
    [transactionIds],
  );

  return rows.map((row) => ({ ...mapEntry(row), partName: row.part_name ?? "" }));
}

export async function balancesForParts(
  db: Queryable,
  partIds: string[],
): Promise<Map<string, bigint>> {
  if (partIds.length === 0) {
    return new Map();
  }

  const { rows } = await db.query<{ part_id: string; balance: string }>(
    `SELECT part_id, COALESCE(SUM(amount_minor), 0)::bigint AS balance
     FROM transaction_entries
     WHERE part_id = ANY($1::uuid[])
     GROUP BY part_id`,
    [partIds],
  );

  return new Map(rows.map((row) => [row.part_id, BigInt(row.balance)]));
}
