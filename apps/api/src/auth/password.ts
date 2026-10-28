import { hash, verify } from "@node-rs/argon2";
import { AppError, ErrorCode } from "../errors";
import { COMMON_PASSWORDS } from "./common-passwords";

const ARGON2ID = 2;

const HASH_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export function assertPasswordAcceptable(password: string, email: string): void {
  if (password.length < 10) {
    throw new AppError(ErrorCode.validationError, "Password must be at least 10 characters", 422);
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new AppError(ErrorCode.validationError, "Password is too common", 422);
  }

  const localPart = email.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
    throw new AppError(ErrorCode.validationError, "Password must not contain your email", 422);
  }
}
