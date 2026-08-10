/**
 * Staff provisioning, called from the admin screens.
 *
 * The browser never holds the key that can create accounts: every call here
 * goes to the server, which checks that the person asking is a supervisor.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import {
  listTerminalStaffAccounts,
  migrateCashiersToAccounts,
  preparePinSignIn,
  saveStaffAccount,
  setStaffAccountActive,
} from "@/lib/staff-admin.functions";
import type { StaffRole } from "@/lib/permissions";

export type StaffAccountInput = {
  displayName: string;
  username: string;
  pin: string;
  branchId?: string | null;
  roleSlug: string;
  baseRole: StaffRole;
  active: boolean;
};

/** Built-in levels map onto the three access tiers the database understands. */
export const dbBaseRole = (role: StaffRole): "admin" | "manager" | "staff" =>
  role === "admin" ? "admin" : role === "supervisor" || role === "warehouse" ? "manager" : "staff";

async function accessToken(): Promise<string> {
  const { data } = await supabaseExternal.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again to manage staff");
  return token;
}

/** Create a staff member, or update the one that already holds this username. */
export async function createStaffMember(input: StaffAccountInput): Promise<void> {
  const res = await saveStaffAccount({
    data: {
      accessToken: await accessToken(),
      displayName: input.displayName,
      username: input.username,
      pin: input.pin,
      branchId: input.branchId ?? null,
      roleSlug: input.roleSlug,
      baseRole: dbBaseRole(input.baseRole),
      active: input.active,
    },
  });
  if (!res.ok) throw new Error(res.error);
}

/** Turn an account on or off. A blocked person cannot sign in anywhere. */
export async function toggleStaffStatus(username: string, active: boolean): Promise<void> {
  const res = await setStaffAccountActive({
    data: { accessToken: await accessToken(), username, active },
  });
  if (!res.ok) throw new Error(res.error);
}

/** Copy any remaining old cashier records onto real accounts. */
export async function migrateLegacyCashiers(): Promise<number> {
  const res = await migrateCashiersToAccounts({ data: { accessToken: await accessToken() } });
  if (!res.ok) throw new Error(res.error);
  return res.migrated;
}

export type TerminalStaff = {
  username: string;
  fullName: string;
  roleSlug: string;
  storeId: string | null;
  pinLength: number;
};

/** Staff to show on a till's sign-in grid. */
export async function listTerminalStaff(storeId: string | null): Promise<TerminalStaff[]> {
  const res = await listTerminalStaffAccounts({ data: { storeId } });
  return res.ok ? res.staff : [];
}

/** Ask the server to make sure this person's account matches the PIN typed in. */
export async function preparePinAccount(
  username: string,
  pin: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  return preparePinSignIn({ data: { username, pin } });
}
