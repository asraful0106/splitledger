import type { Request, Response } from "express";
import type { CreateAccountInput, ReplacePartsInput, UpdateAccountInput } from "shared";
import { currentUserId } from "../http/current-user";
import * as service from "./service";

function accountIdOf(req: Request): string {
  return req.params.id ?? "";
}

export async function list(req: Request, res: Response): Promise<void> {
  const includeArchived = req.query.includeArchived === "true";
  const accounts = await service.listAccounts({ userId: currentUserId(req), includeArchived });
  res.json({ data: { accounts } });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateAccountInput;
  const account = await service.createAccount({
    userId: currentUserId(req),
    ip: req.ip ?? null,
    name: body.name,
    bankName: body.bankName,
    last4: body.last4,
    currency: body.currency,
    parts: body.parts,
  });
  res.status(201).json({ data: { account } });
}

export async function get(req: Request, res: Response): Promise<void> {
  const account = await service.getAccount({
    userId: currentUserId(req),
    accountId: accountIdOf(req),
  });
  res.json({ data: { account } });
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateAccountInput;
  const account = await service.updateAccount({
    userId: currentUserId(req),
    accountId: accountIdOf(req),
    ip: req.ip ?? null,
    fields: {
      name: body.name,
      bankName: body.bankName,
      last4: body.last4,
      currency: body.currency,
    },
  });
  res.json({ data: { account } });
}

export async function archive(req: Request, res: Response): Promise<void> {
  const account = await service.archiveAccount({
    userId: currentUserId(req),
    accountId: accountIdOf(req),
    ip: req.ip ?? null,
  });
  res.json({ data: { account } });
}

export async function listParts(req: Request, res: Response): Promise<void> {
  const parts = await service.listAccountParts({
    userId: currentUserId(req),
    accountId: accountIdOf(req),
  });
  res.json({ data: { parts } });
}

export async function replaceParts(req: Request, res: Response): Promise<void> {
  const body = req.body as ReplacePartsInput;
  const parts = await service.replaceAccountParts({
    userId: currentUserId(req),
    accountId: accountIdOf(req),
    ip: req.ip ?? null,
    parts: body.parts,
  });
  res.json({ data: { parts } });
}
