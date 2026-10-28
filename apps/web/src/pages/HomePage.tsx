import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatMoney } from "shared";
import { useAuth } from "../auth/AuthContext";
import { AccountCard } from "../components/AccountCard";
import { Button } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import { listAccounts } from "../lib/accounts";
import { messageForError } from "../lib/errors";
import { getAlerts } from "../lib/insights";

export function HomePage() {
  const { user, status, logout } = useAuth();

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
    enabled: status === "authenticated",
  });

  const alertsQuery = useQuery({
    queryKey: ["insights", "alerts"],
    queryFn: getAlerts,
    enabled: status === "authenticated",
  });

  const accounts = accountsQuery.data ?? [];
  const totalsByCurrency = accounts.reduce<Map<string, bigint>>((totals, account) => {
    totals.set(account.currency, (totals.get(account.currency) ?? 0n) + BigInt(account.balanceMinor));
    return totals;
  }, new Map());
  const currencyTotals = [...totalsByCurrency.entries()];

  return (
    <Screen center={false}>
      <header className="home-header">
        <div className="stack" style={{ gap: 0 }}>
          <span className="account-meta">{user?.email}</span>
          {currencyTotals.length === 0 ? (
            <span className="home-total">{formatMoney(0n)}</span>
          ) : (
            currencyTotals.map(([currency, value]) => (
              <span key={currency} className="home-total">
                {formatMoney(value, currency)}
              </span>
            ))
          )}
        </div>
        <Button variant="ghost" onClick={() => void logout()}>
          Sign out
        </Button>
      </header>

      <div className="stack" style={{ gap: "0.75rem" }}>
        <div className="row" style={{ gap: "0.5rem" }}>
          <Link
            to="/accounts/new"
            className="btn"
            style={{ textDecoration: "none", flex: 1 }}
          >
            Add account
          </Link>
          <Link
            to="/insights"
            className="btn btn-ghost"
            style={{ textDecoration: "none", flex: 1 }}
          >
            Insights
          </Link>
        </div>

        {alertsQuery.data && alertsQuery.data.length > 0 ? (
          <FormMessage tone="info">
            {alertsQuery.data.length} part{alertsQuery.data.length === 1 ? "" : "s"} below the
            alert level.{" "}
            <Link className="link" to="/insights">
              Review
            </Link>
          </FormMessage>
        ) : null}

        {accountsQuery.isPending ? (
          <div className="stack" style={{ gap: "0.75rem" }}>
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        ) : null}

        {accountsQuery.isError ? (
          <FormMessage tone="error">{messageForError(accountsQuery.error)}</FormMessage>
        ) : null}

        {accountsQuery.isSuccess && accounts.length === 0 ? (
          <FormMessage tone="info">
            No accounts yet. Add one to start tracking your deposits and splits.
          </FormMessage>
        ) : null}

        <div className="stack stagger" style={{ gap: "0.75rem" }}>
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      </div>
    </Screen>
  );
}
