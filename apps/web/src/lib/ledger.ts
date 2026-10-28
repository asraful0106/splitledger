import { apiFetch } from "./api";

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
  type: "deposit" | "withdrawal";
  amountMinor: string;
  mode: "split" | "single_part" | "manual";
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

export interface AccountSummary {
  accountId: string;
  currency: string;
  totalMinor: string;
  parts: Array<{ id: string; name: string; percentageBp: number; balanceMinor: string }>;
}

export interface DepositPayload {
  amountMinor: string;
  mode?: "split" | "single_part";
  partId?: string;
  acknowledgedWarning?: boolean;
  note?: string;
}

export interface WithdrawPayload {
  entries: Array<{ partId: string; amountMinor: string }>;
  note?: string;
}

export async function deposit(
  accountId: string,
  payload: DepositPayload,
  idempotencyKey: string,
): Promise<TransactionView> {
  const data = await apiFetch<{ transaction: TransactionView }>(
    `/accounts/${accountId}/deposits`,
    { method: "POST", body: payload, headers: { "Idempotency-Key": idempotencyKey } },
  );
  return data.transaction;
}

export async function withdraw(
  accountId: string,
  payload: WithdrawPayload,
  idempotencyKey: string,
): Promise<TransactionView> {
  const data = await apiFetch<{ transaction: TransactionView }>(
    `/accounts/${accountId}/withdrawals`,
    { method: "POST", body: payload, headers: { "Idempotency-Key": idempotencyKey } },
  );
  return data.transaction;
}

export async function reverseTransaction(transactionId: string): Promise<TransactionView> {
  const data = await apiFetch<{ transaction: TransactionView }>(
    `/transactions/${transactionId}/reverse`,
    { method: "POST" },
  );
  return data.transaction;
}

export async function listTransactions(
  accountId: string,
  params: { cursor?: string; limit?: number; type?: "deposit" | "withdrawal" } = {},
): Promise<HistoryPage> {
  const search = new URLSearchParams();
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.type) search.set("type", params.type);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return apiFetch<HistoryPage>(`/accounts/${accountId}/transactions${suffix}`);
}

export async function getSummary(accountId: string): Promise<AccountSummary> {
  const data = await apiFetch<{ summary: AccountSummary }>(`/accounts/${accountId}/summary`);
  return data.summary;
}
