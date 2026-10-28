import { describe, expect, it } from "vitest";
import { areaPath, compactMoney, nearestIndex, niceCeiling, smoothPath } from "./chart";

describe("niceCeiling", () => {
  it("rounds up to a readable step", () => {
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(0.4)).toBe(0.5);
    expect(niceCeiling(1)).toBe(1);
    expect(niceCeiling(1.2)).toBe(2);
    expect(niceCeiling(3.5)).toBe(5);
    expect(niceCeiling(7)).toBe(10);
    expect(niceCeiling(1200)).toBe(2000);
  });
});

describe("nearestIndex", () => {
  it("snaps to the closest x", () => {
    const xs = [0, 10, 20, 30];
    expect(nearestIndex(-5, xs)).toBe(0);
    expect(nearestIndex(9, xs)).toBe(1);
    expect(nearestIndex(16, xs)).toBe(2);
    expect(nearestIndex(100, xs)).toBe(3);
    expect(nearestIndex(5, [])).toBe(-1);
  });
});

describe("paths", () => {
  const points = [
    { x: 0, y: 10 },
    { x: 10, y: 4 },
    { x: 20, y: 8 },
  ];

  it("builds a smooth cubic path", () => {
    const path = smoothPath(points);
    expect(path.startsWith("M 0 10")).toBe(true);
    expect(path.match(/C/g)).toHaveLength(2);
    expect(path.endsWith("20 8")).toBe(true);
  });

  it("handles a single point and empty input", () => {
    expect(smoothPath([{ x: 1, y: 2 }])).toBe("M 1 2");
    expect(smoothPath([])).toBe("");
    expect(areaPath([], 0)).toBe("");
  });

  it("closes the area to the baseline", () => {
    const path = areaPath(points, 30);
    expect(path.endsWith("L 20 30 L 0 30 Z")).toBe(true);
  });
});

describe("compactMoney", () => {
  it("uses the currency symbol and compact notation", () => {
    expect(compactMoney(120000n, "BDT")).toContain("\u09F3");
    expect(compactMoney(120000n, "USD")).toMatch(/\$1\.2K|\$1,2K|\$1\.2k/);
  });
});
