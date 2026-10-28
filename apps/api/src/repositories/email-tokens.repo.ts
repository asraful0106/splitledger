import type { Queryable } from "../db/tx";

export type EmailTokenType = "verify" | "reset";

export interface EmailToken {
  id: string;
  userId: string;
  type: EmailTokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface EmailTokenRow {
  id: string;
  user_id: string;
  type: EmailTokenType;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

const COLUMNS = "id, user_id, type, token_hash, expires_at, used_at, created_at";

function mapEmailToken(row: EmailTokenRow): EmailToken {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

export async function insertEmailToken(
  db: Queryable,
  input: {
    userId: string;
    type: EmailTokenType;
    tokenHash: string;
    expiresAt: Date;
  },
): Promise<EmailToken> {
  const { rows } = await db.query<EmailTokenRow>(
    `INSERT INTO email_tokens (user_id, type, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [input.userId, input.type, input.tokenHash, input.expiresAt],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to insert email token");
  }
  return mapEmailToken(row);
}

export async function findEmailTokenByHash(
  db: Queryable,
  tokenHash: string,
): Promise<EmailToken | null> {
  const { rows } = await db.query<EmailTokenRow>(
    `SELECT ${COLUMNS} FROM email_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  const row = rows[0];
  return row ? mapEmailToken(row) : null;
}

export async function markEmailTokenUsed(
  db: Queryable,
  id: string,
  at: Date,
): Promise<void> {
  await db.query("UPDATE email_tokens SET used_at = $2 WHERE id = $1", [id, at]);
}

export async function invalidateEmailTokens(
  db: Queryable,
  userId: string,
  type: EmailTokenType,
): Promise<void> {
  await db.query(
    "UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND type = $2 AND used_at IS NULL",
    [userId, type],
  );
}
