import { split } from "shared";
import { db, isUniqueViolation, withTransaction, type Queryable } from "../db/tx";
import { env } from "../env";
import { AppError, ErrorCode } from "../errors";
import * as accountsRepo from "../repositories/accounts.repo";
import * as auditRepo from "../repositories/audit-log.repo";
import * as entriesRepo from "../repositories/entries.repo";
import * as partsRepo from "../repositories/parts.repo";
import * as transactionsRepo from "../repositories/transactions.repo";
import type { Transaction, TransactionMode, TransactionType } from "../repositories/transactions.repo";
import { decodeCursor, encodeCursor } from "./cursor";

const MAX_AMOUNT_MINOR = BigInt(env.MAX_TRANSACTION_MINOR);

export interface EntryView {
  id: string;
  partId: string;
  partName: string;
  amountMinor: string;
  percentageBpSnapshot: number | null;
}

export interface TransactionView {
  id: string;
  accountId: string;
  type: TransactionType;
  amountMinor: string;
  mode: TransactionMode;
  currency: string;
  occurredAt: string;
  note: string | null;
  category: string | null;
  warningAcknowledgedAt: string | null;
  reversesTransactionId: string | null;
  isReversal: boolean;
  entries: EntryView[];
}

export interface HistoryPage {
  transactions: TransactionView[];
  nextCursor: string | null;
}

function toTransactionView(
  transaction: Transaction,
  entries: entriesRepo.EntryWithPart[],
): TransactionView {
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    type: transaction.type,
    amountMinor: transaction.amountMinor.toString(),
    mode: transaction.mode,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt.toISOString(),
    note: transaction.note,
    category: transaction.category,
    warningAcknowledgedAt: transaction.warningAcknowledgedAt
      ? transaction.warningAcknowledgedAt.toISOString()
      : null,
    reversesTransactionId: transaction.reversesTransactionId,
    isReversal: transaction.reversesTransactionId !== null,
    entries: entries.map((entry) => ({
      id: entry.id,
      partId: entry.partId,
      partName: entry.partName,
      amountMinor: entry.amountMinor.toString(),
      percentageBpSnapshot: entry.percentageBpSnapshot,
    })),
  };
}

async function loadTransactionView(
  q: Queryable,
  transaction: Transaction,
): Promise<TransactionView> {
  const entries = await entriesRepo.listEntriesForTransactions(q, [transaction.id]);
  return toTransactionView(transaction, entries);
}

function assertAmount(amountMinor: bigint): void {
  if (amountMinor <= 0n) {
    throw new AppError(ErrorCode.validationError, "Amount must be more than zero", 422);
  }
  if (amountMinor > MAX_AMOUNT_MINOR) {
    throw new AppError(ErrorCode.validationError, "Amount is above the allowed maximum", 422);
  }
}

async function requireActiveAccountForUpdate(
  tx: Queryable,
  userId: string,
  accountId: string,
): Promise<accountsRepo.Account> {
  const account = await accountsRepo.findAccountForUserForUpdate(tx, userId, accountId);
  if (!account) {
    throw new AppError(ErrorCode.notFound, "Account not found", 404);
  }
  if (account.archivedAt) {
    throw new AppError(ErrorCode.accountArchived, "This account is archived", 409);
  }
  return account;
}

