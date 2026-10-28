import type { Request, Response } from "express";
import { env } from "../env";
import { AppError, ErrorCode } from "../errors";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./cookies";
import * as service from "./service";

function readCookies(req: Request): Record<string, string | undefined> {
  return req.cookies as Record<string, string | undefined>;
}

function requireUserId(req: Request): string {
  if (!req.userId) {
    throw new AppError(ErrorCode.unauthenticated, "Missing access token", 401);
  }
  return req.userId;
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const user = await service.register({ email, password, ip: req.ip ?? null });
  res.status(201).json({ data: { user } });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.body as { token: string };
  await service.verifyEmail({ token, ip: req.ip ?? null });
  res.json({ data: { verified: true } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const result = await service.login({
    email,
    password,
    userAgent: req.get("user-agent") ?? null,
    ip: req.ip ?? null,
  });
  setRefreshCookie(res, result.refreshToken, env.REFRESH_TOKEN_TTL);
  res.json({ data: { user: result.user, accessToken: result.accessToken } });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = readRefreshCookie(readCookies(req));
  if (!token) {
    throw new AppError(ErrorCode.invalidToken, "Missing refresh token", 401);
  }

  const result = await service.refresh({
    token,
    userAgent: req.get("user-agent") ?? null,
    ip: req.ip ?? null,
  });
  setRefreshCookie(res, result.refreshToken, env.REFRESH_TOKEN_TTL);
  res.json({ data: { user: result.user, accessToken: result.accessToken } });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = readRefreshCookie(readCookies(req));
  await service.logout({ token, ip: req.ip ?? null });
  clearRefreshCookie(res);
  res.json({ data: { ok: true } });
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  await service.logoutAll({ userId: requireUserId(req), ip: req.ip ?? null });
  clearRefreshCookie(res);
  res.json({ data: { ok: true } });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await service.getMe(requireUserId(req));
  res.json({ data: { user } });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  await service.forgotPassword({ email, ip: req.ip ?? null });
  res.json({ data: { ok: true } });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body as { token: string; password: string };
  await service.resetPassword({ token, password, ip: req.ip ?? null });
  res.json({ data: { ok: true } });
}
