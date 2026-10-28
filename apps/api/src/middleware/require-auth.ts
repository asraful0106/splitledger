import type { RequestHandler } from "express";
import { verifyAccessToken } from "../auth/tokens";
import { AppError, ErrorCode } from "../errors";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.get("authorization");

  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError(ErrorCode.unauthenticated, "Missing access token", 401));
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  verifyAccessToken(token)
    .then((userId) => {
      req.userId = userId;
      next();
    })
    .catch(next);
};
