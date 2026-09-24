/**
 * Convert a form control value without ever leaking NaN or Infinity into
 * application state. Empty and malformed values keep the previous value so a
 * temporarily cleared controlled input cannot corrupt its saved settings.
 */
export function boundedInputNumber(
  value: string,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  integer = false,
): number {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = integer ? Math.round(parsed) : parsed;
  return Math.min(max, Math.max(min, normalized));
}
