import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import { Spinner } from "../components/Spinner";
import { messageForError } from "../lib/errors";
import { verifyEmail } from "../lib/session";

type VerifyState =
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<VerifyState>({ status: "pending" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "This link is missing its token." });
      return;
    }

    let active = true;
    verifyEmail(token)
      .then(() => {
        if (active) {
          setState({ status: "success" });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ status: "error", message: messageForError(error) });
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <Screen>
      <AuthCard title="Verify email" subtitle="Confirming your email address.">
        {state.status === "pending" ? (
          <div className="stack" style={{ alignItems: "center", gap: "0.75rem" }}>
            <Spinner label="Verifying" />
            <span className="muted">Verifying…</span>
          </div>
        ) : null}

        {state.status === "success" ? (
          <>
            <FormMessage tone="success">
              Your email is verified. You can sign in now.
            </FormMessage>
            <div className="auth-footer">
              <Link className="link" to="/login">
                Go to sign in
              </Link>
            </div>
          </>
        ) : null}

        {state.status === "error" ? (
          <>
            <FormMessage tone="error">{state.message}</FormMessage>
            <div className="auth-footer">
              <Link className="link" to="/login">
                Back to sign in
              </Link>
            </div>
          </>
        ) : null}
      </AuthCard>
    </Screen>
  );
}
