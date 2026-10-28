export function parseMajorToMinor(input: string): bigint | null {
  const cleaned = input.trim().replace(/[,\s\u09F3]/g, "");
  if (cleaned === "") {
    return null;
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    return null;
  }

  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * 100n + BigInt(fraction);
}

export function minorToMajorString(minor: bigint): string {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}
