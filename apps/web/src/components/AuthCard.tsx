import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-card enter">
      <div className="stack">
        <span className="auth-brand">SplitLedger</span>
        <h1 className="auth-title">{title}</h1>
        {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
      </div>
      {children}
      {footer ? <div className="auth-footer">{footer}</div> : null}
    </div>
  );
}
