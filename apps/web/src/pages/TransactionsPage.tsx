import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SplashScreen } from "../auth/SplashScreen";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import { TransactionRow } from "../components/TransactionRow";
import { ApiError } from "../lib/api";
import { messageForError } from "../lib/errors";
import { listTransactions, reverseTransaction } from "../lib/ledger";

type Filter = "all" | "deposit" | "withdrawal";

export function TransactionsPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["transactions", id, filter],
    enabled: id.length > 0 && status === "authenticated",
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params: { cursor?: string; limit?: number; type?: "deposit" | "withdrawal" } = {
        limit: 20,
      };
      if (pageParam) {
        params.cursor = pageParam;
      }
      if (filter !== "all") {
        params.type = filter;
      }
      return listTransactions(id, params);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const reverseMutation = useMutation({
    mutationFn: (transactionId: string) => reverseTransaction(transactionId),
    onSuccess: () => {
      setConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ["transactions", id] });
      void queryClient.invalidateQueries({ queryKey: ["account", id] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (mutationError) => setError(messageForError(mutationError)),
  });

  if (query.isPending) {
    return <SplashScreen />;
  }

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Screen>
        <AuthCard title="History" subtitle="This account could not be opened.">
          <FormMessage tone="error">
            {notFound ? "We couldn't find that account." : messageForError(query.error)}
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

  const transactions = query.data.pages.flatMap((page) => page.transactions);
  const reversedIds = new Set(
    transactions
      .map((transaction) => transaction.reversesTransactionId)
      .filter((value): value is string => value !== null),
  );

  return (
    <Screen center={false}>
      <div className="stack" style={{ gap: "1rem" }}>
        <Link className="link" to={`/accounts/${id}`}>
          ← Account
        </Link>
        <h1 className="auth-title">History</h1>

        <div className="mode-toggle" role="group" aria-label="Filter">
          {(["all", "deposit", "withdrawal"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`mode-option ${filter === option ? "mode-option-active" : ""}`}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option === "all" ? "All" : option === "deposit" ? "Deposits" : "Withdrawals"}
            </button>
          ))}
        </div>

        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        {transactions.length === 0 ? (
          <FormMessage tone="info">No transactions yet.</FormMessage>
        ) : null}

        {transactions.map((transaction) => (
          <div key={transaction.id} className="stack" style={{ gap: "0.5rem" }}>
            <TransactionRow
              transaction={transaction}
              reversing={reverseMutation.isPending}
              onReverse={
                !transaction.isReversal && !reversedIds.has(transaction.id)
                  ? () => setConfirmId(transaction.id)
                  : undefined
              }
            />
            {confirmId === transaction.id ? (
              <div className="stack" style={{ gap: "0.5rem" }}>
                <FormMessage tone="info">
                  This posts a reversal transaction. The original stays in the ledger.
                </FormMessage>
                <div className="row" style={{ gap: "0.5rem" }}>
                  <Button
                    variant="ghost"
                    loading={reverseMutation.isPending}
                    onClick={() => reverseMutation.mutate(transaction.id)}
                  >
                    Confirm reversal
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {query.hasNextPage ? (
          <Button
            variant="ghost"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </Button>
        ) : null}
      </div>
    </Screen>
  );
}