export async function deposit(input: {
  userId: string;
  accountId: string;
  idempotencyKey: string | null;
  ip: string | null;
  amountMinor: bigint;
  mode: "split" | "single_part";
  partId?: string | undefined;
  acknowledgedWarning: boolean;
  occurredAt: Date;
  note?: string | undefined;
  category?: string | undefined;
}): Promise<TransactionView> {
  assertAmount(input.amountMinor);

  const attempt = async (): Promise<{ transaction: Transaction; created: boolean }> =>
    withTransaction(async (tx) => {
      const account = await requireActiveAccountForUpdate(tx, input.userId, input.accountId);

      if (input.idempotencyKey) {
        const existing = await transactionsRepo.findTransactionByIdempotencyKey(
          tx,
          input.userId,
          input.idempotencyKey,
        );
        if (existing) {
          return { transaction: existing, created: false };
        }
      }

      const activeParts = await partsRepo.lockActivePartsForUpdate(tx, account.id);
      if (activeParts.length === 0) {
        throw new AppError(ErrorCode.partsSumInvalid, "This account has no active parts", 400);
      }

      let plan: Array<{ partId: string; amountMinor: bigint; percentageBpSnapshot: number | null }>;
      let mode: TransactionMode;
      let warningAcknowledgedAt: Date | null = null;

      if (input.mode === "split") {
        const parts = activeParts.map((part) => ({
          partId: part.id,
          percentageBp: part.percentageBp,
          sortOrder: part.sortOrder,
        }));
        plan = split(input.amountMinor, parts).map((entry) => ({
          partId: entry.partId,
          amountMinor: entry.amountMinor,
          percentageBpSnapshot: entry.percentageBpSnapshot,
        }));
        mode = "split";
      } else {
        const part = activeParts.find((candidate) => candidate.id === input.partId);
        if (!part) {
          throw new AppError(ErrorCode.notFound, "Part not found", 404);
        }
        if (!input.acknowledgedWarning) {
          throw new AppError(
            ErrorCode.warningRequired,
            "This deposit skips your split rules",
            409,
            {
              partId: part.id,
              partName: part.name,
              amountMinor: input.amountMinor.toString(),
              percentageBp: part.percentageBp,
            },
          );
        }
        plan = [{ partId: part.id, amountMinor: input.amountMinor, percentageBpSnapshot: null }];
        mode = "single_part";
        warningAcknowledgedAt = new Date();
      }

      const transaction = await transactionsRepo.insertTransaction(tx, {
        accountId: account.id,
        userId: input.userId,
        type: "deposit",
        amountMinor: input.amountMinor,
        mode,
        warningAcknowledgedAt,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
        category: input.category ?? null,
        idempotencyKey: input.idempotencyKey,
        reversesTransactionId: null,
      });

      await entriesRepo.insertEntries(
        tx,
        plan.map((entry) => ({ transactionId: transaction.id, ...entry })),
      );

      return { transaction, created: true };
    });

  let result: { transaction: Transaction; created: boolean };
  try {
    result = await attempt();
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await transactionsRepo.findTransactionByIdempotencyKey(
        db,
        input.userId,
        input.idempotencyKey,
      );
      if (existing) {
        return loadTransactionView(db, existing);
      }
    }
    throw error;
  }

  if (result.created) {
    await auditRepo.insertAuditLog(db, {
      userId: input.userId,
      event: "transaction_created",
      metadata: { transactionId: result.transaction.id, type: "deposit", mode: result.transaction.mode },
      ip: input.ip,
    });
  }

  return loadTransactionView(db, result.transaction);
}

export async function withdraw(input: {
  userId: string;
  accountId: string;
  idempotencyKey: string | null;
  ip: string | null;
  entries: Array<{ partId: string; amountMinor: bigint }>;
  occurredAt: Date;
  note?: string | undefined;
  category?: string | undefined;
}): Promise<TransactionView> {
  const total = input.entries.reduce((sum, entry) => sum + entry.amountMinor, 0n);
  assertAmount(total);
  for (const entry of input.entries) {
    assertAmount(entry.amountMinor);
  }

  const partIds = input.entries.map((entry) => entry.partId);

  const attempt = async (): Promise<{ transaction: Transaction; created: boolean }> =>
    withTransaction(async (tx) => {
      const account = await requireActiveAccountForUpdate(tx, input.userId, input.accountId);

      if (input.idempotencyKey) {
        const existing = await transactionsRepo.findTransactionByIdempotencyKey(
          tx,
          input.userId,
          input.idempotencyKey,
        );
        if (existing) {
          return { transaction: existing, created: false };
        }
      }

      const lockedParts = await partsRepo.lockPartsForUpdate(tx, account.id, partIds);
      const byId = new Map(lockedParts.map((part) => [part.id, part]));

      for (const entry of input.entries) {
        const part = byId.get(entry.partId);
        if (!part || part.archivedAt) {
          throw new AppError(ErrorCode.notFound, "Part not found", 404);
        }
      }

      const balances = await entriesRepo.balancesForParts(tx, partIds);
      for (const entry of input.entries) {
        const balance = balances.get(entry.partId) ?? 0n;
        if (balance - entry.amountMinor < 0n) {
          throw new AppError(ErrorCode.insufficientBalance, "Not enough in this part", 400, {
            partId: entry.partId,
            partName: byId.get(entry.partId)?.name ?? null,
            balanceMinor: balance.toString(),
            requestedMinor: entry.amountMinor.toString(),
          });
        }
      }

      const transaction = await transactionsRepo.insertTransaction(tx, {
        accountId: account.id,
        userId: input.userId,
        type: "withdrawal",
        amountMinor: total,
        mode: "manual",
        warningAcknowledgedAt: null,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
        category: input.category ?? null,
        idempotencyKey: input.idempotencyKey,
        reversesTransactionId: null,
      });

      await entriesRepo.insertEntries(
        tx,
        input.entries.map((entry) => ({
          transactionId: transaction.id,
          partId: entry.partId,
          amountMinor: -entry.amountMinor,
          percentageBpSnapshot: null,
        })),
      );

      return { transaction, created: true };
    });

  let result: { transaction: Transaction; created: boolean };
  try {
    result = await attempt();
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await transactionsRepo.findTransactionByIdempotencyKey(
        db,
        input.userId,
        input.idempotencyKey,
      );
      if (existing) {
        return loadTransactionView(db, existing);
      }
    }
    throw error;
  }

  if (result.created) {
    await auditRepo.insertAuditLog(db, {
      userId: input.userId,
      event: "transaction_created",
      metadata: { transactionId: result.transaction.id, type: "withdrawal", mode: "manual" },
      ip: input.ip,
    });
  }

  return loadTransactionView(db, result.transaction);
}

