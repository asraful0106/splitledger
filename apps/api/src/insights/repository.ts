import type { Queryable } from "../db/tx";

export interface PartSummaryRow {
  accountId: string;
  accountName: string;
  currency: string;
  partId: string;
  partName: string;
  inflowMinor: bigint;
  outflowMinor: bigint;
  netMinor: bigint;
}

export interface SeriesRow {
  currency: string;
  bucket: string;
  inflowMinor: bigint;
  outflowMinor: bigint;
  netMinor: bigint;
}

export interface LowBalanceAlertRow {
  accountId: string;
  accountName: string;
  currency: string;
  partId: string;
  partName: string;
  balanceMinor: bigint;
  thresholdMinor: bigint;
}

export interface ExportRow {
  occurredAt: Date;
  transactionId: string;
  type: "deposit" | "withdrawal";
  mode: "split" | "single_part" | "manual";
  note: string | null;
  category: string | null;
  accountName: string;
  currency: string;
  partName: string;
  amountMinor: bigint;
}

interface RangeFilters {
  userId: string;
  accountId?: string | undefined;
  from: Date;
  to: Date;
}

function rangeConditions(filters: RangeFilters): { params: unknown[]; where: string } {
  const params: unknown[] = [filters.userId, filters.from, filters.to];
  const conditions = ["t.user_id = $1", "t.occurred_at >= $2", "t.occurred_at < $3"];

  if (filters.accountId) {
    params.push(filters.accountId);
    conditions.push(`t.account_id = $${params.length}`);
  }

  return { params, where: conditions.join(" AND ") };
}

export async function summaryByPart(
  db: Queryable,
  filters: RangeFilters,
): Promise<PartSummaryRow[]> {
  const { params, where } = rangeConditions(filters);
  const { rows } = await db.query<{
    account_id: string;
    account_name: string;
    currency: string;
    part_id: string;
    part_name: string;
    inflow_minor: string;
    outflow_minor: string;
    net_minor: string;
  }>(
    `SELECT a.id AS account_id, a.name AS account_name, a.currency,
            p.id AS part_id, p.name AS part_name,
            COALESCE(SUM(e.amount_minor) FILTER (WHERE e.amount_minor > 0), 0)::bigint AS inflow_minor,
            COALESCE(-SUM(e.amount_minor) FILTER (WHERE e.amount_minor < 0), 0)::bigint AS outflow_minor,
            COALESCE(SUM(e.amount_minor), 0)::bigint AS net_minor
     FROM transaction_entries e
     JOIN transactions t ON t.id = e.transaction_id
     JOIN parts p ON p.id = e.part_id
     JOIN accounts a ON a.id = t.account_id
     WHERE ${where}
     GROUP BY a.id, a.name, a.currency, p.id, p.name
     ORDER BY a.name ASC, p.name ASC`,
    params,
  );

  return rows.map((row) => ({
    accountId: row.account_id,
    accountName: row.account_name,
    currency: row.currency,
    partId: row.part_id,
    partName: row.part_name,
    inflowMinor: BigInt(row.inflow_minor),
    outflowMinor: BigInt(row.outflow_minor),
    netMinor: BigInt(row.net_minor),
  }));
}

export type Granularity = "day" | "week" | "month";

