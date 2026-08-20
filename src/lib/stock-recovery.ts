/**
 * Central application of relative stock movements, and the queue of the ones
 * that did not land.
 *
 * A sale is finished the moment it is stored, so a failed stock adjustment
 * must not stop the till. The movement is parked here instead, keyed on the
 * movement id, and retried later. Retrying is safe: the central database
 * records each movement id once and applies it once, so a repeat can never
 * deduct twice and never creates a new movement row.
 */
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { recordDiagnostic, reasonCode } from "./diagnostics";

/** One relative stock change, keyed on the movement row that caused it. */
export type StockMovement = {
  movementId: string;
  productId: string;
  storeId: string | null;
  delta: number;
};

export type UnappliedMovement = StockMovement & {
  reason: string;
  /** Short, safe reason code. */
  code: string;
  /** False for refusals a retry can never fix (permission, unknown product). */
  retryable: boolean;
  attempts: number;
  at: string;
  nextAttemptAt: string;
};

export type DeltaStatus = "applied" | "duplicate" | "refused";
export type DeltaOutcome = {
  movementId: string;
  status: DeltaStatus;
  code?: string;
  reason?: string | null;
};

const KEY = "pos.stock.unapplied";
const LIMIT = 500;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

/** Reason codes that a retry can never resolve on its own. */
const PERMANENT = new Set(["not_permitted", "unknown_product", "invalid", "rejected"]);

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

const backoff = (attempts: number) =>
  Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);

/** Older entries were plain reasons; fill the newer fields in on read. */
function normalise(row: Partial<UnappliedMovement>): UnappliedMovement {
  const code = row.code ?? reasonCode(row.reason);
  return {
    movementId: String(row.movementId),
    productId: String(row.productId),
    storeId: row.storeId ?? null,
    delta: Number(row.delta ?? 0),
    reason: row.reason ?? "",
    code,
    retryable: row.retryable ?? !PERMANENT.has(code),
    attempts: Number(row.attempts ?? 1),
    at: row.at ?? new Date().toISOString(),
    nextAttemptAt: row.nextAttemptAt ?? new Date().toISOString(),
  };
}

export function listUnappliedStock(): UnappliedMovement[] {
  if (typeof window === "undefined") return [];
  try {
    const rows = JSON.parse(
      window.localStorage.getItem(KEY) ?? "[]",
    ) as Partial<UnappliedMovement>[];
    return rows.filter((r) => r && r.movementId).map(normalise);
  } catch {
    return [];
  }
}

function write(rows: UnappliedMovement[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, LIMIT)));
  announce();
}

/**
 * Park one movement. The movement id is the key, so re-parking replaces the
 * entry and carries the attempt count forward.
 */
export function recordUnappliedStock(
  entry: StockMovement & { reason: string; code?: string; retryable?: boolean },
) {
  const rows = listUnappliedStock();
  const previous = rows.find((r) => r.movementId === entry.movementId);
  const code = entry.code ?? reasonCode(entry.reason);
  const attempts = (previous?.attempts ?? 0) + 1;
  const next: UnappliedMovement = {
    movementId: entry.movementId,
    productId: entry.productId,
    storeId: entry.storeId,
    delta: entry.delta,
    reason: entry.reason,
    code,
    retryable: entry.retryable ?? !PERMANENT.has(code),
    attempts,
    at: new Date().toISOString(),
    nextAttemptAt: new Date(Date.now() + backoff(attempts)).toISOString(),
  };
  write([next, ...rows.filter((r) => r.movementId !== entry.movementId)]);
}

export function clearUnappliedStock(movementId: string) {
  write(listUnappliedStock().filter((r) => r.movementId !== movementId));
}

/** Entries that may be retried right now. */
export function dueUnappliedStock(now = Date.now()): UnappliedMovement[] {
  return listUnappliedStock().filter(
    (r) => r.retryable && Date.parse(r.nextAttemptAt) <= now,
  );
}

type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const rpc = () => supabase as unknown as Rpc;

const missingBatch = (message: string) =>
  reasonCode(message) === "missing_backend_object";

/**
 * Apply many movements in one round trip. Falls back to the single-movement
 * routine when the batch routine is not installed, so a till on an older
 * backend still works. Never throws: the caller's sale is already stored.
 */
export async function applyStockDeltaBatch(
  movements: StockMovement[],
): Promise<DeltaOutcome[]> {
  const usable = movements.filter((m) => m.movementId && m.productId && m.delta !== 0);
  if (!usable.length) return [];

  // One id can appear twice in a basket; the central routine answers once, so
  // send it once too.
  const unique = new Map<string, StockMovement>();
  for (const m of usable) if (!unique.has(m.movementId)) unique.set(m.movementId, m);
  const batch = [...unique.values()];

  try {
    const { data, error } = await rpc().rpc("stock_apply_deltas", {
      _movements: batch.map((m) => ({
        movement_id: m.movementId,
        product_id: m.productId,
        store_id: m.storeId,
        delta: m.delta,
      })),
    });
    if (error) {
      if (missingBatch(error.message)) return applySequentially(batch);
      return failAll(batch, error.message);
    }
    const rows = (data ?? []) as {
      movement_id: string;
      status: DeltaStatus;
      reason: string | null;
    }[];
    const seen = new Map(rows.map((r) => [r.movement_id, r]));
    return batch.map((m) => {
      const row = seen.get(m.movementId);
      if (!row) return settle(m, { movementId: m.movementId, status: "refused", code: "failed", reason: "no result" });
      return settle(m, {
        movementId: m.movementId,
        status: row.status,
        code: row.reason ?? undefined,
        reason: row.reason,
      });
    });
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    if (missingBatch(message)) return applySequentially(batch);
    return failAll(batch, message);
  }
}

