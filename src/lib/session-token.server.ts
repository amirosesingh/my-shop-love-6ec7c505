/**
 * Session tokens.
 *
 * The raw value is generated here, handed to the device once and never stored
 * server-side. What the database keeps is the SHA-256 fingerprint, so a copy of
 * the table is not a set of working keys.
 */
import { createHash, randomBytes } from "node:crypto";

/** A fresh, high-entropy token (256 bits). */
export function mintSessionToken(): string {
  return `pst_${randomBytes(32).toString("base64url")}`;
}

/** The only form of the token that is allowed to touch the database. */
export function hashSessionToken(raw: string): string {
  return createHash("sha256").update(raw.trim(), "utf8").digest("hex");
}