import { describe, expect, it } from "vitest";
import {
  addDays,
  currentFiscalYearRange,
  currentMonthRange,
  customDateRange,
  dhakaToday,
  fiscalYearLabel,
  fiscalYearRange,
  fiscalYearStartFor,
  monthRange,
  rollingMonthRange,
  previousMonthRange,
} from "./periods";

describe("periods", () => {
  it("computes a month range in Dhaka time", () => {
    expect(monthRange(2026, 10)).toEqual({
      from: "2026-10-01T00:00:00+06:00",
      to: "2026-11-01T00:00:00+06:00",
      label: "October 2026",
    });
  });

  it("rolls December into the next year", () => {
    expect(monthRange(2026, 12).to).toBe("2027-01-01T00:00:00+06:00");
  });

  it("computes the Bangladesh fiscal year (July to June)", () => {
    expect(fiscalYearRange(2026)).toEqual({
      from: "2026-07-01T00:00:00+06:00",
      to: "2027-07-01T00:00:00+06:00",
      label: "2026\u201327",
    });
  });

  it("picks the fiscal year that contains the date", () => {
    expect(fiscalYearStartFor(new Date("2026-06-30T12:00:00Z"))).toBe(2025);
    expect(fiscalYearStartFor(new Date("2026-07-01T00:00:00Z"))).toBe(2026);
  });

  it("labels fiscal years with two digits", () => {
    expect(fiscalYearLabel(2026)).toBe("2026\u201327");
    expect(fiscalYearLabel(2099)).toBe("2099\u201300");
  });

  it("uses the Dhaka calendar day, not UTC", () => {
    expect(dhakaToday(new Date("2026-10-27T20:00:00Z"))).toEqual({
      year: 2026,
      month: 10,
      day: 28,
    });
  });

  it("derives current and previous periods from a date", () => {
    const now = new Date("2026-10-15T12:00:00+06:00");
    expect(currentMonthRange(now).from).toBe("2026-10-01T00:00:00+06:00");
    expect(previousMonthRange(now).from).toBe("2026-09-01T00:00:00+06:00");
    expect(currentFiscalYearRange(now).from).toBe("2026-07-01T00:00:00+06:00");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("builds an inclusive custom date range", () => {
    expect(customDateRange("2026-10-01", "2026-10-31")).toEqual({
      from: "2026-10-01T00:00:00+06:00",
      to: "2026-11-01T00:00:00+06:00",
      label: "2026-10-01 \u2013 2026-10-31",
    });
  });

  it("builds a rolling month range", () => {
    const now = new Date("2026-10-15T12:00:00+06:00");
    const range = rollingMonthRange(6, now);
    expect(range.from).toBe("2026-05-01T00:00:00+06:00");
    expect(range.to).toBe("2026-11-01T00:00:00+06:00");

    const yearCrossing = rollingMonthRange(3, new Date("2026-01-10T12:00:00+06:00"));
    expect(yearCrossing.from).toBe("2025-11-01T00:00:00+06:00");
  });
});
