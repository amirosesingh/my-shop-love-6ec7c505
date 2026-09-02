/**
 * Server side of the boot check: is this device still allowed to work?
 *
 * Two things must hold — the credential is live (a signed cashier session, an
 * activation token that has not been revoked, or a staff account the central
 * database still recognises) AND the branch it belongs to still exists.
 */
import { hasServiceKey, serviceRest, verifyRelayCaller } from "@/core/api/pos-relay.server";

export type VerifyInput = {
  sessionToken?: string;
  cashierToken?: string;
  terminalToken?: string;
  accessToken?: string;
  storeId?: string;
};

export type VerifyResult = {
  ok: boolean;
  /** why the session is refused: "revoked" | "branch_missing" | "unknown" */
  reason?: "revoked" | "branch_missing" | "unknown" | "unavailable";
  kind?: "cashier" | "terminal" | "staff";
  storeId?: string | null;
};

/** True when the branch exists in the central database. */
export async function branchExists(storeId: string): Promise<boolean> {
  const res = await serviceRest(`stores?id=eq.${encodeURIComponent(storeId)}&select=id&limit=1`);
  if (!res.ok) return true; // a read failure is a connectivity problem, not a deletion
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}

export async function verifySessionServer(input: VerifyInput): Promise<VerifyResult> {
  if (!hasServiceKey()) return { ok: true, reason: "unavailable" };
  if (!input.sessionToken && !input.cashierToken && !input.terminalToken && !input.accessToken)
    return { ok: false, reason: "unknown" };

  let caller: Awaited<ReturnType<typeof verifyRelayCaller>>;
  try {
    caller = await verifyRelayCaller(input);
  } catch {
    return { ok: false, reason: "revoked" };
  }

  const storeId = input.storeId?.trim() || caller.storeId || null;
  if (storeId && !(await branchExists(storeId)))
    return { ok: false, reason: "branch_missing", kind: caller.kind, storeId };

  return { ok: true, kind: caller.kind, storeId };
}
