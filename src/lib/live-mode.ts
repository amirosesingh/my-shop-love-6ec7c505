/**
 * Android runs live-only.
 *
 * The phone build is a thin client of the cloud: it never keeps business data
 * on the device, never queues writes and never opens a local database. Web and
 * the Windows till keep their offline-first behaviour untouched — every caller
 * of `isLiveOnly()` falls through to the existing path when it returns false.
 */
import { isNative } from "./native";

export function isLiveOnly(): boolean {
  return isNative();
}

/** Storage keys the phone is still allowed to keep (interface preferences). */
export const UI_STORAGE_KEYS = [
  // Canonical interface preference keys — see theme.tsx and use-ui-scale.ts.
  "pos.ui-scale",
  "pos.theme",
  // Retired spellings, still listed so an older device's values are not purged
  // before the read-through migration has had a chance to move them.
  "pos.ui.scale",
  "pos.ui.theme",
  "pos.terminal.id",
  "pos.terminal.token",
  "pos.store.last",
  "pos.android.update.dismissed",
  "pos.journal.terminalId",
];


export function isUiKey(key: string): boolean {
  return UI_STORAGE_KEYS.includes(key);
}

/**
 * Device identity, not business data. These survive every start-up purge:
 * wiping them would de-register the terminal and force a new activation each
 * time Android reclaims the app (for example after opening the camera).
 */
export const DEVICE_STATE_KEYS = [
  "pos.terminal.config",
  "pos.terminal.pairing",
  "pos.terminal.revoked",
  "pos.device.key",
];

const DEVICE_STATE_PREFIXES = ["pos.secure."];

export function isDeviceStateKey(key: string): boolean {
  return (
    DEVICE_STATE_KEYS.includes(key) || DEVICE_STATE_PREFIXES.some((p) => key.startsWith(p))
  );
}

/**
 * The ticket the cashier is ringing up right now. It is the one piece of
 * business data the phone must keep: it exists nowhere else until payment,
 * hold or void, and Android routinely reclaims the app mid-sale (opening the
 * camera to scan a barcode is enough). Losing it means re-scanning the whole
 * basket. It is cleared the moment the sale is taken, held or voided.
 */
const OPEN_TICKET_PREFIX = "pos.cart.draft.";

export function isOpenTicketKey(key: string): boolean {
  return key.startsWith(OPEN_TICKET_PREFIX);
}

/** Keys the phone keeps between launches (preferences + device identity). */
export function isPersistentKey(key: string): boolean {
  return isUiKey(key) || isDeviceStateKey(key) || isOpenTicketKey(key);
}
