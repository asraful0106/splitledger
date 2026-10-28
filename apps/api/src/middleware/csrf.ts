import type { RequestHandler } from "express";
import { AppError, ErrorCode } from "../errors";

const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "XMLHttpRequest";

export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.get(CSRF_HEADER) !== CSRF_VALUE) {
    next(new AppError(ErrorCode.forbidden, "Missing CSRF header", 403));
    return;
  }
  next();
};
