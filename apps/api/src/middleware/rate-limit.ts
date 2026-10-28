import rateLimit from "express-rate-limit";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError, ErrorCode } from "../errors";

function rateLimitHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(ErrorCode.rateLimited, "Too many requests", 429));
}

const WINDOW_MS = 15 * 60 * 1000;

const baseOptions = {
  windowMs: WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
};

export function createAuthLimiter(): RequestHandler {
  return rateLimit({ ...baseOptions, limit: 30 });
}

export function createLoginLimiter(): RequestHandler {
  return rateLimit({ ...baseOptions, limit: 10 });
}

export function createForgotPasswordLimiter(): RequestHandler {
  return rateLimit({ ...baseOptions, limit: 5 });
}
