import { formatMoney, split } from "shared";
import type { PartView } from "../lib/accounts";

export function SplitPreview({
  amountMinor,
  parts,
  currency = "BDT",
}: {
  amountMinor: bigint;
  parts: PartView[];
  currency?: string;
}) {
  if (amountMinor <= 0n || parts.length === 0) {
    return null;
  }

  let entries: Array<{ partId: string; amountMinor: bigint }>;
  try {
    entries = split(
      amountMinor,
      parts.map((part) => ({
        partId: part.id,
        percentageBp: part.percentageBp,
        sortOrder: part.sortOrder,
      })),
    );
  } catch {
    return null;
  }

  return (
    <div className="split-preview" role="status" aria-live="polite">
      <span className="section-title">Split preview</span>
      <ul className="split-list">
        {entries.map((entry) => {
          const part = parts.find((candidate) => candidate.id === entry.partId);
          return (
            <li key={entry.partId}>
              <span>{part?.name ?? ""}</span>
              <span className="account-balance">{formatMoney(entry.amountMinor, currency)}</span>
            </li>
          );
        })}
      </ul>
      <span className="field-hint">Preview only — the server confirms the final split.</span>
    </div>
  );
}
