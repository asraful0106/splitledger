export const ErrorCode = {
  validationError: "validation_error",
  invalidCredentials: "invalid_credentials",
  unauthenticated: "unauthenticated",
  forbidden: "forbidden",
  invalidToken: "invalid_token",
  tokenExpired: "token_expired",
  tokenReuseDetected: "token_reuse_detected",
  emailTaken: "email_taken",
  emailNotVerified: "email_not_verified",
  partsSumInvalid: "parts_sum_invalid",
  warningRequired: "warning_required",
  insufficientBalance: "insufficient_balance",
  alreadyReversed: "already_reversed",
  accountArchived: "account_archived",
  currencyLocked: "currency_locked",
  rateLimited: "rate_limited",
  notFound: "not_found",
  internalError: "internal_error",
} as const;

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCodeName;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCodeName, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
