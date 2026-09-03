/**
 * Server side of the emergency code.
 *
 * A till derives its recovery code from a random secret sealed in Windows
 * DPAPI or the Android Keystore. Nothing else used to hold a copy, so the
 * owner could not read a code out without walking to the machine.
 *
 * The till therefore escrows that secret once, over its own activation token.
 * It is stored encrypted with the server's SETTINGS_ENCRYPTION_KEY, so it is
 * unreadable through the data API and unreadable to anyone browsing the
 * database — only this server can unwrap it, and only to hand back a
 * six-digit code that is valid for one minute.
 *
 * Server-only: never import from a component or a route module's top level.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

import { decryptSetting, encryptSetting } from "./settings-crypto.server";

const TABLE = "terminal_recovery_secrets";
const SALT_KEY = "emergency_company_salt";

/** `YYYYMMDDHHmm` in the till's own local time — the slot a code covers. */
export function slotFor(utcOffsetMinutes: number, at = Date.now()): string {
  const local = new Date(at + utcOffsetMinutes * 60_000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(local.getUTCFullYear(), 4)}${p(local.getUTCMonth() + 1)}${p(local.getUTCDate())}` +
    `${p(local.getUTCHours())}${p(local.getUTCMinutes())}`
  );
}

/**
 * Six digits from HMAC-SHA256(secret, slot), RFC-4226 dynamic truncation.
 * Must stay byte-for-byte in step with `src/lib/emergency-pin.ts` and
 * `electron/emergency-pin.cjs`, or the code shown here opens nothing.
 */
export function codeForSlot(secret: string, slot: string): string {
  const mac = createHmac("sha256", secret).update(slot).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const value =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

/** Short, non-secret label the till prints on its own lock screen. */
export const fingerprintOf = (secret: string): string =>
  createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 8).toUpperCase();

/** Seconds left before the current code is replaced by the next one. */
export const secondsLeftInSlot = (at = Date.now()): number =>
  60 - Math.floor((at % 60_000) / 1000);

/* ----------------------------- company salt ----------------------------- */

/**
 * The clock-only "master" code used to be derived from a salt compiled into
 * every build, so anyone who unpacked an installer could open any till. The
 * salt now lives here, one per company, generated on first use and handed to
 * a terminal only over its proven activation token.
 */
export async function companySalt(): Promise<string> {
  const { serviceRest } = await import("@/core/api/pos-relay.server");
  const res = await serviceRest(
    `secure_settings?select=ciphertext&key=eq.${SALT_KEY}&limit=1`,
  );
  if (res.ok) {
    const rows = (await res.json()) as { ciphertext?: string }[];
    const stored = rows[0]?.ciphertext;
    if (stored) {
      try {
        return decryptSetting(stored);
      } catch {
        /* unreadable — mint a fresh one below */
      }
    }
  }
  const fresh = randomBytes(32).toString("hex");
  await serviceRest("secure_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        key: SALT_KEY,
        ciphertext: encryptSetting(fresh),
        hint: "emergency master code",
        updated_at: new Date().toISOString(),
      },
    ]),
  });
  return fresh;
}

/* -------------------------------- escrow -------------------------------- */

export type EscrowInput = {
  tokenId: string;
  secret: string;
  platform: string;
  deviceName: string;
  utcOffsetMinutes: number;
};

/** Store (or refresh) one till's sealed recovery secret. */
export async function saveEscrow(input: EscrowInput): Promise<{ fingerprint: string }> {
  const { serviceRest } = await import("@/core/api/pos-relay.server");
  const fingerprint = fingerprintOf(input.secret);
  const res = await serviceRest(`${TABLE}?on_conflict=terminal_token_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        terminal_token_id: input.tokenId,
        sealed_secret: encryptSetting(input.secret),
        fingerprint,
        platform: input.platform.slice(0, 40),
        device_name: input.deviceName.slice(0, 200),
        utc_offset_minutes: Math.trunc(input.utcOffsetMinutes),
        updated_at: new Date().toISOString(),
      },
    ]),
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  return { fingerprint };
}

export type EmergencyTerminal = {
  tokenId: string;
  deviceName: string;
  locationName: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
  fingerprint: string | null;
  escrowedAt: string | null;
};

/** Every registered till, with whether its recovery secret has arrived yet. */
export async function listEmergencyTerminals(): Promise<EmergencyTerminal[]> {
  const { serviceRest } = await import("@/core/api/pos-relay.server");
  const tokens = await serviceRest(
    "terminal_tokens?select=id,device_name,location_name,platform,status,last_seen_at,revoked_at&order=device_name",
  );
  if (!tokens.ok) throw new Error("Could not read the terminal list");
  const rows = (await tokens.json()) as Record<string, string | null>[];

  const escrow = await serviceRest(
    `${TABLE}?select=terminal_token_id,fingerprint,updated_at,platform`,
  );
  const sealed = escrow.ok
    ? ((await escrow.json()) as { terminal_token_id: string; fingerprint: string; updated_at: string }[])
    : [];
  const byId = new Map(sealed.map((r) => [r.terminal_token_id, r]));

  return rows
    .filter((r) => !r["revoked_at"])
    .map((r) => {
      const match = byId.get(r["id"] ?? "");
      return {
        tokenId: r["id"] ?? "",
        deviceName: r["device_name"] ?? "Unnamed till",
        locationName: r["location_name"] ?? "",
        platform: r["platform"] ?? "unknown",
        status: r["status"] ?? "active",
        lastSeenAt: r["last_seen_at"] ?? null,
        fingerprint: match?.fingerprint ?? null,
        escrowedAt: match?.updated_at ?? null,
      };
    });
}

export type RevealResult =
  | { ok: false; error: string }
  | { ok: true; code: string; fingerprint: string; expiresInSeconds: number };

/** The code that opens one specific till right now. Never returns the secret. */
export async function revealCode(tokenId: string): Promise<RevealResult> {
  const { serviceRest } = await import("@/core/api/pos-relay.server");
  const res = await serviceRest(
    `${TABLE}?select=sealed_secret,fingerprint,utc_offset_minutes&terminal_token_id=eq.${encodeURIComponent(tokenId)}&limit=1`,
  );
  if (!res.ok) return { ok: false, error: "Could not read the recovery secret" };
  const rows = (await res.json()) as
    | { sealed_secret: string; fingerprint: string; utc_offset_minutes: number | null }[]
    | null;
  const row = rows?.[0];
  if (!row)
    return {
      ok: false,
      error: "This till has not sent its recovery secret yet — open it once while it is online.",
    };
  let secret: string;
  try {
    secret = decryptSetting(row.sealed_secret);
  } catch {
    return { ok: false, error: "The stored secret could not be unsealed on this server." };
  }
  const now = Date.now();
  return {
    ok: true,
    code: codeForSlot(secret, slotFor(row.utc_offset_minutes ?? 0, now)),
    fingerprint: row.fingerprint,
    expiresInSeconds: secondsLeftInSlot(now),
  };
}

/** The company-wide master code, for a till that has never been online. */
export async function revealCompanyCode(
  utcOffsetMinutes: number,
): Promise<{ code: string; expiresInSeconds: number }> {
  const now = Date.now();
  return {
    code: codeForSlot(await companySalt(), slotFor(utcOffsetMinutes, now)),
    expiresInSeconds: secondsLeftInSlot(now),
  };
}
