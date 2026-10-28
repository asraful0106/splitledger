import { env } from "../env";
import { db, isUniqueViolation, withTransaction, type Queryable } from "../db/tx";
import { AppError, ErrorCode } from "../errors";
import { sendMail } from "../mail/mailer";
import { passwordChangedTemplate } from "../mail/templates/password-changed";
import { resetPasswordTemplate } from "../mail/templates/reset-password";
import { tokenReuseAlertTemplate } from "../mail/templates/token-reuse-alert";
import { verifyEmailTemplate } from "../mail/templates/verify-email";
import * as auditRepo from "../repositories/audit-log.repo";
import * as emailTokensRepo from "../repositories/email-tokens.repo";
import * as refreshRepo from "../repositories/refresh-tokens.repo";
import * as usersRepo from "../repositories/users.repo";
import { assertPasswordAcceptable, hashPassword, verifyPassword } from "./password";
import {
  generateOpaqueToken,
  hashToken,
  newFamilyId,
  parseDurationMs,
  signAccessToken,
} from "./tokens";

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface SessionResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresInMs: number;
}

function toPublicUser(user: usersRepo.User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function createSession(
  q: Queryable,
  input: {
    userId: string;
    userAgent: string | null;
    ip: string | null;
    familyId?: string | undefined;
  },
): Promise<{ id: string; token: string; expiresInMs: number }> {
  const token = generateOpaqueToken();
  const expiresInMs = parseDurationMs(env.REFRESH_TOKEN_TTL);

  const row = await refreshRepo.insertRefreshToken(q, {
    userId: input.userId,
    familyId: input.familyId ?? newFamilyId(),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + expiresInMs),
    userAgent: input.userAgent,
    ip: input.ip,
  });

  return { id: row.id, token, expiresInMs };
}

