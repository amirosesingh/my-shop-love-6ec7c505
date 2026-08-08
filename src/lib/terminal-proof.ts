/**
 * One-time device proof for a terminal claim.
 *
 * When a till wins the atomic claim it mints a random secret, sends only the
 * hash to the database and keeps the secret sealed on the device. That secret
 * is the only key that later unlocks this terminal's machine credentials, so
 * knowing the token id is no longer enough.
 */
import { getDeviceSecret, setDeviceSecret, clearDeviceSecret } from "./device-secrets";

const SECRET = "terminal-proof";

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

/** Mint a fresh proof, seal it on this device and return it with its hash. */
export async function mintDeviceProof(): Promise<{ proof: string; hash: string }> {
  const proof = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256Hex(proof);
  await setDeviceSecret(SECRET, proof);
  return { proof, hash };
}

export async function readDeviceProof(): Promise<string | null> {
  return await getDeviceSecret<string>(SECRET);
}

export function clearDeviceProof(): void {
  clearDeviceSecret(SECRET);
}

/** Platform and OS recorded against the claim, for the audit trail. */
export function deviceMeta(): { platform: "web" | "mobile" | "electron"; os: string } {
  if (typeof window === "undefined") return { platform: "web", os: "" };
  const w = window as unknown as { pos?: unknown; Capacitor?: unknown };
  const platform = w.pos ? "electron" : w.Capacitor ? "mobile" : "web";
  return { platform, os: navigator.userAgent.slice(0, 120) };
}
