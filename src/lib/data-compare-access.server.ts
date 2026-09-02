/**
 * Who may read the server/shop comparison, and for which branch.
 *
 * Counts are still company data, so the caller must be a signed-in staff
 * account or an active cashier session. Everyone is pinned to their own
 * branch; only an admin may ask about a different one.
 */
export type CompareCaller =
  | { ok: false; error: string; storeId: null }
  | { ok: true; storeId: string | null; isAdmin: boolean };

async function branchOf(column: "user_id" | "id", value: string) {
  const { serviceRest } = await import("@/core/api/pos-relay.server");
  try {
    const res = await serviceRest(
      `app_users?select=store_id,role,is_active&${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}&limit=1`,
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as
      | { store_id: string | null; role: string | null; is_active: boolean | null }[]
      | null;
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}


export async function resolveCompareCaller(input: {
  accessToken?: string | undefined;
  cashierToken?: string | undefined;
  storeId?: string | null | undefined;
}): Promise<CompareCaller> {
  if (input.accessToken) {
    try {
      const { verifyPosStaff } = await import("./secure-settings.server");
      const staff = await verifyPosStaff(input.accessToken);
      const row = await branchOf("user_id", staff.userId);
      const own = row?.store_id ?? null;
      return {
        ok: true,
        isAdmin: staff.isAdmin,
        storeId: staff.isAdmin ? (input.storeId ?? own) : own,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Not signed in", storeId: null };
    }
  }

  if (input.cashierToken) {
    const { verifyCashierSession } = await import("./pos-session.server");
    const session = verifyCashierSession(input.cashierToken);
    if (session) {
      const row = await branchOf("id", session.id);
      if (row?.is_active === false) return { ok: false, error: "Account disabled", storeId: null };
      return { ok: true, isAdmin: false, storeId: row?.store_id ?? null };
    }
  }

  return { ok: false, error: "Not signed in", storeId: null };
}
