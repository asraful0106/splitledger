import { describe, expect, it } from "vitest";
import { CURRENCY_CODES, currencyInfo, DEFAULT_CURRENCY, isSupportedCurrency } from "./currencies";
import { formatMoney } from "./format";

describe("currency registry", () => {
  it("lists ten supported two-decimal currencies", () => {
    expect(CURRENCY_CODES).toHaveLength(10);
    expect(CURRENCY_CODES).toContain("BDT");
    expect(CURRENCY_CODES).toContain("USD");
  });

  it("recognises supported codes only", () => {
    expect(isSupportedCurrency("BDT")).toBe(true);
    expect(isSupportedCurrency("JPY")).toBe(false);
    expect(isSupportedCurrency("XYZ")).toBe(false);
  });

  it("falls back to the code for unknown currencies", () => {
    expect(currencyInfo("XYZ")).toMatchObject({ symbol: "XYZ", locale: "en-US" });
    expect(currencyInfo("USD")).toMatchObject({ symbol: "$", locale: "en-US" });
  });
});

describe("formatMoney with currencies", () => {
  it("formats taka with the Bangladeshi locale", () => {
    expect(formatMoney(12345n)).toBe("\u09F3123.45");
  });

  it("uses the currency symbol and locale", () => {
    expect(formatMoney(150000n, "USD")).toBe("$1,500.00");
    expect(formatMoney(150000n, "GBP")).toBe("\u00A31,500.00");
    expect(formatMoney(150000n, "EUR")).toContain("1.500");
    expect(formatMoney(150000n, "EUR")).toContain(",00");
  });

  it("renders negative amounts before the symbol", () => {
    expect(formatMoney(-500n, "USD")).toBe("-$5.00");
  });

  it("defaults to BDT", () => {
    expect(formatMoney(100n)).toBe(formatMoney(100n, DEFAULT_CURRENCY));
  });

  it("never throws for an unknown currency", () => {
    expect(formatMoney(100n, "XYZ")).toBe("XYZ1.00");
  });
});
