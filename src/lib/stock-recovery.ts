/** Apply stock movements immediately to the central online database. */
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";

export type StockMovement = {
  movementId: string;
  productId: string;
  storeId: string | null;
  delta: number;
};

export type DeltaStatus = "applied" | "duplicate" | "refused";
export type DeltaOutcome = {
  movementId: string;
  status: DeltaStatus;
  code?: string;
  reason?: string | null;
};

type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Apply a batch once, online. Nothing is cached, parked, retried or persisted
 * on the device; a refusal is returned to the caller as an error.
 */
export async function applyStockDeltaBatch(movements: StockMovement[]): Promise<DeltaOutcome[]> {
  const unique = new Map<string, StockMovement>();
  for (const movement of movements) {
    if (movement.movementId && movement.productId && movement.delta !== 0) {
      unique.set(movement.movementId, movement);
    }
  }
  const batch = [...unique.values()];
  if (!batch.length) return [];

  const { data, error } = await (supabase as unknown as Rpc).rpc("stock_apply_deltas", {
    _movements: batch.map((movement) => ({
      movement_id: movement.movementId,
      product_id: movement.productId,
      store_id: movement.storeId,
      delta: movement.delta,
    })),
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    movement_id: string;
    status: DeltaStatus;
    reason: string | null;
  }>;
  const outcomes = rows.map((row) => ({
    movementId: row.movement_id,
    status: row.status,
    reason: row.reason,
  }));
  const refused = outcomes.find((outcome) => outcome.status === "refused");
  if (refused)
    throw new Error(refused.reason || `Stock movement ${refused.movementId} was refused`);
  if (outcomes.length !== batch.length)
    throw new Error("The database did not confirm every stock movement");
  return outcomes;
}
