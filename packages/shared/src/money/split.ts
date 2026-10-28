export interface PartInput {
  partId: string;
  percentageBp: number;
  sortOrder: number;
}

export interface SplitEntry {
  partId: string;
  amountMinor: bigint;
  percentageBpSnapshot: number;
}

const TOTAL_BP = 10_000n;

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

export function validatePercentages(parts: readonly PartInput[]): void {
  if (parts.length === 0) {
    throw new SplitError("At least one part is required");
  }

  let sum = 0;
  for (const part of parts) {
    if (!Number.isInteger(part.percentageBp)) {
      throw new SplitError(`Percentage for part ${part.partId} must be an integer`);
    }
    if (part.percentageBp < 0 || part.percentageBp > Number(TOTAL_BP)) {
      throw new SplitError(`Percentage for part ${part.partId} must be between 0 and 10000 bp`);
    }
    sum += part.percentageBp;
  }

  if (sum !== Number(TOTAL_BP)) {
    throw new SplitError(`Active parts must sum to 10000 bp (got ${sum})`);
  }
}

export function split(amountMinor: bigint, parts: readonly PartInput[]): SplitEntry[] {
  if (amountMinor <= 0n) {
    throw new SplitError("Amount must be greater than zero");
  }
  validatePercentages(parts);

  const rows = parts.map((part) => {
    const product = amountMinor * BigInt(part.percentageBp);
    return {
      part,
      base: product / TOTAL_BP,
      remainder: product % TOTAL_BP,
    };
  });

  const baseSum = rows.reduce((total, row) => total + row.base, 0n);
  let leftover = amountMinor - baseSum;

  const byRemainder = [...rows].sort((a, b) => {
    if (a.remainder !== b.remainder) {
      return a.remainder > b.remainder ? -1 : 1;
    }
    return a.part.sortOrder - b.part.sortOrder;
  });

  let index = 0;
  while (leftover > 0n && index < byRemainder.length) {
    const row = byRemainder[index];
    if (row) {
      row.base += 1n;
    }
    leftover -= 1n;
    index += 1;
  }

  return rows.map((row) => ({
    partId: row.part.partId,
    amountMinor: row.base,
    percentageBpSnapshot: row.part.percentageBp,
  }));
}
