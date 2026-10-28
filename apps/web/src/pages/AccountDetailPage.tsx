import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatMoney } from "shared";
import { asCurrencyCode, CURRENCIES, CURRENCY_CODES } from "shared";
import { z } from "zod";
import { useAuth } from "../auth/AuthContext";
import { SplashScreen } from "../auth/SplashScreen";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { DepositForm } from "../components/DepositForm";
import { FormMessage } from "../components/FormMessage";
import { PartAlerts } from "../components/PartAlerts";
import { PartEditor } from "../components/PartEditor";
import { Screen } from "../components/Screen";
import { SegmentedBar } from "../components/SegmentedBar";
import { Sheet } from "../components/Sheet";
import { TextField } from "../components/TextField";
import { TransactionRow } from "../components/TransactionRow";
import { WithdrawForm } from "../components/WithdrawForm";
import {
  archiveAccount,
  getAccount,
  replaceParts,
  updateAccount,
  type AccountPartPayload,
  type AccountView,
  type UpdateAccountPayload,
} from "../lib/accounts";
import { ApiError } from "../lib/api";
import { messageForError } from "../lib/errors";
import { listTransactions } from "../lib/ledger";

const fieldsSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  bankName: z.string().min(1, "Bank name is required").max(80),
  last4: z
    .string()
    .optional()
    .refine((value) => !value || /^\d{4}$/.test(value), { message: "Use the last 4 digits" }),
  currency: z.enum(CURRENCY_CODES),
});

type FieldsValues = z.infer<typeof fieldsSchema>;

