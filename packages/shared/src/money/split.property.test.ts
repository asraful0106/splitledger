import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PartInput } from "./split";
import { split } from "./split";

function partsFromBps(bps: number[]): PartInput[] {
  return bps.map((bp, index) => ({
    partId: `p${index}`,
    percentageBp: bp,
    sortOrder: index,
  }));
}

const partsArb: fc.Arbitrary<PartInput[]> = fc
  .integer({ min: 1, max: 8 })
  .chain((count) =>
    fc
      .array(fc.integer({ min: 0, max: 10000 }), {
        minLength: count - 1,
        maxLength: count - 1,
      })
      .map((cuts) => {
        const points = [0, ...cuts, 10000].sort((a, b) => a - b);
        const bps: number[] = [];
        for (let i = 0; i < points.length - 1; i += 1) {
          const current = points[i] ?? 0;
          const next = points[i + 1] ?? 0;
          bps.push(next - current);
        }
        return partsFromBps(bps);
      }),
  );

const amountArb = fc.bigInt({ min: 1n, max: 10n ** 15n });

describe("split (property-based)", () => {
  it("conserves the total: entries always sum to the deposit", () => {
    fc.assert(
      fc.property(amountArb, partsArb, (amount, parts) => {
        const entries = split(amount, parts);
        const sum = entries.reduce((total, entry) => total + entry.amountMinor, 0n);
        expect(sum).toBe(amount);
      }),
      { numRuns: 500 },
    );
  });

  it("never returns a negative entry", () => {
    fc.assert(
      fc.property(amountArb, partsArb, (amount, parts) => {
        const entries = split(amount, parts);
        for (const entry of entries) {
          expect(entry.amountMinor >= 0n).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("stays within one minor unit of each ideal share", () => {
    fc.assert(
      fc.property(amountArb, partsArb, (amount, parts) => {
        const entries = split(amount, parts);
        entries.forEach((entry, index) => {
          const part = parts[index];
          if (!part) {
            return;
          }
          const ideal = (amount * BigInt(part.percentageBp)) / 10000n;
          const diff = entry.amountMinor - ideal;
          expect(diff >= 0n && diff <= 1n).toBe(true);
        });
      }),
      { numRuns: 500 },
    );
  });

  it("is deterministic for the same input", () => {
    fc.assert(
      fc.property(amountArb, partsArb, (amount, parts) => {
        expect(split(amount, parts)).toEqual(split(amount, parts));
      }),
      { numRuns: 200 },
    );
  });
});
