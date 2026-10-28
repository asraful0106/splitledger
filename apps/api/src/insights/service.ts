import { minorToMajorString } from "shared";
import { db } from "../db/tx";
import { AppError, ErrorCode } from "../errors";
import * as accountsRepo from "../repositories/accounts.repo";
import * as insightsRepo from "./repository";

export interface SummaryPart {
  accountId: string;
  accountName: string;
  partId: string;
  partName: string;
  inflowMinor: string;
  outflowMinor: string;
  netMinor: string;
}

export interface SummarySeriesPoint {
  bucket: string;
  inflowMinor: string;
  outflowMinor: string;
  netMinor: string;
}

export interface SummaryBucket {
  currency: string;
  totals: { inflowMinor: string; outflowMinor: string; netMinor: string };
  parts: SummaryPart[];
  series: SummarySeriesPoint[];
}

export interface SummaryResult {
  from: string;
  to: string;
  buckets: SummaryBucket[];
}

export interface AlertItem {
  accountId: string;
  accountName: string;
  currency: string;
  partId: string;
  partName: string;
  balanceMinor: string;
  thresholdMinor: string;
}

const dhakaStamp = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function dhakaTimestamp(date: Date): string {
  return `${dhakaStamp.format(date).replace(" ", "T")}+06:00`;
}

function dhakaDate(date: Date): string {
  return dhakaStamp.format(date).slice(0, 10);
}

function csvCell(value: string | null): string {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function assertAccountOwned(userId: string, accountId: string | undefined): Promise<void> {
  if (!accountId) {
    return;
  }
  const account = await accountsRepo.findAccountForUser(db, userId, accountId);
  if (!account) {
    throw new AppError(ErrorCode.notFound, "Account not found", 404);
  }
}

export async function summary(input: {
  userId: string;
  accountId?: string | undefined;
  from: Date;
  to: Date;
  granularity: insightsRepo.Granularity;
}): Promise<SummaryResult> {
  await assertAccountOwned(input.userId, input.accountId);

  const [parts, points] = await Promise.all([
    insightsRepo.summaryByPart(db, input),
    insightsRepo.series(db, input, input.granularity),
  ]);

  const byCurrency = new Map<string, SummaryBucket>();
  const bucketFor = (currency: string): SummaryBucket => {
    let bucket = byCurrency.get(currency);
    if (!bucket) {
      bucket = {
        currency,
        totals: { inflowMinor: "0", outflowMinor: "0", netMinor: "0" },
        parts: [],
        series: [],
      };
      byCurrency.set(currency, bucket);
    }
    return bucket;
  };

  for (const point of points) {
    bucketFor(point.currency).series.push({
      bucket: point.bucket,
      inflowMinor: point.inflowMinor.toString(),
      outflowMinor: point.outflowMinor.toString(),
      netMinor: point.netMinor.toString(),
    });
  }

  for (const part of parts) {
    bucketFor(part.currency).parts.push({
      accountId: part.accountId,
      accountName: part.accountName,
      partId: part.partId,
      partName: part.partName,
      inflowMinor: part.inflowMinor.toString(),
      outflowMinor: part.outflowMinor.toString(),
      netMinor: part.netMinor.toString(),
    });
  }

  const buckets = [...byCurrency.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map((bucket) => {
      const totals = bucket.series.reduce(
        (acc, point) => ({
          inflow: acc.inflow + BigInt(point.inflowMinor),
          outflow: acc.outflow + BigInt(point.outflowMinor),
          net: acc.net + BigInt(point.netMinor),
        }),
        { inflow: 0n, outflow: 0n, net: 0n },
      );

      return {
        ...bucket,
        totals: {
          inflowMinor: totals.inflow.toString(),
          outflowMinor: totals.outflow.toString(),
          netMinor: totals.net.toString(),
        },
      };
    });

  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    buckets,
  };
}

export async function alerts(input: { userId: string }): Promise<{ alerts: AlertItem[] }> {
  const rows = await insightsRepo.lowBalanceAlerts(db, input.userId);

  return {
    alerts: rows.map((row) => ({
      accountId: row.accountId,
      accountName: row.accountName,
      currency: row.currency,
      partId: row.partId,
      partName: row.partName,
      balanceMinor: row.balanceMinor.toString(),
      thresholdMinor: row.thresholdMinor.toString(),
    })),
  };
}

export async function exportCsv(input: {
  userId: string;
  accountId?: string | undefined;
  from: Date;
  to: Date;
  type?: "deposit" | "withdrawal" | undefined;
}): Promise<{ filename: string; csv: string }> {
  await assertAccountOwned(input.userId, input.accountId);
  const rows = await insightsRepo.exportRows(db, input);

  const header = [
    "occurred_at",
    "account",
    "currency",
    "transaction_id",
    "type",
    "mode",
    "part",
    "amount",
    "amount_minor",
    "note",
    "category",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        dhakaTimestamp(row.occurredAt),
        row.accountName,
        row.currency,
        row.transactionId,
        row.type,
        row.mode,
        row.partName,
        minorToMajorString(row.amountMinor),
        row.amountMinor.toString(),
        row.note,
        row.category,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // Name the file with the inclusive period in Dhaka time.
  const fromDate = dhakaDate(input.from);
  const toDate = dhakaDate(new Date(input.to.getTime() - 1));

  return {
    filename: `splitledger-${fromDate}-${toDate}.csv`,
    csv: `\uFEFF${lines.join("\n")}\n`,
  };
}
