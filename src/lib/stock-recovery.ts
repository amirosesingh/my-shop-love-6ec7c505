/**
 * Stock movements that never reached the central database.
 *
 * A sale is finished the moment it is stored, so a failed stock adjustment
 * must not stop the till. It is parked here instead, with the movement id that
 * caused it, and can be retried later. Retrying is safe: the central database
 * keys each movement on its id and applies it once, so a repeat can never
 * deduct twice.
 */
import { supabase } from "@/integrations/supabase/client";

export type UnappliedMovement = {
  movementId: string;
  productId: string;
  storeId: string | null;
  delta: number;
  reason: string;
  at: string;
};

const KEY = "pos.stock.unapplied";
const LIMIT = 500;

const listeners = new Set<() => void>();

export function subscribeUnappliedStock(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const announce = () => {
  for (const l of listeners) l();
};

export function listUnappliedStock(): UnappliedMovement[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as UnappliedMovement[];
  } catch {
    return [];
  }
}

function write(rows: UnappliedMovement[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, LIMIT)));
  announce();
}

/** Park one movement. The movement id is the key, so re-parking replaces. */
export function recordUnappliedStock(entry: Omit<UnappliedMovement, "at">) {
  const rows = listUnappliedStock().filter((r) => r.movementId !== entry.movementId);
  write([{ ...entry, at: new Date().toISOString() }, ...rows]);
}

export function clearUnappliedStock(movementId: string) {
  write(listUnappliedStock().filter((r) => r.movementId !== movementId));
}

/** Send one parked movement again. Returns true when it landed. */
export async function retryUnappliedStock(movementId: string): Promise<boolean> {
  const row = listUnappliedStock().find((r) => r.movementId === movementId);
  if (!row) return true;
  try {
    const { error } = await (
      supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc("stock_apply_delta", {
      _movement_id: row.movementId,
      _product_id: row.productId,
      _store_id: row.storeId,
      _delta: row.delta,
    });
    if (error) {
      recordUnappliedStock({ ...row, reason: error.message });
      return false;
    }
    clearUnappliedStock(movementId);
    return true;
  } catch (e) {
    recordUnappliedStock({ ...row, reason: (e as Error)?.message ?? String(e) });
    return false;
  }
}

/** Retry everything parked; returns how many landed and how many are left. */
export async function retryAllUnappliedStock(): Promise<{ applied: number; remaining: number }> {
  const ids = listUnappliedStock().map((r) => r.movementId);
  let applied = 0;
  for (const id of ids) if (await retryUnappliedStock(id)) applied += 1;
  return { applied, remaining: listUnappliedStock().length };
}