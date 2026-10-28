import { describe, expect, it } from "vitest";
import { SplitError, split } from "./split";

function parts(bps: number[]) {
  return bps.map((bp, index) => ({
    partId: `p${index + 1}`,
    percentageBp: bp,
    sortOrder: index,
  }));
}

describe("split", () => {
  it("splits an amount that divides cleanly", () => {
    const result = split(10000n, parts([6000, 2500, 1500]));
    expect(result.map((entry) => entry.amountMinor)).toEqual([6000n, 2500n, 1500n]);
  });

  it("distributes to the exact deposit amount", () => {
    const result = split(100n, parts([6000, 2500, 1500]));
    expect(result.map((entry) => entry.amountMinor)).toEqual([60n, 25n, 15n]);
  });

  it("uses largest remainder and breaks ties by sortOrder", () => {
    const result = split(100n, parts([3334, 3333, 3333]));
    expect(result.map((entry) => entry.amountMinor)).toEqual([34n, 33n, 33n]);
  });

  it("never loses or invents paisa", () => {
    for (const amount of [1n, 7n, 99n, 100n, 12345n, 999983n]) {
      const result = split(amount, parts([6000, 2500, 1500]));
      const sum = result.reduce((total, entry) => total + entry.amountMinor, 0n);
      expect(sum).toBe(amount);
    }
  });

  it("gives zero to a zero-percent part", () => {
    const result = split(1000n, parts([10000, 0]));
    expect(result.map((entry) => entry.amountMinor)).toEqual([1000n, 0n]);
  });

  it("captures the percentage snapshot on each entry", () => {
    const result = split(1000n, parts([7000, 3000]));
    expect(result.map((entry) => entry.percentageBpSnapshot)).toEqual([7000, 3000]);
  });

  it("returns entries in input order", () => {
    const result = split(1000n, parts([1000, 8000, 1000]));
    expect(result.map((entry) => entry.partId)).toEqual(["p1", "p2", "p3"]);
  });

  it("handles large amounts without losing precision", () => {
    const amount = 9_007_199_254_740_993n;
    const result = split(amount, parts([5000, 5000]));
    const sum = result.reduce((total, entry) => total + entry.amountMinor, 0n);
    expect(sum).toBe(amount);
  });

  it("rejects a non-positive amount", () => {
    expect(() => split(0n, parts([10000]))).toThrow(SplitError);
    expect(() => split(-1n, parts([10000]))).toThrow(SplitError);
  });

  it("rejects percentages that do not sum to 10000 bp", () => {
    expect(() => split(100n, parts([5000, 4000]))).toThrow(SplitError);
  });

  it("rejects negative percentages", () => {
    expect(() => split(100n, parts([11000, -1000]))).toThrow(SplitError);
  });

  it("rejects non-integer percentages", () => {
    expect(() => split(100n, parts([9999.5, 0.5]))).toThrow(SplitError);
  });

  it("rejects an empty part list", () => {
    expect(() => split(100n, [])).toThrow(SplitError);
  });
});
