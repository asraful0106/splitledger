import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { formatMoney } from "shared";
import type { AccountView } from "../lib/accounts";
import { messageForError } from "../lib/errors";
import { withdraw } from "../lib/ledger";
import { AmountField } from "./AmountField";
import { Button } from "./Button";
import { FormMessage } from "./FormMessage";

export function WithdrawForm({
  account,
  onSuccess,
}: {
  account: AccountView;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, bigint>>({});
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const mutation = useMutation({
    mutationFn: (entries: Array<{ partId: string; amountMinor: string }>) =>
      withdraw(account.id, { entries }, idempotencyKey.current),
    onSuccess: () => {
      idempotencyKey.current = crypto.randomUUID();
      void queryClient.invalidateQueries({ queryKey: ["account", account.id] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", account.id] });
      onSuccess();
    },
    onError: (mutationError) => setError(messageForError(mutationError)),
  });

  const overdraw = account.parts.find((part) => (amounts[part.id] ?? 0n) > BigInt(part.balanceMinor));
  const entries = account.parts
    .map((part) => ({ partId: part.id, amountMinor: amounts[part.id] ?? 0n }))
    .filter((entry) => entry.amountMinor > 0n);
  const total = entries.reduce((sum, entry) => sum + entry.amountMinor, 0n);
  const canSubmit = entries.length > 0 && !overdraw && !mutation.isPending;

  return (
    <div className="sheet-form">
      <div className="sheet-scroll">
        <span className="account-meta">
          Balance {formatMoney(BigInt(account.balanceMinor), account.currency)} · {account.bankName}
        </span>

      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {account.parts.length === 0 ? (
        <FormMessage tone="info">This account has no parts to withdraw from.</FormMessage>
      ) : null}

      {account.parts.map((part) => {
        const balance = BigInt(part.balanceMinor);
        const amount = amounts[part.id] ?? 0n;
        return (
          <AmountField
            key={part.id}
            id={`withdraw-${part.id}`}
            label={`${part.name} — ${formatMoney(balance, account.currency)} available`}
            currency={account.currency}
            valueMinor={amount}
            onChangeMinor={(minor) => setAmounts((current) => ({ ...current, [part.id]: minor }))}
            error={amount > balance ? "More than this part holds" : undefined}
          />
        );
      })}

      {overdraw ? (
        <FormMessage tone="error">
          A part cannot go below zero. Lower the amount or withdraw from another part.
        </FormMessage>
      ) : null}

      <span className="account-meta">Total {formatMoney(total, account.currency)}</span>
      </div>

      <div className="sheet-actions">
        <Button
          loading={mutation.isPending}
          disabled={!canSubmit}
          onClick={() =>
            mutation.mutate(
              entries.map((entry) => ({
                partId: entry.partId,
                amountMinor: entry.amountMinor.toString(),
              })),
            )
          }
        >
          Confirm withdrawal
        </Button>
      </div>
    </div>
  );
}
