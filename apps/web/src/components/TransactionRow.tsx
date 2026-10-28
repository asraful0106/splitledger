import { formatMoney } from "shared";
import { formatDateTime } from "../lib/format";
import type { TransactionView } from "../lib/ledger";
import { Button } from "./Button";

function label(transaction: TransactionView): string {
  if (transaction.isReversal) {
    return "Reversal";
  }
  return transaction.type === "deposit" ? "Deposit" : "Withdrawal";
}

export function TransactionRow({
  transaction,
  onReverse,
  reversing = false,
}: {
  transaction: TransactionView;
  onReverse?: (() => void) | undefined;
  reversing?: boolean;
}) {
  const incoming = transaction.type === "deposit";
  const signed = `${incoming ? "+" : "−"}${formatMoney(BigInt(transaction.amountMinor), transaction.currency)}`;

  return (
    <div className="txn-row">
      <div className="txn-main">
        <div className="row" style={{ gap: "0.5rem" }}>
          <span className={`badge ${incoming ? "badge-in" : "badge-out"}`}>{label(transaction)}</span>
          {transaction.mode === "single_part" ? <span className="badge">Single part</span> : null}
          <span className="account-meta">{formatDateTime(transaction.occurredAt)}</span>
        </div>
        <span className="txn-parts">
          {transaction.entries
            .map((entry) => `${entry.partName} ${formatMoney(BigInt(entry.amountMinor), transaction.currency)}`)
            .join(" · ")}
        </span>
        {transaction.note ? <span className="account-meta">{transaction.note}</span> : null}
      </div>

      <div className="stack" style={{ gap: "0.5rem", alignItems: "flex-end" }}>
        <span className={`txn-amount ${incoming ? "txn-in" : "txn-out"}`}>{signed}</span>
        {onReverse ? (
          <Button variant="ghost" loading={reversing} onClick={onReverse}>
            Reverse
          </Button>
        ) : null}
      </div>
    </div>
  );
}
