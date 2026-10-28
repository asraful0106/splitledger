const DHAKA_OFFSET = "+06:00";

export interface PeriodRange {
  from: string;
  to: string;
  label: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function partsOf(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

export function dhakaToday(now: Date = new Date()): { year: number; month: number; day: number } {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return partsOf(formatted);
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function monthRange(year: number, month: number): PeriodRange {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    from: `${year}-${pad(month)}-01T00:00:00${DHAKA_OFFSET}`,
    to: `${nextYear}-${pad(nextMonth)}-01T00:00:00${DHAKA_OFFSET}`,
    label: monthLabel(year, month),
  };
}

export function currentMonthRange(now: Date = new Date()): PeriodRange {
  const today = dhakaToday(now);
  return monthRange(today.year, today.month);
}

export function previousMonthRange(now: Date = new Date()): PeriodRange {
  const today = dhakaToday(now);
  const year = today.month === 1 ? today.year - 1 : today.year;
  const month = today.month === 1 ? 12 : today.month - 1;
  return monthRange(year, month);
}

export function fiscalYearLabel(startYear: number): string {
  return `${startYear}\u2013${pad((startYear + 1) % 100)}`;
}

export function fiscalYearStartFor(now: Date = new Date()): number {
  const today = dhakaToday(now);
  return today.month >= 7 ? today.year : today.year - 1;
}

export function fiscalYearRange(startYear: number): PeriodRange {
  return {
    from: `${startYear}-07-01T00:00:00${DHAKA_OFFSET}`,
    to: `${startYear + 1}-07-01T00:00:00${DHAKA_OFFSET}`,
    label: fiscalYearLabel(startYear),
  };
}

export function currentFiscalYearRange(now: Date = new Date()): PeriodRange {
  return fiscalYearRange(fiscalYearStartFor(now));
}

export function rollingMonthRange(count: number, now: Date = new Date()): PeriodRange {
  const today = dhakaToday(now);
  let year = today.year;
  let month = today.month;
  let remaining = Math.max(1, count) - 1;

  while (remaining > 0) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    remaining -= 1;
  }

  return {
    from: monthRange(year, month).from,
    to: monthRange(today.year, today.month).to,
    label: `${Math.max(1, count)} months`,
  };
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = partsOf(date);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function customDateRange(fromDate: string, toDateInclusive: string): PeriodRange {
  return {
    from: `${fromDate}T00:00:00${DHAKA_OFFSET}`,
    to: `${addDays(toDateInclusive, 1)}T00:00:00${DHAKA_OFFSET}`,
    label: `${fromDate} \u2013 ${toDateInclusive}`,
  };
}
