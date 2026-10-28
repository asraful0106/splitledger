import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`btn ${variant === "ghost" ? "btn-ghost" : ""} ${className ?? ""}`.trim()}
      disabled={disabled === true || loading}
      {...rest}
    >
      {loading ? <Spinner label="Working" /> : null}
      <span>{children}</span>
    </button>
  );
}
