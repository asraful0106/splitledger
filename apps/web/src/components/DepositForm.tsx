import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { formatMoney } from "shared";
import type { AccountView } from "../lib/accounts";
import { messageForError } from "../lib/errors";
import { deposit, type DepositPayload, type TransactionView } from "../lib/ledger";
import { AmountField } from "./AmountField";
import { Button } from "./Button";
import { FormMessage } from "./FormMessage";
import { SegmentedBar } from "./SegmentedBar";
import { SplitPreview } from "./SplitPreview";

type Mode = "split" | "single_part";

export function DepositForm({
  account,
  onSuccess,
}: {
  account: AccountView;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [amountMinor, setAmountMinor] = useState(0n);
  const [mode, setMode] = useState<Mode>("split");
  const [partId, setPartId] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionView | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const mutation = useMutation({
    mutationFn: (payload: { mode: Mode; partId: string }) => {
      const body: DepositPayload = { amountMinor: amountMinor.toString(), mode: payload.mode };
      if (payload.mode === "single_part" && payload.partId) {
        body.partId = payload.partId;
        body.acknowledgedWarning = true;
      }
      return deposit(account.id, body, idempotencyKey.current);
    },
    onSuccess: (transaction) => {
      idempotencyKey.current = crypto.randomUUID();
      void queryClient.invalidateQueries({ queryKey: ["account", account.id] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", account.id] });
      setResult(transaction);
      window.setTimeout(onSuccess, 900);
    },
    onError: (mutationError) => setError(messageForError(mutationError)),
  });

  if (result) {
    const total = BigInt(result.amountMinor);
    const successParts = result.entries.map((entry, index) => ({
      id: entry.partId,
      name: entry.partName,
      percentageBp: total > 0n ? Number((BigInt(entry.amountMinor) * 10000n) / total) : 0,
      sortOrder: index,
      balanceMinor: "0",
      lowBalanceThresholdMinor: null,
    }));

    return (
      <div className="success-moment">
        <span className="success-mark" aria-hidden="true">
          ✓
        </span>
        <span className="auth-title">Deposited {formatMoney(total, result.currency)}</span>
        <div style={{ width: "100%" }}>
          <SegmentedBar parts={successParts} height={12} animated />
        </div>
        <span className="account-meta">
          {result.entries.map((entry) => entry.partName).join(" · ")}
        </span>
      </div>
    );
  }

  const selectedPart = account.parts.find((part) => part.id === partId);
  const canSubmit =
    amountMinor > 0n && (mode === "split" || (partId.length > 0 && acknowledged)) && !mutation.isPending;

  return (
    <div className="sheet-form">
      <div className="sheet-scroll">
        <span className="account-meta">
          Balance {formatMoney(BigInt(account.balanceMinor), account.currency)} · {account.bankName}
        </span>

      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      <AmountField
        label="Amount"
        currency={account.currency}
        valueMinor={amountMinor}
        onChangeMinor={setAmountMinor}
      />

      <div className="stack" style={{ gap: "0.5rem" }}>
        <span className="section-title">How to split it</span>
        <div className="mode-toggle" role="group" aria-label="Deposit mode">
          <button
            type="button"
            className={`mode-option ${mode === "split" ? "mode-option-active" : ""}`}
            aria-pressed={mode === "split"}
            onClick={() => setMode("split")}
          >
            Split by my rules
          </button>
          <button
            type="button"
            className={`mode-option ${mode === "single_part" ? "mode-option-active" : ""}`}
            aria-pressed={mode === "single_part"}
            onClick={() => setMode("single_part")}
          >
            Single part
          </button>
        </div>
      </div>

      {mode === "split" ? (
        <SplitPreview amountMinor={amountMinor} parts={account.parts} currency={account.currency} />
      ) : (
        <div className="stack" style={{ gap: "0.75rem" }}>
          <div className="field">
            <label className="field-label" htmlFor="deposit-part">
              Part
            </label>
            <select
              id="deposit-part"
              className="field-input"
              value={partId}
              onChange={(event) => {
                setPartId(event.target.value);
                setAcknowledged(false);
              }}
            >
              <option value="">Choose a part…</option>
              {account.parts.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.name} ({part.percentageBp / 100}%)
                </option>
              ))}
            </select>
          </div>

          {selectedPart && !acknowledged ? (
            <div className="warning-panel">
              <p>
                This skips your split rules. <strong>{selectedPart.name}</strong> will receive the
                full <strong>{formatMoney(amountMinor, account.currency)}</strong> instead of{" "}
                {selectedPart.percentageBp / 100}%.
              </p>
              <Button variant="ghost" onClick={() => setAcknowledged(true)}>
                I understand
              </Button>
            </div>
          ) : null}
        </div>
      )}
      </div>

      <div className="sheet-actions">
        <Button
          loading={mutation.isPending}
          disabled={!canSubmit}
          onClick={() => mutation.mutate({ mode, partId })}
        >
          Confirm deposit
        </Button>
      </div>
    </div>
  );
}
