/**
 * Server side of the cashier PIN sign-in.
 *
 * The till posts `{ username, pin }`; the PIN is checked against the central
 * database with the internal service key (never present in the browser) and,
 * on success, a device session is opened and its raw token returned once.
 */
import { signCashierSession } from "./pos-session.server";
import { serviceRest } from "./pos-relay.server";
import { startSession } from "./session-guard.server";

export type CashierLoginResult =
  | {
      ok: true;
      cashierToken: string;
      sessionToken: string;
      idleMinutes: number;
      cashier: {
        id: string;
        username: string;
        full_name: string;
        store_id: string | null;
        permissions: Record<string, boolean>;
      };
    }
  | { ok: false; error: string };

export async function cashierLoginServer(input: {
  username: string;
  pin: string;
  platform?: string | null;
  terminalId?: string | null;
}): Promise<CashierLoginResult> {
  const username = input.username.trim().toLowerCase();
  if (!username) return { ok: false, error: "Enter your username" };
  if (!/^\d{4,6}$/.test(input.pin)) return { ok: false, error: "Enter your PIN" };

  const res = await serviceRest("rpc/verify_cashier_pin", {
    method: "POST",
    body: JSON.stringify({ p_username: username, p_pin: input.pin }),
  });
  if (!res.ok) return { ok: false, error: "Could not reach the central database" };

  const rows = (await res.json()) as
    | {
        id: string;
        username: string;
        full_name: string;
        store_id: string | null;
        permissions: Record<string, boolean> | null;
      }[]
    | null;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return { ok: false, error: "Invalid username or PIN" };

  const cashier = {
    id: row.id,
    username: row.username,
    full_name: row.full_name || row.username,
    store_id: row.store_id ?? null,
    permissions: row.permissions ?? {},
  };

  const session = await startSession({
    kind: "cashier",
    label: cashier.full_name,
    staffUserId: cashier.username,
    cashierId: cashier.id,
    branchId: cashier.store_id,
    terminalId: input.terminalId ?? null,
    platform: input.platform ?? null,
  });

  return {
    ok: true,
    cashierToken: signCashierSession({ id: cashier.id, username: cashier.username }),
    sessionToken: session.token,
    idleMinutes: session.idleMinutes,
    cashier,
  };
}