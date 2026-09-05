/**
 * One meaning of "is this till online?", shared by the Terminals screen, the
 * current-terminal panel and any server-side check.
 *
 * A terminal checks in on a heartbeat. If the last check-in is recent it is
 * online; a little older and it is stale (probably asleep or on a bad link);
 * older still, or never seen, and it is offline. Revoked terminals report
 * revoked whatever their last check-in said, and a code nobody has redeemed
 * yet is simply "not activated".
 */

/** A device is online while its last check-in is inside this window. */
export const TERMINAL_ONLINE_MS = 3 * 60 * 1000;
/** Beyond online but inside this window the device is stale, not offline. */
export const TERMINAL_STALE_MS = 15 * 60 * 1000;

export type TerminalLiveStatus = "online" | "stale" | "offline" | "revoked" | "not-activated";

export type TerminalStatusInput = {
  /** token lifecycle status from the register */
  status: "active" | "used" | "revoked" | string;
  lastSeenAt: string | null;
  activatedAt?: string | null;
};

export function terminalStatus(
  input: TerminalStatusInput,
  now: number = Date.now(),
): TerminalLiveStatus {
  if (input.status === "revoked") return "revoked";
  const seen = input.lastSeenAt ? Date.parse(input.lastSeenAt) : NaN;
  const everActivated = Boolean(input.activatedAt) || input.status === "used";
  if (!everActivated && !Number.isFinite(seen)) return "not-activated";
  if (!Number.isFinite(seen)) return "offline";
  const age = now - seen;
  if (age <= TERMINAL_ONLINE_MS) return "online";
  if (age <= TERMINAL_STALE_MS) return "stale";
  return "offline";
}

export const TERMINAL_STATUS_LABEL: Record<TerminalLiveStatus, string> = {
  online: "Online",
  stale: "Not responding",
  offline: "Offline",
  revoked: "Disconnected",
  "not-activated": "Not activated",
};

/** Plain words an operator can act on. */
export const TERMINAL_STATUS_HINT: Record<TerminalLiveStatus, string> = {
  online: "Checked in just now.",
  stale: "Last check-in was a few minutes ago — the device may be asleep or on a weak connection.",
  offline: "No check-in for a while. The device is switched off or has no connection.",
  revoked: "This device was disconnected and must be activated again to be used.",
  "not-activated": "The activation code has not been used on a device yet.",
};

/** How long ago, in words. Empty string when the device has never checked in. */
export function sinceWords(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
