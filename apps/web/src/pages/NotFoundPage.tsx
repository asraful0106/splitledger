import { Link } from "react-router-dom";
import { Screen } from "../components/Screen";

export function NotFoundPage() {
  return (
    <Screen>
      <div className="auth-card enter">
        <div className="stack">
          <span className="auth-brand">SplitLedger</span>
          <h1 className="auth-title">Page not found</h1>
          <p className="auth-subtitle">That page does not exist.</p>
        </div>
        <div className="auth-footer">
          <Link className="link" to="/">
            Go home
          </Link>
        </div>
      </div>
    </Screen>
  );
}
