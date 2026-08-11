/**
 * Internal (non-deliverable) email domains used by the POS.
 *
 * Staff who sign in at a till with a username get a hidden address on
 * `pos-internal.local`; activated devices get `terminal.<id>@pos.local`.
 * Anything else with an "@" is a real, external mailbox.
 */
export const INTERNAL_EMAIL_DOMAIN = "pos-internal.local";
export const TERMINAL_EMAIL_DOMAIN = "pos.local";

export const INTERNAL_EMAIL_DOMAINS = [INTERNAL_EMAIL_DOMAIN, TERMINAL_EMAIL_DOMAIN] as const;

const normalise = (input: string) => input.trim().toLowerCase();

/** True for an address on one of our own hidden domains. */
export function isInternalAddress(input: string): boolean {
  const v = normalise(input);
  return INTERNAL_EMAIL_DOMAINS.some((d) => v.endsWith(`@${d}`));
}

/** True only for a real, deliverable email address. */
export function isExternalEmail(input: string): boolean {
  const v = normalise(input);
  return v.includes("@") && !isInternalAddress(v);
}

/** True when what was typed is a bare till username (no "@" at all). */
export function isBareUsername(input: string): boolean {
  return normalise(input).length > 0 && !normalise(input).includes("@");
}

/** Anything a person types, mapped onto the address Auth expects. */
export function toLoginAddress(identifier: string): string {
  const v = normalise(identifier);
  return v.includes("@") ? v : `${v}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** The username half of an internal address, or the value unchanged. */
export function usernameFromAddress(input: string): string {
  const v = normalise(input);
  return isInternalAddress(v) ? (v.split("@")[0] ?? v) : v;
}