import type { Request } from "express";
import { AppError, ErrorCode } from "../errors";

export function currentUserId(req: Request): string {
  if (!req.userId) {
    throw new AppError(ErrorCode.unauthenticated, "Missing access token", 401);
  }
  return req.userId;
}
