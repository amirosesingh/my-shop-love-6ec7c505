/**
 * Strict money parsing for required fields.
 *
 * An empty or non-numeric box is *no value* — never zero. A cashier who
 * genuinely counted nothing has to type `0`.
 */
export function parseAmount(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = (value ?? "").toString().trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Same as `parseAmount` but also rejects negatives. */
export function parsePositiveAmount(value: string | number | null | undefined): number | null {
  const n = parseAmount(value);
  return n === null || n < 0 ? null : n;
}