/** Per-movement path, kept for backends without the batch routine. */
async function applySequentially(batch: StockMovement[]): Promise<DeltaOutcome[]> {
  const out: DeltaOutcome[] = [];
  for (const m of batch) {
    try {
      const { error } = await rpc().rpc("stock_apply_delta", {
        _movement_id: m.movementId,
        _product_id: m.productId,
        _store_id: m.storeId,
        _delta: m.delta,
      });
      out.push(
        settle(
          m,
          error
            ? { movementId: m.movementId, status: "refused", code: reasonCode(error.message), reason: error.message }
            : { movementId: m.movementId, status: "applied" },
        ),
      );
    } catch (e) {
      const message = (e as Error)?.message ?? String(e);
      out.push(
        settle(m, {
          movementId: m.movementId,
          status: "refused",
          code: reasonCode(message),
          reason: message,
        }),
      );
    }
  }
  return out;
}

function failAll(batch: StockMovement[], message: string): DeltaOutcome[] {
  const code = reasonCode(message);
  return batch.map((m) =>
    settle(m, { movementId: m.movementId, status: "refused", code, reason: message }),
  );
}

/** Record the outcome: clear on success, park with a reason on refusal. */
function settle(movement: StockMovement, outcome: DeltaOutcome): DeltaOutcome {
  if (outcome.status === "refused") {
    const code = outcome.code ?? reasonCode(outcome.reason);
    recordUnappliedStock({
      ...movement,
      reason: outcome.reason ?? code,
      code,
      retryable: !PERMANENT.has(code),
    });
    recordDiagnostic({
      kind: "stock_delta_failed",
      entity: "products",
      code,
      recordId: movement.movementId,
      storeId: movement.storeId,
    });
  } else {
    clearUnappliedStock(movement.movementId);
  }
  return outcome;
}

/** Send one parked movement again. Returns true when it landed. */
export async function retryUnappliedStock(movementId: string): Promise<boolean> {
  const row = listUnappliedStock().find((r) => r.movementId === movementId);
  if (!row) return true;
  const [outcome] = await applyStockDeltaBatch([row]);
  return outcome ? outcome.status !== "refused" : true;
}

/**
 * Retry everything that is due, in one batch. Entries refused for permission
 * or invalid data are left alone — a blind retry cannot fix them.
 */
export async function retryAllUnappliedStock(options?: {
  force?: boolean;
}): Promise<{ applied: number; remaining: number; blocked: number }> {
  const rows = options?.force
    ? listUnappliedStock().filter((r) => r.retryable)
    : dueUnappliedStock();
  if (rows.length) await applyStockDeltaBatch(rows);
  const left = listUnappliedStock();
  return {
    applied: rows.length - left.filter((r) => rows.some((x) => x.movementId === r.movementId)).length,
    remaining: left.length,
    blocked: left.filter((r) => !r.retryable).length,
  };
}

export type ReconcileReport = {
  storeId: string;
  checkedAt: string;
  notApplied: { movementId: string; productId: string; delta: number }[];
  amountMismatch: { movementId: string; productId: string; ledgerDelta: number; appliedDelta: number }[];
  stockMismatch: { productId: string; central: number; appliedSum: number }[];
};

/**
 * Compare this branch's movement ledger with what the central database
 * recorded as applied. Read-only; the result is written to diagnostics.
 */
export async function reconcileStock(storeId: string): Promise<ReconcileReport> {
  const { data, error } = await rpc().rpc("stock_reconcile", { _store_id: storeId });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, unknown>;
  const report: ReconcileReport = {
    storeId,
    checkedAt: String(raw["checked_at"] ?? new Date().toISOString()),
    notApplied: ((raw["not_applied"] as Record<string, unknown>[]) ?? []).map((r) => ({
      movementId: String(r["movement_id"]),
      productId: String(r["product_id"]),
      delta: Number(r["delta"] ?? 0),
    })),
    amountMismatch: ((raw["amount_mismatch"] as Record<string, unknown>[]) ?? []).map((r) => ({
      movementId: String(r["movement_id"]),
      productId: String(r["product_id"]),
      ledgerDelta: Number(r["ledger_delta"] ?? 0),
      appliedDelta: Number(r["applied_delta"] ?? 0),
    })),
    stockMismatch: ((raw["stock_mismatch"] as Record<string, unknown>[]) ?? []).map((r) => ({
      productId: String(r["product_id"]),
      central: Number(r["central"] ?? 0),
      appliedSum: Number(r["applied_sum"] ?? 0),
    })),
  };

  // Anything not applied centrally belongs on the retry queue so it can be
  // sent again with its original movement id.
  for (const m of report.notApplied) {
    recordUnappliedStock({
      movementId: m.movementId,
      productId: m.productId,
      storeId,
      delta: m.delta,
      reason: "not applied centrally",
      code: "connection",
      retryable: true,
    });
  }
  for (const m of report.amountMismatch) {
    recordDiagnostic({
      kind: "stock_reconcile_drift",
      entity: "stock_delta_applied",
      code: "amount_mismatch",
      recordId: m.movementId,
      storeId,
    });
  }
  for (const p of report.stockMismatch) {
    recordDiagnostic({
      kind: "stock_reconcile_drift",
      entity: "products",
      code: "stock_mismatch",
      recordId: p.productId,
      storeId,
    });
  }
  return report;
}
