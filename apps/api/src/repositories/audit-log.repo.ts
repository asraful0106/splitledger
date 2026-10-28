import type { Queryable } from "../db/tx";

export interface AuditLogInput {
  userId: string | null;
  event: string;
  metadata?: Record<string, unknown> | null;
  ip: string | null;
}

export async function insertAuditLog(db: Queryable, input: AuditLogInput): Promise<void> {
  await db.query(
    "INSERT INTO audit_log (user_id, event, metadata, ip) VALUES ($1, $2, $3, $4)",
    [input.userId, input.event, input.metadata ?? null, input.ip],
  );
}
