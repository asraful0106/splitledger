import type { Queryable } from "../db/tx";

export interface RefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: Date;
}

const COLUMNS =
  "id, user_id, family_id, token_hash, expires_at, revoked_at, replaced_by, user_agent, ip, created_at";

function mapRefreshToken(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    familyId: row.family_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    replacedBy: row.replaced_by,
    userAgent: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at,
  };
}

export async function insertRefreshToken(
  db: Queryable,
  input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  },
): Promise<RefreshToken> {
  const { rows } = await db.query<RefreshTokenRow>(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [
      input.userId,
      input.familyId,
      input.tokenHash,
      input.expiresAt,
      input.userAgent,
      input.ip,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to insert refresh token");
  }
  return mapRefreshToken(row);
}

export async function findRefreshTokenByHash(
  db: Queryable,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const { rows } = await db.query<RefreshTokenRow>(
    `SELECT ${COLUMNS} FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  const row = rows[0];
  return row ? mapRefreshToken(row) : null;
}

export async function findRefreshTokenByHashForUpdate(
  db: Queryable,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const { rows } = await db.query<RefreshTokenRow>(
    `SELECT ${COLUMNS} FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
    [tokenHash],
  );
  const row = rows[0];
  return row ? mapRefreshToken(row) : null;
}

export async function revokeRefreshToken(
  db: Queryable,
  id: string,
  replacedBy: string | null,
): Promise<void> {
  await db.query(
    "UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1",
    [id, replacedBy],
  );
}

export async function revokeRefreshFamily(db: Queryable, familyId: string): Promise<void> {
  await db.query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL",
    [familyId],
  );
}

export async function revokeAllUserRefreshTokens(db: Queryable, userId: string): Promise<void> {
  await db.query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
}
