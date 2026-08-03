/**
 * Windows terminal activation tokens.
 *
 * An administrator issues one token per till from Settings → Terminal
 * Activation. The till redeems the code once, then keeps checking the token
 * status so management can disconnect a machine remotely.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { decryptActivation, encryptActivation, type ActivationPayload } from "./terminal-crypto";

export const POS_SUPABASE_URL =
  (import.meta.env["VITE_SUPABASE_EXTERNAL_URL"] as string | undefined) ??
  "https://qhrufhtbeguxydenzfey.supabase.co";

export const POS_SUPABASE_KEY =
  (import.meta.env["VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY"] as string | undefined) ??
  "sb_publishable_QwVvttLzDle_xTwP3L7Dyg_A6XM-cC-";

export type TokenStatus = "active" | "used" | "revoked";

export type TerminalToken = {
  id: string;
  locationId: string | null;
  locationName: string;
  deviceName: string;
  status: TokenStatus;
  createdAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
  reissuedAt: string | null;
  replacedBy: string | null;
  claimedByDevice: string | null;
  claimedAt: string | null;
};

/** The table is not in the generated types, so queries go through a loose view. */
type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => any;
    insert: (rows: unknown) => PromiseLike<{ error: { message: string } | null }>;
    upsert: (
      rows: unknown,
      options?: { onConflict?: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
    update: (values: unknown) => any;
    delete: () => any;
  };
};

const table = () => (supabaseExternal as unknown as LooseClient).from("terminal_tokens");
const storesTable = () => (supabaseExternal as unknown as LooseClient).from("stores");

/** Narrow SECURITY DEFINER helpers — the only token access an unregistered till has. */
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabaseExternal as unknown as { rpc: (n: string, a: unknown) => PromiseLike<any> }).rpc(
    fn,
    args,
  );

export type TokenLocation = {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
};

/**
 * The token row references the central stores table. Locations may still live
 * only in local state (older installs, or a queued sync that never drained),
 * so mirror them up before anything depends on the reference.
 */
export async function ensureLocations(locations: TokenLocation[]): Promise<void> {
  if (!locations.length) return;
  const { error } = await storesTable().upsert(
    locations.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      address: l.address || null,
      phone: l.phone || null,
    })),
    { onConflict: "id" },
  );
  if (error) throw error;
}

const asStatus = (value: unknown): TokenStatus =>
  value === "revoked" ? "revoked" : value === "used" ? "used" : "active";

const rowToToken = (r: Record<string, any>): TerminalToken => ({
  id: r.id,
  locationId: r.location_id ?? null,
  locationName: r.location_name ?? "",
  deviceName: r.device_name ?? "",
  status: asStatus(r.status),
  createdAt: r.created_at,
  activatedAt: r.activated_at ?? null,
  revokedAt: r.revoked_at ?? null,
  lastSeenAt: r.last_seen_at ?? null,
  reissuedAt: r.reissued_at ?? null,
  replacedBy: r.replaced_by ?? null,
  claimedByDevice: r.claimed_by_device ?? null,
  claimedAt: r.claimed_at ?? null,
});

/* ----------------------------- admin surface ---------------------------- */

export async function listTerminalTokens(): Promise<TerminalToken[]> {
  const { data, error } = await table().select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToToken);
}

/** Create the token row and return the base64 activation code for the till. */
export async function issueTerminalToken(input: {
  location: TokenLocation;
  locationName: string;
  deviceName: string;
}): Promise<{ token: TerminalToken; code: string }> {
  // Self-healing: guarantee the referenced location row exists.
  await ensureLocations([input.location]);
  const id = crypto.randomUUID();
  const row = {
    id,
    location_id: input.location.id,
    location_name: input.locationName,
    device_name: input.deviceName,
    status: "active" as const,
    created_at: new Date().toISOString(),
  };
  const { error } = await table().insert([row]);
  if (error) throw error;

  const payload: ActivationPayload = {
    token_id: id,
    location_id: input.location.id,
    location_name: input.locationName,
    supabase_url: POS_SUPABASE_URL,
    supabase_key: POS_SUPABASE_KEY,
  };
  return { token: rowToToken(row), code: await encryptActivation(payload) };
}

export async function revokeTerminalToken(id: string): Promise<void> {
  const { error } = await table()
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Replace the code of an existing terminal without creating a second entry for
 * the same counter: the old row is retired and a new row inherits the device
 * name and location, so the branch keeps one row in the table.
 */
export async function reissueTerminalToken(
  token: TerminalToken,
): Promise<{ token: TerminalToken; code: string }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = {
    id,
    location_id: token.locationId,
    location_name: token.locationName,
    device_name: token.deviceName,
    status: "active" as const,
    created_at: now,
    reissued_at: now,
  };
  const { error } = await table().insert([row]);
  if (error) throw error;

  const { error: retireError } = await table()
    .update({ status: "revoked", revoked_at: now, replaced_by: id })
    .eq("id", token.id);
  if (retireError) throw retireError;

  const payload: ActivationPayload = {
    token_id: id,
    location_id: token.locationId ?? "",
    location_name: token.locationName,
    supabase_url: POS_SUPABASE_URL,
    supabase_key: POS_SUPABASE_KEY,
  };
  return { token: rowToToken(row), code: await encryptActivation(payload) };
}

