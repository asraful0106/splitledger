import { PARTS_TOTAL_BP, sumPercentageBp, type AccountPartInput } from "shared";
import { db, isUniqueViolation, withTransaction, type Queryable } from "../db/tx";
import { AppError, ErrorCode } from "../errors";
import * as accountsRepo from "../repositories/accounts.repo";
import * as auditRepo from "../repositories/audit-log.repo";
import * as partsRepo from "../repositories/parts.repo";

export interface PartView {
  id: string;
  name: string;
  percentageBp: number;
  sortOrder: number;
  balanceMinor: string;
  lowBalanceThresholdMinor: string | null;
}

export interface AccountView {
  id: string;
  name: string;
  bankName: string;
  last4: string | null;
  currency: string;
  archivedAt: string | null;
  createdAt: string;
  hasTransactions: boolean;
  balanceMinor: string;
  parts: PartView[];
}

const DEFAULT_PART_NAME = "General";

function toPartView(part: partsRepo.PartWithBalance): PartView {
  return {
    id: part.id,
    name: part.name,
    percentageBp: part.percentageBp,
    sortOrder: part.sortOrder,
    balanceMinor: part.balanceMinor.toString(),
    lowBalanceThresholdMinor:
      part.lowBalanceThresholdMinor === null ? null : part.lowBalanceThresholdMinor.toString(),
  };
}

function thresholdOf(part: {
  lowBalanceThresholdMinor?: string | null | undefined;
}): bigint | null | undefined {
  if (part.lowBalanceThresholdMinor === undefined) {
    return undefined;
  }
  if (part.lowBalanceThresholdMinor === null) {
    return null;
  }
  return BigInt(part.lowBalanceThresholdMinor);
}

function toAccountView(
  account: accountsRepo.Account,
  parts: partsRepo.PartWithBalance[],
): AccountView {
  const total = parts.reduce((sum, part) => sum + part.balanceMinor, 0n);

  return {
    id: account.id,
    name: account.name,
    bankName: account.bankName,
    last4: account.last4,
    currency: account.currency,
    archivedAt: account.archivedAt ? account.archivedAt.toISOString() : null,
    createdAt: account.createdAt.toISOString(),
    hasTransactions: account.hasTransactions,
    balanceMinor: total.toString(),
    parts: parts.map(toPartView),
  };
}

function assertPartsSum(parts: readonly { percentageBp: number }[]): void {
  const sum = sumPercentageBp(parts);
  if (sum !== PARTS_TOTAL_BP) {
    throw new AppError(ErrorCode.partsSumInvalid, "Active parts must sum to 100%", 400, {
      sum,
      expected: PARTS_TOTAL_BP,
    });
  }
}

function partNamesAreUnique(parts: readonly AccountPartInput[]): boolean {
  const names = parts.map((part) => part.name.trim().toLowerCase());
  return new Set(names).size === names.length;
}

function asValidation(message: string, error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new AppError(ErrorCode.validationError, message, 422);
  }
  throw error;
}

async function loadAccountView(
  q: Queryable,
  account: accountsRepo.Account,
): Promise<AccountView> {
  const parts = await partsRepo.listActivePartsWithBalances(q, [account.id]);
  return toAccountView(account, parts);
}

export async function listAccounts(input: {
  userId: string;
  includeArchived: boolean;
}): Promise<AccountView[]> {
  const accounts = await accountsRepo.listAccountsByUser(db, input.userId, input.includeArchived);
  const parts = await partsRepo.listActivePartsWithBalances(
    db,
    accounts.map((account) => account.id),
  );

  return accounts.map((account) =>
    toAccountView(
      account,
      parts.filter((part) => part.accountId === account.id),
    ),
  );
}

export async function getAccount(input: {
  userId: string;
  accountId: string;
}): Promise<AccountView> {
  const account = await accountsRepo.findAccountForUser(db, input.userId, input.accountId);
  if (!account) {
    throw new AppError(ErrorCode.notFound, "Account not found", 404);
  }
  return loadAccountView(db, account);
}

export async function createAccount(input: {
  userId: string;
  ip: string | null;
  name: string;
  bankName: string;
  last4?: string | undefined;
  currency: string;
  parts?: AccountPartInput[] | undefined;
}): Promise<AccountView> {
  const parts: AccountPartInput[] = input.parts ?? [
    { name: DEFAULT_PART_NAME, percentageBp: PARTS_TOTAL_BP },
  ];

  assertPartsSum(parts);
  if (!partNamesAreUnique(parts)) {
    throw new AppError(ErrorCode.validationError, "Part names must be unique", 422);
  }

  const account = await withTransaction(async (tx) => {
    const created = await accountsRepo.insertAccount(tx, {
      userId: input.userId,
      name: input.name,
      bankName: input.bankName,
      last4: input.last4 ?? null,
      currency: input.currency,
    });

    let order = 0;
    for (const part of parts) {
      await partsRepo.insertPart(tx, {
        accountId: created.id,
        name: part.name,
        percentageBp: part.percentageBp,
        sortOrder: part.sortOrder ?? order,
        lowBalanceThresholdMinor: thresholdOf(part) ?? null,
      });
      order += 1;
    }

    if ((await partsRepo.activePartsSum(tx, created.id)) !== PARTS_TOTAL_BP) {
      throw new AppError(ErrorCode.partsSumInvalid, "Active parts must sum to 100%", 400);
    }

    return created;
  }).catch((error: unknown) => asValidation("Part names must be unique", error));

  await auditRepo.insertAuditLog(db, {
    userId: input.userId,
    event: "account_created",
    metadata: { accountId: account.id },
    ip: input.ip,
  });

  return loadAccountView(db, account);
}

