import type { CookieOptions, Response } from "express";
import { env } from "../env";
import { parseDurationMs } from "./tokens";

const REFRESH_PATH = "/api/v1/auth";

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_PATH,
  };
}

export function setRefreshCookie(res: Response, token: string, ttl: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, {
    ...baseOptions(),
    maxAge: parseDurationMs(ttl),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, baseOptions());
}

export function readRefreshCookie(
  cookies: Record<string, string | undefined>,
): string | undefined {
  return cookies[env.REFRESH_COOKIE_NAME];
}
