// Money is handled in ngwee (K1 = 100 ngwee) as whole numbers everywhere: in the database,
// in calculations, and between server and browser. Kwacha only appear when shown or typed.

/** "K1,250.50" from 125050. */
export function formatKwacha(ngwee: number): string {
  const negative = ngwee < 0;
  const abs = Math.abs(ngwee);
  const kwacha = Math.floor(abs / 100).toLocaleString("en-GB");
  const cents = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}K${kwacha}.${cents}`;
}

/**
 * Parses what a shopkeeper types into ngwee: "12", "12.5", "12.50", "K12.50", "1,250".
 * Returns null for anything else (letters, more than two decimals, negatives).
 * Works on the digits as text, so "0.1" + "0.2" style float errors can't creep in.
 */
export function parseKwacha(input: string): number | null {
  const s = input.trim().replace(/^k/i, "").trim();
  // Commas are only allowed as thousands separators ("1,250", "12,500"). "12,50" is refused
  // rather than read as K1,250: many phones type a comma for the decimal point, and that
  // mistake would price an item a hundred times too high.
  const m = /^(\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]!.replace(/,/g, ""));
  const cents = Number((m[2] ?? "").padEnd(2, "0"));
  return whole * 100 + cents;
}

/** Profit margin as a share of the selling price, e.g. 0.25 for 25%. Null when price is 0. */
export function margin(costNgwee: number, priceNgwee: number): number | null {
  if (priceNgwee <= 0) return null;
  return Math.round(((priceNgwee - costNgwee) / priceNgwee) * 1000) / 1000;
}
