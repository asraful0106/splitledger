import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { SplashScreen } from "./SplashScreen";
import { useAuth } from "./AuthContext";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <SplashScreen />;
  }
  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
