/**
 * Per-branch isolation and sync switches.
 *
 * Some branches (a standalone shop, a warehouse) keep their own inventory and
 * may be cut off from the group entirely. The switches live in the shared
 * integration settings so every terminal of that branch agrees on them.
 */
import { defaultBranchPolicy, type AppSettings, type BranchPolicy } from "@/core/types/pos-types";

export type BranchPolicyKey = keyof BranchPolicy;

export const BRANCH_POLICY_COPY: Record<
  BranchPolicyKey,
  { label: string; hint: string; onWarning: string; offWarning: string }
> = {
  privateStock: {
    label: "Private stock",
    hint: "Keep this branch's stock levels out of other branches and group totals.",
    onWarning:
      "Other branches will no longer see this branch's stock, and it will drop out of group inventory totals.",
    offWarning: "This branch's stock will be visible to every other branch again.",
  },
  privateCatalogue: {
    label: "Private catalogue",
    hint: "Products created here stay local and are hidden from other branches.",
    onWarning: "Products created at this branch from now on will not appear at other branches.",
    offWarning: "Products owned by this branch will become visible everywhere again.",
  },
  allowTransfers: {
    label: "Allow stock transfers",
    hint: "Stock may be sent to and requested from other branches.",
    onWarning: "This branch will appear again as a transfer source and destination.",
    offWarning: "No stock will be able to move in or out of this branch.",
  },
  syncInventory: {
    label: "Sync inventory",
    hint: "Push product and stock changes to the central server.",
    onWarning: "Queued product and stock changes will be pushed to the central server.",
    offWarning:
      "Product and stock changes will be held on this terminal until you switch sync back on. Nothing is lost.",
  },
  syncOther: {
    label: "Sync sales, shifts & members",
    hint: "Push bills, shifts, members and audit trail to the central server.",
    onWarning: "Queued bills, shifts and members will be pushed to the central server.",
    offWarning:
      "Bills, shifts, members and audit rows will be held on this terminal until you switch sync back on. Nothing is lost.",
  },
};

/** Effective policy for one branch — anything unset falls back to shared. */
export function branchPolicy(settings: AppSettings, storeId: string): BranchPolicy {
  return { ...defaultBranchPolicy, ...(settings.integrations.branches?.[storeId] ?? {}) };
}

/** Store ids that hide their stock from everyone else. */
export function privateStockStores(settings: AppSettings): Set<string> {
  const map = settings.integrations.branches ?? {};
  return new Set(Object.entries(map).filter(([, p]) => p?.privateStock).map(([id]) => id));
}

/**
 * Can this store see this product? Products owned by a private-catalogue
 * branch are only visible at that branch.
 */
export function productVisibleAt(
  settings: AppSettings,
  productId: string,
  storeId: string,
): boolean {
  const owner = settings.integrations.productOwners?.[productId];
  if (!owner || owner === storeId) return true;
  return !branchPolicy(settings, owner).privateCatalogue;
}

/** Tables whose writes are governed by the inventory sync switch. */
const INVENTORY_TABLES = new Set(["products", "purchase_orders", "purchase_order_items", "stores"]);

/** Should a queued write for this table leave the branch right now? */
export function syncAllowed(policy: BranchPolicy, table: string): boolean {
  return INVENTORY_TABLES.has(table) ? policy.syncInventory : policy.syncOther;
}
