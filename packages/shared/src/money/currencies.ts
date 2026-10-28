export const CURRENCY_CODES = [
  "BDT",
  "USD",
  "EUR",
  "GBP",
  "INR",
  "CAD",
  "AUD",
  "SGD",
  "AED",
  "MYR",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  locale: string;
}

export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: "BDT", name: "Bangladeshi taka", symbol: "\u09F3", locale: "en-BD" },
  { code: "USD", name: "US dollar", symbol: "$", locale: "en-US" },
  { code: "EUR", name: "Euro", symbol: "\u20AC", locale: "de-DE" },
  { code: "GBP", name: "Pound sterling", symbol: "\u00A3", locale: "en-GB" },
  { code: "INR", name: "Indian rupee", symbol: "\u20B9", locale: "en-IN" },
  { code: "CAD", name: "Canadian dollar", symbol: "CA$", locale: "en-CA" },
  { code: "AUD", name: "Australian dollar", symbol: "A$", locale: "en-AU" },
  { code: "SGD", name: "Singapore dollar", symbol: "S$", locale: "en-SG" },
  { code: "AED", name: "UAE dirham", symbol: "AED ", locale: "en-AE" },
  { code: "MYR", name: "Malaysian ringgit", symbol: "RM ", locale: "ms-MY" },
];

export const DEFAULT_CURRENCY: CurrencyCode = "BDT";

const BY_CODE = new Map<string, CurrencyInfo>(CURRENCIES.map((entry) => [entry.code, entry]));

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return BY_CODE.has(code);
}

export function asCurrencyCode(code: string): CurrencyCode {
  return isSupportedCurrency(code) ? code : DEFAULT_CURRENCY;
}

export function currencyInfo(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? {
    code,
    name: code,
    symbol: code,
    locale: "en-US",
  };
}
