import { Spinner } from "../components/Spinner";

export function SplashScreen() {
  return (
    <main className="screen screen-center">
      <div className="stack" style={{ alignItems: "center", gap: "0.75rem" }}>
        <Spinner label="Loading" />
        <span className="muted">Loading…</span>
      </div>
    </main>
  );
}
