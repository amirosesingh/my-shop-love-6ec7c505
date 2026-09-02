/**
 * Minimal, tamper-evident record of "this terminal is registered".
 *
 * It exists so the app can answer "is this till registered?" without a
 * network call, and without confusing a dead connection for a bad activation
 * code. Nothing else is cached here: no API keys, no user rows, no tables.
 *
 * The record is sealed in the per-device secure store (AES-GCM under the
 * device key, mirrored by the platform vault) and carries an HMAC over its
 * fields, so hand-editing local storage invalidates it rather than granting
 * access.
 */
import { clearDeviceSecret, deviceHmac, getDeviceSecret, setDeviceSecret } from "./device-secrets";
import { readTerminalConfig } from "./terminal-tokens";

const RECORD = "activation.record.v1";
const GRACE_KEY = "pos.activation.graceDays";
const DEFAULT_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivationRecord = {
  /** the existing terminal token id — the device identity */
  tokenId: string;
  activated: boolean;
  /** ISO timestamp of the last successful cloud verification */
  verifiedAt: string;
  /** ISO timestamp after which the offline grace period has run out */
  graceUntil: string;
  /** server-issued verification token/stamp, when the RPC returns one */
  stamp: string | null;
  mac: string;
};

export type RegistrationState = "registered" | "grace-expired" | "not-registered";

/** Offline grace window in days. Configurable per deployment, default 7. */
export function graceDays(): number {
  if (typeof window === "undefined") return DEFAULT_GRACE_DAYS;
  const raw = Number(window.localStorage.getItem(GRACE_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GRACE_DAYS;
}

export function setGraceDays(days: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(days) || days <= 0) window.localStorage.removeItem(GRACE_KEY);
  else window.localStorage.setItem(GRACE_KEY, String(Math.round(days)));
}

const body = (r: Omit<ActivationRecord, "mac">) =>
  JSON.stringify([r.tokenId, r.activated, r.verifiedAt, r.graceUntil, r.stamp ?? ""]);

/** Write (or refresh) the record after a successful verification. */
export async function writeActivationRecord(input: {
  tokenId: string;
  stamp?: string | null;
  verifiedAt?: Date;
}): Promise<ActivationRecord> {
  const at = input.verifiedAt ?? new Date();
  const fields: Omit<ActivationRecord, "mac"> = {
    tokenId: input.tokenId,
    activated: true,
    verifiedAt: at.toISOString(),
    graceUntil: new Date(at.getTime() + graceDays() * DAY_MS).toISOString(),
    stamp: input.stamp ?? null,
  };
  const record: ActivationRecord = { ...fields, mac: await deviceHmac(body(fields)) };
  await setDeviceSecret(RECORD, record);
  return record;
}

/** Read the record back, or null when absent, unreadable or tampered with. */
export async function readActivationRecord(): Promise<ActivationRecord | null> {
  const raw = await getDeviceSecret<ActivationRecord>(RECORD);
  if (!raw || typeof raw.tokenId !== "string" || typeof raw.mac !== "string") return null;
  const { mac, ...fields } = raw;
  const expected = await deviceHmac(body(fields as Omit<ActivationRecord, "mac">));
  return mac === expected ? raw : null;
}

export function clearActivationRecord(): void {
  clearDeviceSecret(RECORD);
}

export const graceValid = (record: ActivationRecord | null, now = new Date()) =>
  Boolean(record?.activated && Date.parse(record.graceUntil) > now.getTime());

/**
 * Local-only registration verdict. Never touches the network.
 *
 * A device activated before this record existed still has its sealed terminal
 * config; that counts as registered and the record is written on the next
 * successful heartbeat.
 */
export async function isRegistered(now = new Date()): Promise<RegistrationState> {
  const record = await readActivationRecord();
  if (record) return graceValid(record, now) ? "registered" : "grace-expired";
  return readTerminalConfig() ? "registered" : "not-registered";
}
