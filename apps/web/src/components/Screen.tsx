import type { ReactNode } from "react";

export function Screen({ children, center = true }: { children: ReactNode; center?: boolean }) {
  return <main className={`screen ${center ? "screen-center" : ""}`.trim()}>{children}</main>;
}
