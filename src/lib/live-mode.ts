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
  "pos.ui.scale",
  "pos.ui.theme",
  "pos.theme",
  "pos.terminal.id",
  "pos.terminal.token",
  "pos.store.last",
  "pos.android.update.dismissed",
  "pos.journal.terminalId",
];

export function isUiKey(key: string): boolean {
  return UI_STORAGE_KEYS.includes(key);
}
