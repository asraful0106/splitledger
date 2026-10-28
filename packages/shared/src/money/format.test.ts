import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("renders zero", () => {
    expect(formatMoney(0n)).toBe("\u09F30.00");
  });

  it("renders whole taka", () => {
    expect(formatMoney(100n)).toBe("\u09F31.00");
  });

  it("renders paisa", () => {
    expect(formatMoney(1050n)).toBe("\u09F310.50");
  });

  it("renders negative amounts", () => {
    expect(formatMoney(-500n)).toBe("-\u09F35.00");
  });

  it("groups thousands", () => {
    const text = formatMoney(12345678n);
    expect(text.startsWith("\u09F3")).toBe(true);
    expect(text).toContain("456.78");
  });

  it("falls back to the currency code for unknown currencies", () => {
    expect(formatMoney(100n, "XYZ")).toBe("XYZ1.00");
  });

  it("formats a supported foreign currency with its symbol", () => {
    expect(formatMoney(100n, "USD")).toBe("$1.00");
  });
});
