import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { AppError, ErrorCode } from "../errors";

export interface ValidateSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        next(new AppError(ErrorCode.validationError, "Invalid request", 422, result.error.issues));
        return;
      }
      req.body = result.data;
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        next(new AppError(ErrorCode.validationError, "Invalid request", 422, result.error.issues));
        return;
      }
      req.params = result.data as typeof req.params;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        next(new AppError(ErrorCode.validationError, "Invalid request", 422, result.error.issues));
        return;
      }
      Object.assign(req.query, result.data);
    }

    next();
  };
}