function AccountFieldsForm({ account }: { account: AccountView }) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState } = useForm<FieldsValues>({
    resolver: zodResolver(fieldsSchema),
    defaultValues: {
      name: account.name,
      bankName: account.bankName,
      last4: account.last4 ?? "",
      currency: asCurrencyCode(account.currency),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FieldsValues) => {
      const payload: UpdateAccountPayload = {
        name: values.name,
        bankName: values.bankName,
        currency: values.currency,
      };
      payload.last4 = values.last4 ? values.last4 : null;
      return updateAccount(account.id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account", account.id] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error) => setFormError(messageForError(error)),
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
      <TextField
        label="Nickname"
        autoComplete="off"
        error={formState.errors.name?.message}
        {...register("name")}
      />
      <TextField
        label="Bank name"
        autoComplete="off"
        error={formState.errors.bankName?.message}
        {...register("bankName")}
      />
      <TextField
        label="Last 4 digits (optional)"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        error={formState.errors.last4?.message}
        {...register("last4")}
      />
      <div className="field">
        <label className="field-label" htmlFor="account-currency">
          Currency
        </label>
        <select
          id="account-currency"
          className="field-input"
          disabled={account.hasTransactions}
          {...register("currency")}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
        <span className="field-hint">
          {account.hasTransactions
            ? "Currency is locked once an account has transactions."
            : "You can change this until the first transaction."}
        </span>
      </div>
      <Button type="submit" variant="ghost" loading={mutation.isPending}>
        Save details
      </Button>
    </form>
  );
}

export function AccountDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"deposit" | "withdraw" | null>(null);

  const accountQuery = useQuery({
    queryKey: ["account", id],
    queryFn: () => getAccount(id),
    enabled: id.length > 0 && status === "authenticated",
  });

  const recentQuery = useQuery({
    queryKey: ["transactions", id, "recent"],
    queryFn: () => listTransactions(id, { limit: 5 }),
    enabled: id.length > 0 && status === "authenticated",
  });

  const partsMutation = useMutation({
    mutationFn: (parts: AccountPartPayload[]) => replaceParts(id, parts),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account", id] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error) => setActionError(messageForError(error)),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveAccount(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      navigate("/", { replace: true });
    },
    onError: (error) => setActionError(messageForError(error)),
  });

  if (accountQuery.isPending) {
    return <SplashScreen />;
  }

  if (accountQuery.isError) {
    const notFound = accountQuery.error instanceof ApiError && accountQuery.error.status === 404;
    return (
      <Screen>
        <AuthCard title="Account unavailable" subtitle="This account could not be opened.">
          <FormMessage tone="error">
            {notFound ? "We couldn't find that account." : messageForError(accountQuery.error)}
          </FormMessage>
          <div className="auth-footer">
            <Link className="link" to="/">
              Back to accounts
            </Link>
          </div>
        </AuthCard>
      </Screen>
    );
  }

  const account = accountQuery.data;

  return (
    <Screen center={false}>
      <div className="stack" style={{ gap: "1.5rem" }}>
        <div className="stack" style={{ gap: "0.75rem" }}>
          <Link className="link" to="/">
            ← Accounts
          </Link>
          <div className="account-card-top">
            <div className="stack" style={{ gap: 0 }}>
              <h1 className="auth-title">{account.name}</h1>
              <span className="account-meta">
                {account.bankName}
                {account.last4 ? ` •••• ${account.last4}` : ""}
              </span>
            </div>
            <span className="account-balance">{formatMoney(BigInt(account.balanceMinor), account.currency)}</span>
          </div>
          <SegmentedBar parts={account.parts} height={12} />
          <div className="part-legend">
            {account.parts.map((part) => (
              <span key={part.id}>
                {part.name} · {formatMoney(BigInt(part.balanceMinor), account.currency)}
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: "0.5rem" }}>
            <Button onClick={() => setSheet("deposit")}>Deposit</Button>
            <Button variant="ghost" onClick={() => setSheet("withdraw")}>
              Withdraw
            </Button>
          </div>
        </div>

        {actionError ? <FormMessage tone="error">{actionError}</FormMessage> : null}

        <section className="stack" style={{ gap: "0.75rem" }}>
          <h2 className="section-title">Split</h2>
          <PartEditor
            initialParts={account.parts}
            saving={partsMutation.isPending}
            onSubmit={(parts) => partsMutation.mutateAsync(parts).then(() => undefined)}
          />
        </section>

        <section className="stack" style={{ gap: "0.75rem" }}>
          <h2 className="section-title">Account details</h2>
          <AccountFieldsForm account={account} />
        </section>

        <section className="stack" style={{ gap: "0.75rem" }}>
          <h2 className="section-title">Low balance alerts</h2>
          <PartAlerts account={account} onSaved={() => undefined} />
        </section>

        <section className="stack" style={{ gap: "0.75rem" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="section-title">Recent activity</h2>
            <Link className="link" to={`/accounts/${account.id}/transactions`}>
              See all
            </Link>
          </div>
          {recentQuery.isPending ? <div className="skeleton" /> : null}
          {recentQuery.data && recentQuery.data.transactions.length === 0 ? (
            <FormMessage tone="info">No transactions yet. Make a deposit to get started.</FormMessage>
          ) : null}
          <div className="stack stagger" style={{ gap: "0.75rem" }}>
            {(recentQuery.data?.transactions ?? []).map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} />
            ))}
          </div>
        </section>

        <section className="stack" style={{ gap: "0.75rem" }}>
          <h2 className="section-title">Archive</h2>
          {confirmArchive ? (
            <div className="stack" style={{ gap: "0.5rem" }}>
              <FormMessage tone="info">
                Archiving hides this account. Its history is kept.
              </FormMessage>
              <Button
                variant="ghost"
                loading={archiveMutation.isPending}
                onClick={() => archiveMutation.mutate()}
              >
                Confirm archive
              </Button>
              <Button variant="ghost" onClick={() => setConfirmArchive(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmArchive(true)}>
              Archive account
            </Button>
          )}
        </section>

        <Sheet open={sheet === "deposit"} onClose={() => setSheet(null)} title="Deposit">
          <DepositForm account={account} onSuccess={() => setSheet(null)} />
        </Sheet>
        <Sheet open={sheet === "withdraw"} onClose={() => setSheet(null)} title="Withdraw">
          <WithdrawForm account={account} onSuccess={() => setSheet(null)} />
        </Sheet>
      </div>
    </Screen>
  );
}
