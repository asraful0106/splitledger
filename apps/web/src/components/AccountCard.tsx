import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatMoney, rollingMonthRange } from "shared";
import type { AccountView } from "../lib/accounts";
import { getSummary } from "../lib/insights";
import { SegmentedBar } from "./SegmentedBar";
import { Sparkline } from "./Sparkline";

export function AccountCard({ account }: { account: AccountView }) {
  const sparklineQuery = useQuery({
    queryKey: ["insights", "sparkline", account.id],
    enabled: account.hasTransactions,
    queryFn: () => {
      const range = rollingMonthRange(6);
      return getSummary({
        from: range.from,
        to: range.to,
        accountId: account.id,
        granularity: "month",
      });
    },
    select: (data) => data.buckets[0]?.series ?? [],
  });

  const sparkline = sparklineQuery.data ?? [];

  return (
    <Link to={`/accounts/${account.id}`} className="account-card enter">
      <div className="account-card-top">
        <div className="stack" style={{ gap: 0 }}>
          <span className="account-name">{account.name}</span>
          <span className="account-meta">
            {account.bankName}
            {account.last4 ? ` •••• ${account.last4}` : ""}
          </span>
        </div>
        <span className="account-balance">{formatMoney(BigInt(account.balanceMinor), account.currency)}</span>
      </div>

      <SegmentedBar parts={account.parts} />

      {sparkline.length > 1 ? <Sparkline points={sparkline} /> : null}

      <div className="part-legend">
        {account.parts.map((part) => (
          <span key={part.id}>
            {part.name} · {formatMoney(BigInt(part.balanceMinor), account.currency)}
          </span>
        ))}
      </div>
    </Link>
  );
}