export async function restoreTerminalToken(id: string): Promise<void> {
  const { error } = await table().update({ status: "active", revoked_at: null }).eq("id", id);
  if (error) throw error;
}

/**
 * Remove a retired entry from the table. Only a revoked or already-spent code
 * can be deleted, so a live till is never cut off by a stray click.
 */
export async function deleteTerminalToken(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id).neq("status", "active");
  if (error) throw error;
}

/* --------------------------- terminal surface --------------------------- */

export type TerminalConfig = {
  tokenId: string;
  locationId: string;
  locationName: string;
  supabaseUrl: string;
  supabaseKey: string;
  activatedAt: string;
};

const CONFIG_KEY = "pos.terminal.config";
const EVENT = "pos:terminal-config-changed";

export function readTerminalConfig(): TerminalConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as TerminalConfig) : null;
  } catch {
    return null;
  }
}

export function writeTerminalConfig(config: TerminalConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  void desktopBridge()?.writeTerminalConfig(config);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Called when a token is revoked — the till loses its credentials entirely. */
export function clearTerminalConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CONFIG_KEY);
  void desktopBridge()?.writeTerminalConfig(null);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/* --------------- desktop mirror (survives app updates) ------------------ */

type TerminalBridge = {
  readTerminalConfig: () => Promise<{ ok: boolean; config?: TerminalConfig | null }>;
  writeTerminalConfig: (config: TerminalConfig | null) => Promise<{ ok: boolean }>;
};

const desktopBridge = (): TerminalBridge | null => {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { pos?: Partial<TerminalBridge> }).pos;
  return api && typeof api.writeTerminalConfig === "function" ? (api as TerminalBridge) : null;
};

/**
 * An installer refresh can wipe the renderer's storage. The desktop shell keeps
 * a copy of the activation in its user-data folder, so the till comes back
 * already registered instead of asking for a new code.
 */
export async function restoreTerminalConfigFromDisk(): Promise<TerminalConfig | null> {
  const bridge = desktopBridge();
  if (!bridge || readTerminalConfig()) return readTerminalConfig();
  try {
    const result = await bridge.readTerminalConfig();
    const config = result?.config;
    if (!config?.tokenId) return null;
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(EVENT));
    return config;
  } catch {
    return null;
  }
}

export function subscribeTerminalConfig(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export const TERMINAL_CONFIG_EVENT = EVENT;

/** Look the token up by id. `null` means the network answered "no such token". */
export async function fetchTokenStatus(
  tokenId: string,
): Promise<{ status: TokenStatus; locationName: string } | null> {
  const { data, error } = await rpc("terminal_token_status", { p_token_id: tokenId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    status: row.status === "revoked" ? "revoked" : "active",
    locationName: row.location_name ?? "",
  };
}

export async function stampHeartbeat(tokenId: string): Promise<void> {
  await rpc("terminal_token_heartbeat", { p_token_id: tokenId, p_activate: false });
}

export class ActivationError extends Error {}

/**
 * Turn a failed status lookup into a message an operator can act on. The old
 * blanket "cannot reach the server" hid the common case: the database is
 * missing the activation helpers (PGRST202).
 */
function activationFailureMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? "";
  const message = err?.message ?? "";
  if (code === "PGRST202" || /terminal_token_status/.test(message)) {
    return "This database is missing the terminal activation setup. Run supabase/schema11.sql on the POS database, then try again.";
  }
  if (
    e instanceof TypeError ||
    /failed to fetch|network|load failed/i.test(message)
  ) {
    return "Cannot reach the server to verify this code. Check the connection.";
  }
  return message
    ? `Could not verify this activation code: ${message}`
    : "Could not verify this activation code. Try again in a moment.";
}

/** Decrypt, verify against the server and register this machine. */
export async function activateTerminal(code: string): Promise<TerminalConfig> {
  let payload: ActivationPayload;
  try {
    payload = await decryptActivation(code);
  } catch {
    throw new ActivationError("This activation code is not valid.");
  }

  const remote = await fetchTokenStatus(payload.token_id).catch((e: unknown) => {
    throw new ActivationError(activationFailureMessage(e));
  });
  if (!remote) throw new ActivationError("This activation code is not recognised.");
  if (remote.status === "revoked") {
    throw new ActivationError("This activation code has been revoked by management.");
  }

  const config: TerminalConfig = {
    tokenId: payload.token_id,
    locationId: payload.location_id,
    locationName: remote.locationName || payload.location_name,
    supabaseUrl: payload.supabase_url,
    supabaseKey: payload.supabase_key,
    activatedAt: new Date().toISOString(),
  };
  writeTerminalConfig(config);
  await rpc("terminal_token_heartbeat", { p_token_id: config.tokenId, p_activate: true });
  return config;
}
