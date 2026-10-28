import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatMoney } from "shared";
import { replaceParts, type AccountView } from "../lib/accounts";
import { messageForError } from "../lib/errors";
import { AmountField } from "./AmountField";
import { Button } from "./Button";
import { FormMessage } from "./FormMessage";

export function PartAlerts({
  account,
  onSaved,
}: {
  account: AccountView;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [thresholds, setThresholds] = useState<Record<string, bigint>>(() =>
    Object.fromEntries(
      account.parts.map((part) => [
        part.id,
        part.lowBalanceThresholdMinor ? BigInt(part.lowBalanceThresholdMinor) : 0n,
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      replaceParts(
        account.id,
        account.parts.map((part, index) => {
          const threshold = thresholds[part.id] ?? 0n;
          return {
            id: part.id,
            name: part.name,
            percentageBp: part.percentageBp,
            sortOrder: index,
            lowBalanceThresholdMinor: threshold > 0n ? threshold.toString() : null,
          };
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account", account.id] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["insights", "alerts"] });
      onSaved();
    },
    onError: (mutationError) => setError(messageForError(mutationError)),
  });

  return (
    <div className="stack" style={{ gap: "0.75rem" }}>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {account.parts.length === 0 ? (
        <FormMessage tone="info">Add a part before setting an alert.</FormMessage>
      ) : null}

      {account.parts.map((part) => (
        <AmountField
          key={part.id}
          id={`alert-${part.id}`}
          label={`${part.name} — alert below`}
          currency={account.currency}
          valueMinor={thresholds[part.id] ?? 0n}
          onChangeMinor={(minor) =>
            setThresholds((current) => ({ ...current, [part.id]: minor }))
          }
          hint={`Balance is ${formatMoney(BigInt(part.balanceMinor), account.currency)}. Leave at 0 to disable.`}
        />
      ))}

      <Button
        variant="ghost"
        loading={mutation.isPending}
        disabled={account.parts.length === 0}
        onClick={() => mutation.mutate()}
      >
        Save alert levels
      </Button>
    </div>
  );
}