export async function reverse(input: {
  userId: string;
  transactionId: string;
  ip: string | null;
}): Promise<TransactionView> {
  const reversal = await withTransaction(async (tx) => {
    const original = await transactionsRepo.findTransactionForUser(
      tx,
      input.userId,
      input.transactionId,
    );
    if (!original) {
      throw new AppError(ErrorCode.notFound, "Transaction not found", 404);
    }

    const account = await accountsRepo.findAccountForUserForUpdate(
      tx,
      input.userId,
      original.accountId,
    );
    if (!account) {
      throw new AppError(ErrorCode.notFound, "Account not found", 404);
    }

    const existingReversal = await transactionsRepo.findTransactionByReversesId(tx, original.id);
    if (existingReversal) {
      throw new AppError(ErrorCode.alreadyReversed, "This transaction was already reversed", 409);
    }

    const originalEntries = await entriesRepo.listEntriesForTransaction(tx, original.id);
    if (originalEntries.length === 0) {
      throw new AppError(ErrorCode.internalError, "Transaction has no entries", 500);
    }

    const reversalType: TransactionType = original.type === "deposit" ? "withdrawal" : "deposit";
    const partIds = originalEntries.map((entry) => entry.partId);

    const lockedParts = await partsRepo.lockPartsForUpdate(tx, account.id, partIds);
    const byId = new Map(lockedParts.map((part) => [part.id, part]));

    if (reversalType === "withdrawal") {
      const balances = await entriesRepo.balancesForParts(tx, partIds);
      for (const entry of originalEntries) {
        const balance = balances.get(entry.partId) ?? 0n;
        if (balance - entry.amountMinor < 0n) {
          throw new AppError(ErrorCode.insufficientBalance, "Not enough in this part", 400, {
            partId: entry.partId,
            partName: byId.get(entry.partId)?.name ?? null,
            balanceMinor: balance.toString(),
            requestedMinor: entry.amountMinor.toString(),
          });
        }
      }
    }

    const created = await transactionsRepo.insertTransaction(tx, {
      accountId: original.accountId,
      userId: input.userId,
      type: reversalType,
      amountMinor: original.amountMinor,
      mode: "manual",
      warningAcknowledgedAt: null,
      occurredAt: new Date(),
      note: `Reversal of ${original.id}`,
      category: null,
      idempotencyKey: null,
      reversesTransactionId: original.id,
    });

    await entriesRepo.insertEntries(
      tx,
      originalEntries.map((entry) => ({
        transactionId: created.id,
        partId: entry.partId,
        amountMinor: -entry.amountMinor,
        percentageBpSnapshot: null,
      })),
    );

    return created;
  });

  await auditRepo.insertAuditLog(db, {
    userId: input.userId,
    event: "transaction_reversed",
    metadata: { transactionId: reversal.reversesTransactionId, reversalId: reversal.id },
    ip: input.ip,
  });

  return loadTransactionView(db, reversal);
}

export async function listHistory(input: {
  userId: string;
  accountId: string;
  type?: TransactionType | undefined;
  partId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  cursor?: string | undefined;
  limit: number;
}): Promise<HistoryPage> {
  const account = await accountsRepo.findAccountForUser(db, input.userId, input.accountId);
  if (!account) {
    throw new AppError(ErrorCode.notFound, "Account not found", 404);
  }

  const decoded = input.cursor ? decodeCursor(input.cursor) : null;
  if (input.cursor && !decoded) {
    throw new AppError(ErrorCode.validationError, "Invalid cursor", 422);
  }

  const rows = await transactionsRepo.listHistory(
    db,
    account.id,
    {
      type: input.type,
      partId: input.partId,
      from: input.from,
      to: input.to,
      cursor: decoded ?? undefined,
    },
    input.limit + 1,
  );

  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

  const entries = await entriesRepo.listEntriesForTransactions(
    db,
    pageRows.map((row) => row.id),
  );

  const transactions = pageRows.map((row) =>
    toTransactionView(
      row,
      entries.filter((entry) => entry.transactionId === row.id),
    ),
  );

  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ occurredAt: last.occurredAt, id: last.id }) : null;

  return { transactions, nextCursor };
}

export async function summary(input: {
  userId: string;
  accountId: string;
}): Promise<{
  accountId: string;
  currency: string;
  totalMinor: string;
  parts: Array<{ id: string; name: string; percentageBp: number; balanceMinor: string }>;
}> {
  const account = await accountsRepo.findAccountForUser(db, input.userId, input.accountId);
  if (!account) {
    throw new AppError(ErrorCode.notFound, "Account not found", 404);
  }

  const parts = await partsRepo.listActivePartsWithBalances(db, [account.id]);
  const total = parts.reduce((sum, part) => sum + part.balanceMinor, 0n);

  return {
    accountId: account.id,
    currency: account.currency,
    totalMinor: total.toString(),
    parts: parts.map((part) => ({
      id: part.id,
      name: part.name,
      percentageBp: part.percentageBp,
      balanceMinor: part.balanceMinor.toString(),
    })),
  };
}