async function createUnverifiedUser(input: {
  email: string;
  passwordHash: string;
}): Promise<{ user: usersRepo.User; verifyToken: string }> {
  try {
    return await withTransaction(async (tx) => {
      const user = await usersRepo.insertUser(tx, input);
      const verifyToken = generateOpaqueToken();
      await emailTokensRepo.insertEmailToken(tx, {
        userId: user.id,
        type: "verify",
        tokenHash: hashToken(verifyToken),
        expiresAt: new Date(Date.now() + parseDurationMs(env.EMAIL_VERIFY_TTL)),
      });
      return { user, verifyToken };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(ErrorCode.emailTaken, "Email is already registered", 409);
    }
    throw error;
  }
}

export async function register(input: {
  email: string;
  password: string;
  ip: string | null;
}): Promise<PublicUser> {
  assertPasswordAcceptable(input.password, input.email);

  const existing = await usersRepo.findUserByEmail(db, input.email);
  if (existing) {
    throw new AppError(ErrorCode.emailTaken, "Email is already registered", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const { user, verifyToken } = await createUnverifiedUser({
    email: input.email,
    passwordHash,
  });

  await auditRepo.insertAuditLog(db, {
    userId: user.id,
    event: "user_registered",
    ip: input.ip,
  });
  await sendMail({ to: user.email, ...verifyEmailTemplate(verifyToken) });

  return toPublicUser(user);
}

export async function verifyEmail(input: { token: string; ip: string | null }): Promise<void> {
  const existing = await emailTokensRepo.findEmailTokenByHash(db, hashToken(input.token));

  if (!existing || existing.type !== "verify" || existing.usedAt) {
    throw new AppError(ErrorCode.invalidToken, "Invalid verification token", 400);
  }
  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError(ErrorCode.tokenExpired, "Verification token expired", 400);
  }

  const now = new Date();
  await withTransaction(async (tx) => {
    await emailTokensRepo.markEmailTokenUsed(tx, existing.id, now);
    await usersRepo.markEmailVerified(tx, existing.userId, now);
  });

  await auditRepo.insertAuditLog(db, {
    userId: existing.userId,
    event: "email_verified",
    ip: input.ip,
  });
}

export async function login(input: {
  email: string;
  password: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<SessionResult> {
  const user = await usersRepo.findUserByEmail(db, input.email);
  const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : false;

  if (!user || !passwordOk) {
    if (user) {
      await auditRepo.insertAuditLog(db, {
        userId: user.id,
        event: "login_failed",
        ip: input.ip,
      });
    }
    throw new AppError(ErrorCode.invalidCredentials, "Invalid email or password", 401);
  }

  const session = await createSession(db, {
    userId: user.id,
    userAgent: input.userAgent,
    ip: input.ip,
  });

  await auditRepo.insertAuditLog(db, { userId: user.id, event: "login", ip: input.ip });

  const accessToken = await signAccessToken(user.id);

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken: session.token,
    refreshExpiresInMs: session.expiresInMs,
  };
}

type RefreshOutcome =
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "reuse"; email: string }
  | {
      kind: "ok";
      user: PublicUser;
      accessToken: string;
      refreshToken: string;
      refreshExpiresInMs: number;
    };

export async function refresh(input: {
  token: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<SessionResult> {
  const tokenHash = hashToken(input.token);

  const outcome = await withTransaction<RefreshOutcome>(async (tx) => {
    const existing = await refreshRepo.findRefreshTokenByHashForUpdate(tx, tokenHash);

    if (!existing) {
      return { kind: "invalid" };
    }

    if (existing.revokedAt) {
      await refreshRepo.revokeRefreshFamily(tx, existing.familyId);
      await auditRepo.insertAuditLog(tx, {
        userId: existing.userId,
        event: "token_reuse",
        ip: input.ip,
      });
      const user = await usersRepo.findUserById(tx, existing.userId);
      return { kind: "reuse", email: user?.email ?? "" };
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      return { kind: "expired" };
    }

    const user = await usersRepo.findUserById(tx, existing.userId);
    if (!user) {
      return { kind: "invalid" };
    }

    const next = await createSession(tx, {
      userId: user.id,
      userAgent: input.userAgent,
      ip: input.ip,
      familyId: existing.familyId,
    });
    await refreshRepo.revokeRefreshToken(tx, existing.id, next.id);

    const accessToken = await signAccessToken(user.id);

    return {
      kind: "ok",
      user: toPublicUser(user),
      accessToken,
      refreshToken: next.token,
      refreshExpiresInMs: next.expiresInMs,
    };
  });

  switch (outcome.kind) {
    case "invalid":
      throw new AppError(ErrorCode.invalidToken, "Invalid refresh token", 401);
    case "expired":
      throw new AppError(ErrorCode.tokenExpired, "Refresh token expired", 401);
    case "reuse":
      if (outcome.email) {
        await sendMail({ to: outcome.email, ...tokenReuseAlertTemplate() });
      }
      throw new AppError(ErrorCode.tokenReuseDetected, "Refresh token reuse detected", 401);
    case "ok":
      return {
        user: outcome.user,
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
        refreshExpiresInMs: outcome.refreshExpiresInMs,
      };
  }
}

export async function logout(input: {
  token: string | undefined;
  ip: string | null;
}): Promise<void> {
  if (!input.token) {
    return;
  }

  const existing = await refreshRepo.findRefreshTokenByHash(db, hashToken(input.token));
  if (!existing || existing.revokedAt) {
    return;
  }

  await refreshRepo.revokeRefreshToken(db, existing.id, null);
  await auditRepo.insertAuditLog(db, { userId: existing.userId, event: "logout", ip: input.ip });
}

export async function logoutAll(input: { userId: string; ip: string | null }): Promise<void> {
  await refreshRepo.revokeAllUserRefreshTokens(db, input.userId);
  await auditRepo.insertAuditLog(db, {
    userId: input.userId,
    event: "logout_all",
    ip: input.ip,
  });
}

export async function forgotPassword(input: {
  email: string;
  ip: string | null;
}): Promise<void> {
  const user = await usersRepo.findUserByEmail(db, input.email);
  if (!user) {
    return;
  }

  const token = generateOpaqueToken();
  await withTransaction(async (tx) => {
    await emailTokensRepo.invalidateEmailTokens(tx, user.id, "reset");
    await emailTokensRepo.insertEmailToken(tx, {
      userId: user.id,
      type: "reset",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + parseDurationMs(env.PASSWORD_RESET_TTL)),
    });
  });

  await auditRepo.insertAuditLog(db, {
    userId: user.id,
    event: "password_reset_requested",
    ip: input.ip,
  });
  await sendMail({ to: user.email, ...resetPasswordTemplate(token) });
}

export async function resetPassword(input: {
  token: string;
  password: string;
  ip: string | null;
}): Promise<void> {
  const existing = await emailTokensRepo.findEmailTokenByHash(db, hashToken(input.token));

  if (!existing || existing.type !== "reset" || existing.usedAt) {
    throw new AppError(ErrorCode.invalidToken, "Invalid reset token", 400);
  }
  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError(ErrorCode.tokenExpired, "Reset token expired", 400);
  }

  const user = await usersRepo.findUserById(db, existing.userId);
  if (!user) {
    throw new AppError(ErrorCode.invalidToken, "Invalid reset token", 400);
  }

  assertPasswordAcceptable(input.password, user.email);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  await withTransaction(async (tx) => {
    await usersRepo.updatePasswordHash(tx, user.id, passwordHash);
    await emailTokensRepo.markEmailTokenUsed(tx, existing.id, now);
    await emailTokensRepo.invalidateEmailTokens(tx, user.id, "reset");
    await refreshRepo.revokeAllUserRefreshTokens(tx, user.id);
  });

  await auditRepo.insertAuditLog(db, {
    userId: user.id,
    event: "password_reset",
    ip: input.ip,
  });
  await sendMail({ to: user.email, ...passwordChangedTemplate() });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await usersRepo.findUserById(db, userId);
  if (!user) {
    throw new AppError(ErrorCode.unauthenticated, "User not found", 401);
  }
  return toPublicUser(user);
}
