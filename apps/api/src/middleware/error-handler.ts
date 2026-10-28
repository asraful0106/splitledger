import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, ErrorCode } from "../errors";
import { logger } from "../logger";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: ErrorCode.notFound, message: "Resource not found" } });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: ErrorCode.validationError,
        message: "Invalid request",
        details: error.issues,
      },
    });
    return;
  }

  logger.error({ err: error }, "unhandled error");
  res.status(500).json({
    error: { code: ErrorCode.internalError, message: "Internal server error" },
  });
}
