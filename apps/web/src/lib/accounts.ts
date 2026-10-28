import { apiFetch } from "./api";

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

export interface AccountPartPayload {
  id?: string;
  name: string;
  percentageBp: number;
  sortOrder?: number;
  lowBalanceThresholdMinor?: string | null;
}

export interface CreateAccountPayload {
  name: string;
  bankName: string;
  last4?: string;
  currency?: string;
}

export interface UpdateAccountPayload {
  name?: string;
  bankName?: string;
  last4?: string | null;
  currency?: string;
}

export async function listAccounts(includeArchived = false): Promise<AccountView[]> {
  const suffix = includeArchived ? "?includeArchived=true" : "";
  const data = await apiFetch<{ accounts: AccountView[] }>(`/accounts${suffix}`);
  return data.accounts;
}

export async function createAccount(payload: CreateAccountPayload): Promise<AccountView> {
  const data = await apiFetch<{ account: AccountView }>("/accounts", {
    method: "POST",
    body: payload,
  });
  return data.account;
}

export async function getAccount(id: string): Promise<AccountView> {
  const data = await apiFetch<{ account: AccountView }>(`/accounts/${id}`);
  return data.account;
}

export async function updateAccount(
  id: string,
  payload: UpdateAccountPayload,
): Promise<AccountView> {
  const data = await apiFetch<{ account: AccountView }>(`/accounts/${id}`, {
    method: "PATCH",
    body: payload,
  });
  return data.account;
}

export async function archiveAccount(id: string): Promise<AccountView> {
  const data = await apiFetch<{ account: AccountView }>(`/accounts/${id}/archive`, {
    method: "POST",
  });
  return data.account;
}

export async function replaceParts(
  id: string,
  parts: AccountPartPayload[],
): Promise<PartView[]> {
  const data = await apiFetch<{ parts: PartView[] }>(`/accounts/${id}/parts`, {
    method: "PUT",
    body: { parts },
  });
  return data.parts;
}
