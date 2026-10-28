import { DEFAULT_CURRENCY, currencyInfo } from "./currencies";

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: string): Intl.NumberFormat {
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(locale, formatter);
  }
  return formatter;
}

export function formatMoney(minor: bigint, currency: string = DEFAULT_CURRENCY): string {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const info = currencyInfo(currency);
  const text = `${info.symbol}${formatterFor(info.locale).format(Number(absolute) / 100)}`;
  return negative ? `-${text}` : text;
}
