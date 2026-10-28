import type { ReactNode } from "react";

export function FormMessage({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <div className={`msg msg-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span>{children}</span>
    </div>
  );
}
