import type { Request, Response } from "express";
import { historyQuerySchema, type DepositInput, type WithdrawalInput } from "shared";
import { currentUserId } from "../http/current-user";
import * as service from "./service";

function idOf(req: Request): string {
  return req.params.id ?? "";
}

function idempotencyKey(req: Request): string | null {
  const value = req.get("idempotency-key");
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function deposit(req: Request, res: Response): Promise<void> {
  const body = req.body as DepositInput;
  const transaction = await service.deposit({
    userId: currentUserId(req),
    accountId: idOf(req),
    idempotencyKey: idempotencyKey(req),
    ip: req.ip ?? null,
    amountMinor: BigInt(body.amountMinor),
    mode: body.mode,
    partId: body.partId,
    acknowledgedWarning: body.acknowledgedWarning ?? false,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    note: body.note,
    category: body.category,
  });
  res.status(201).json({ data: { transaction } });
}

export async function withdraw(req: Request, res: Response): Promise<void> {
  const body = req.body as WithdrawalInput;
  const transaction = await service.withdraw({
    userId: currentUserId(req),
    accountId: idOf(req),
    idempotencyKey: idempotencyKey(req),
    ip: req.ip ?? null,
    entries: body.entries.map((entry) => ({
      partId: entry.partId,
      amountMinor: BigInt(entry.amountMinor),
    })),
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    note: body.note,
    category: body.category,
  });
  res.status(201).json({ data: { transaction } });
}

export async function reverse(req: Request, res: Response): Promise<void> {
  const transaction = await service.reverse({
    userId: currentUserId(req),
    transactionId: idOf(req),
    ip: req.ip ?? null,
  });
  res.status(201).json({ data: { transaction } });
}

export async function listTransactions(req: Request, res: Response): Promise<void> {
  const query = historyQuerySchema.parse(req.query);
  const page = await service.listHistory({
    userId: currentUserId(req),
    accountId: idOf(req),
    type: query.type,
    partId: query.partId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    cursor: query.cursor,
    limit: query.limit,
  });
  res.json({ data: page });
}

export async function summary(req: Request, res: Response): Promise<void> {
  const result = await service.summary({
    userId: currentUserId(req),
    accountId: idOf(req),
  });
  res.json({ data: { summary: result } });
}
