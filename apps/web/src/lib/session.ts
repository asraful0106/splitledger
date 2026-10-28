import { apiFetch } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export function register(input: {
  email: string;
  password: string;
}): Promise<{ user: AuthUser }> {
  return apiFetch("/auth/register", { method: "POST", body: input, auth: false });
}

export function verifyEmail(token: string): Promise<{ verified: boolean }> {
  return apiFetch("/auth/verify-email", { method: "POST", body: { token }, auth: false });
}

export function login(input: { email: string; password: string }): Promise<AuthSession> {
  return apiFetch("/auth/login", { method: "POST", body: input, auth: false });
}

export function logout(): Promise<{ ok: boolean }> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function logoutAll(): Promise<{ ok: boolean }> {
  return apiFetch("/auth/logout-all", { method: "POST" });
}

export function me(): Promise<{ user: AuthUser }> {
  return apiFetch("/auth/me");
}

export function forgotPassword(email: string): Promise<{ ok: boolean }> {
  return apiFetch("/auth/forgot-password", { method: "POST", body: { email }, auth: false });
}

export function resetPassword(input: {
  token: string;
  password: string;
}): Promise<{ ok: boolean }> {
  return apiFetch("/auth/reset-password", { method: "POST", body: input, auth: false });
}
