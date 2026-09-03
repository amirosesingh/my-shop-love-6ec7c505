/**
 * Terminal side of the emergency code escrow.
 *
 * A till lodges a copy of its recovery secret with the company's own backend,
 * over its activation token, so the owner can read a live code off the admin
 * screen instead of walking to the machine. The server keeps it encrypted and
 * only ever hands back six digits.
 *
 * The same call brings back the company recovery salt, which replaces the
 * salt that used to be compiled into every installer.
 */
import { isMobileShell, isWindowsShell } from "@/platform-config/features";
import { readTerminalConfig } from "@/core/activation/terminal-tokens";
import { deviceEmergencySecret } from "@/lib/emergency-pin";
import { storeCompanySalt } from "@/lib/emergency-fallback-pin";
import { serverUrl } from "@/lib/server-origin";

const MARK = "pos.emergency.escrow.at";
const EVERY_MS = 12 * 60 * 60 * 1000;

const due = (): boolean => {
  try {
    const at = Number(window.localStorage.getItem(MARK) ?? 0);
    return !Number.isFinite(at) || Date.now() - at > EVERY_MS;
  } catch {
    return true;
  }
};

/**
 * Send the secret once (then at most twice a day). Silent on every failure —
 * an offline till simply escrows the next time it is online.
 */
export async function syncEmergencyEscrow(force = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isWindowsShell() && !isMobileShell()) return false;
  if (!force && !due()) return false;

  const config = readTerminalConfig();
  if (!config?.tokenId) return false;

  const secret = await deviceEmergencySecret();
  if (!secret) return false;

  try {
    const res = await fetch(serverUrl("/api/public/emergency-escrow"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalToken: config.tokenId,
        secret,
        platform: isWindowsShell() ? "windows" : "android",
        deviceName: config.locationName ?? "",
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
      }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; companySalt?: string }
      | null;
    if (!res.ok || !body?.ok) return false;
    if (body.companySalt) await storeCompanySalt(body.companySalt);
    try {
      window.localStorage.setItem(MARK, String(Date.now()));
    } catch {
      /* storage full — retry next launch */
    }
    return true;
  } catch {
    return false;
  }
}