export async function updateAccount(input: {
  userId: string;
  accountId: string;
  ip: string | null;
  fields: {
    name?: string | undefined;
    bankName?: string | undefined;
    last4?: string | null | undefined;
    currency?: string | undefined;
  };
}): Promise<AccountView> {
  const updated = await withTransaction(async (tx) => {
    const existing = await accountsRepo.findAccountForUserForUpdate(
      tx,
      input.userId,
      input.accountId,
    );
    if (!existing) {
      throw new AppError(ErrorCode.notFound, "Account not found", 404);
    }

    if (
      input.fields.currency !== undefined &&
      input.fields.currency !== existing.currency &&
      existing.hasTransactions
    ) {
      throw new AppError(
        ErrorCode.currencyLocked,
        "An account's currency is locked once it has transactions",
        400,
      );
    }

    return accountsRepo.updateAccount(tx, existing.id, input.fields);
  });

  await auditRepo.insertAuditLog(db, {
    userId: input.userId,
    event: "account_updated",
    metadata: { accountId: updated.id },
    ip: input.ip,
  });

  return loadAccountView(db, updated);
}

export async function archiveAccount(input: {
  userId: string;
  accountId: string;
  ip: string | null;
}): Promise<AccountView> {
  const existing = await accountsRepo.findAccountForUser(db, input.userId, input.accountId);
  if (!existing) {
    throw new AppError(ErrorCode.notFound, "Account not found", 404);
  }

  const archived = await accountsRepo.archiveAccount(db, existing.id);

  await auditRepo.insertAuditLog(db, {
    userId: input.userId,
    event: "account_archived",
    metadata: { accountId: archived.id },
    ip: input.ip,
  });

  return loadAccountView(db, archived);
}

export async function listAccountParts(input: {
  userId: string;
  accountId: string;
}): Promise<PartView[]> {
  const account = await accountsRepo.findAccountForUser(db, input.userId, input.accountId);
  if (!account) {
    throw new AppError(ErrorCode.notFound, "Account not found", 404);
  }
  const parts = await partsRepo.listActivePartsWithBalances(db, [account.id]);
  return parts.map(toPartView);
}

export async function replaceAccountParts(input: {
  userId: string;
  accountId: string;
  ip: string | null;
  parts: AccountPartInput[];
}): Promise<PartView[]> {
  assertPartsSum(input.parts);
  if (!partNamesAreUnique(input.parts)) {
    throw new AppError(ErrorCode.validationError, "Part names must be unique", 422);
  }

  const parts = await withTransaction(async (tx) => {
    const account = await accountsRepo.findAccountForUserForUpdate(
      tx,
      input.userId,
      input.accountId,
    );
    if (!account) {
      throw new AppError(ErrorCode.notFound, "Account not found", 404);
    }

    const keepIds: string[] = [];
    let order = 0;

    for (const part of input.parts) {
      const sortOrder = part.sortOrder ?? order;

      if (part.id) {
        const updated = await partsRepo.updatePart(tx, part.id, account.id, {
          name: part.name,
          percentageBp: part.percentageBp,
          sortOrder,
          lowBalanceThresholdMinor: thresholdOf(part),
        });
        if (!updated) {
          throw new AppError(ErrorCode.notFound, "Part not found", 404);
        }
        keepIds.push(updated.id);
      } else {
        const created = await partsRepo.insertPart(tx, {
          accountId: account.id,
          name: part.name,
          percentageBp: part.percentageBp,
          sortOrder,
          lowBalanceThresholdMinor: thresholdOf(part) ?? null,
        });
        keepIds.push(created.id);
      }

      order += 1;
    }

    await partsRepo.archiveMissingParts(tx, account.id, keepIds);

    const total = await partsRepo.activePartsSum(tx, account.id);
    if (total !== PARTS_TOTAL_BP) {
      throw new AppError(ErrorCode.partsSumInvalid, "Active parts must sum to 100%", 400, {
        sum: total,
        expected: PARTS_TOTAL_BP,
      });
    }

    return partsRepo.listActivePartsWithBalances(tx, [account.id]);
  }).catch((error: unknown) => asValidation("Part names must be unique", error));

  await auditRepo.insertAuditLog(db, {
    userId: input.userId,
    event: "parts_updated",
    metadata: { accountId: input.accountId },
    ip: input.ip,
  });

  return parts.map(toPartView);
}
