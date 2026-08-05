/**
 * Region-based clock.
 *
 * Terminals are often set up with a wrong or drifting PC clock. When an admin
 * picks a region, every displayed and printed time is rendered in that zone
 * instead of the machine's own. Stored values stay absolute ISO timestamps.
 */
let zone = "";

/** Common regions offered in settings; "" means "use this computer". */
export const TIME_ZONES = [
  "UTC",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];

/** Called whenever settings load or change. */
export function setPosTimeZone(next: string | undefined) {
  zone = (next ?? "").trim();
}

export function posTimeZone(): string {
  return zone;
}

/** The zone actually in force, resolved for display. */
export function effectiveTimeZone(): string {
  return zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const opts = (extra: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions =>
  zone ? { ...extra, timeZone: zone } : extra;

const asDate = (value: string | number | Date) =>
  value instanceof Date ? value : new Date(value);

export function formatDateTime(value: string | number | Date, extra: Intl.DateTimeFormatOptions = {}) {
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, opts(extra));
}

export function formatTime(value: string | number | Date, extra: Intl.DateTimeFormatOptions = {}) {
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, opts(extra));
}

export function formatDate(value: string | number | Date, extra: Intl.DateTimeFormatOptions = {}) {
  const d = asDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, opts(extra));
}
