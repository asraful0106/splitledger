import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";
import { AppError, ErrorCode } from "../errors";

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  const amountStr = match?.[1];
  const unitStr = match?.[2];
  const unit = unitStr ? UNIT_MS[unitStr] : undefined;

  if (!amountStr || !unit) {
    throw new Error(`Invalid duration: ${value}`);
  }

  return Number(amountStr) * unit;
}

export function newFamilyId(): string {
  return randomUUID();
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessKey);
}

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, accessKey);
    if (payload.type !== "access" || typeof payload.sub !== "string") {
      throw new AppError(ErrorCode.unauthenticated, "Invalid access token", 401);
    }
    return payload.sub;
  } catch {
    throw new AppError(ErrorCode.unauthenticated, "Invalid access token", 401);
  }
}
