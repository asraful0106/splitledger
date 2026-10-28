import type { Queryable } from "../db/tx";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
  created_at: Date;
}

const COLUMNS = "id, email, password_hash, email_verified_at, created_at";

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
  };
}

export async function insertUser(
  db: Queryable,
  input: { email: string; passwordHash: string },
): Promise<User> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING ${COLUMNS}`,
    [input.email, input.passwordHash],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to insert user");
  }
  return mapUser(row);
}

export async function findUserByEmail(db: Queryable, email: string): Promise<User | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT ${COLUMNS} FROM users WHERE email = $1`,
    [email],
  );
  const row = rows[0];
  return row ? mapUser(row) : null;
}

export async function findUserById(db: Queryable, id: string): Promise<User | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT ${COLUMNS} FROM users WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? mapUser(row) : null;
}

export async function markEmailVerified(db: Queryable, id: string, at: Date): Promise<void> {
  await db.query("UPDATE users SET email_verified_at = $2 WHERE id = $1", [id, at]);
}

export async function updatePasswordHash(
  db: Queryable,
  id: string,
  passwordHash: string,
): Promise<void> {
  await db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, passwordHash]);
}
