export interface HistoryCursor {
  occurredAt: Date;
  id: string;
}

export function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(`${cursor.occurredAt.toISOString()}|${cursor.id}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string): HistoryCursor | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const separator = decoded.indexOf("|");
    if (separator < 0) {
      return null;
    }
    const occurredAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (Number.isNaN(occurredAt.getTime()) || id.length === 0) {
      return null;
    }
    return { occurredAt, id };
  } catch {
    return null;
  }
}