export async function series(
  db: Queryable,
  filters: RangeFilters,
  granularity: Granularity,
): Promise<SeriesRow[]> {
  const { params, where } = rangeConditions(filters);
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  params.push(granularity);
  const unitIndex = params.length;
  params.push(format);
  const formatIndex = params.length;

  const { rows } = await db.query<{
    currency: string;
    bucket: string;
    inflow_minor: string;
    outflow_minor: string;
    net_minor: string;
  }>(
    `SELECT a.currency,
            to_char(
              date_trunc($${unitIndex}::text, t.occurred_at AT TIME ZONE 'Asia/Dhaka'),
              $${formatIndex}::text
            ) AS bucket,
            COALESCE(SUM(e.amount_minor) FILTER (WHERE e.amount_minor > 0), 0)::bigint AS inflow_minor,
            COALESCE(-SUM(e.amount_minor) FILTER (WHERE e.amount_minor < 0), 0)::bigint AS outflow_minor,
            COALESCE(SUM(e.amount_minor), 0)::bigint AS net_minor
     FROM transaction_entries e
     JOIN transactions t ON t.id = e.transaction_id
     JOIN accounts a ON a.id = t.account_id
     WHERE ${where}
     GROUP BY a.currency, bucket
     ORDER BY a.currency ASC, bucket ASC`,
    params,
  );

  return rows.map((row) => ({
    currency: row.currency,
    bucket: row.bucket,
    inflowMinor: BigInt(row.inflow_minor),
    outflowMinor: BigInt(row.outflow_minor),
    netMinor: BigInt(row.net_minor),
  }));
}

export async function lowBalanceAlerts(db: Queryable, userId: string): Promise<LowBalanceAlertRow[]> {
  const { rows } = await db.query<{
    account_id: string;
    account_name: string;
    currency: string;
    part_id: string;
    part_name: string;
    balance_minor: string;
    threshold_minor: string;
  }>(
    `SELECT a.id AS account_id, a.name AS account_name, a.currency,
            p.id AS part_id, p.name AS part_name,
            COALESCE(SUM(e.amount_minor), 0)::bigint AS balance_minor,
            p.low_balance_threshold_minor::bigint AS threshold_minor
     FROM parts p
     JOIN accounts a ON a.id = p.account_id
     LEFT JOIN transaction_entries e ON e.part_id = p.id
     WHERE a.user_id = $1 AND a.archived_at IS NULL AND p.archived_at IS NULL
       AND p.low_balance_threshold_minor IS NOT NULL
     GROUP BY a.id, a.name, a.currency, p.id, p.name, p.low_balance_threshold_minor
     HAVING COALESCE(SUM(e.amount_minor), 0) < p.low_balance_threshold_minor
     ORDER BY a.name ASC, p.name ASC`,
    [userId],
  );

  return rows.map((row) => ({
    accountId: row.account_id,
    accountName: row.account_name,
    currency: row.currency,
    partId: row.part_id,
    partName: row.part_name,
    balanceMinor: BigInt(row.balance_minor),
    thresholdMinor: BigInt(row.threshold_minor),
  }));
}

export async function exportRows(
  db: Queryable,
  filters: RangeFilters & { type?: "deposit" | "withdrawal" | undefined },
): Promise<ExportRow[]> {
  const { params, where } = rangeConditions(filters);
  const conditions = [where];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`t.type = $${params.length}`);
  }

  const { rows } = await db.query<{
    occurred_at: Date;
    transaction_id: string;
    type: "deposit" | "withdrawal";
    mode: "split" | "single_part" | "manual";
    note: string | null;
    category: string | null;
    account_name: string;
    currency: string;
    part_name: string;
    amount_minor: string;
  }>(
    `SELECT t.occurred_at, t.id AS transaction_id, t.type, t.mode, t.note, t.category,
            a.name AS account_name, a.currency, p.name AS part_name, e.amount_minor
     FROM transaction_entries e
     JOIN transactions t ON t.id = e.transaction_id
     JOIN parts p ON p.id = e.part_id
     JOIN accounts a ON a.id = t.account_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.occurred_at ASC, t.id ASC, e.created_at ASC`,
    params,
  );

  return rows.map((row) => ({
    occurredAt: row.occurred_at,
    transactionId: row.transaction_id,
    type: row.type,
    mode: row.mode,
    note: row.note,
    category: row.category,
    accountName: row.account_name,
    currency: row.currency,
    partName: row.part_name,
    amountMinor: BigInt(row.amount_minor),
  }));
}
