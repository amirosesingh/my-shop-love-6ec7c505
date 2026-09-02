/**
 * Deep central-database inventory. Calls the read-only
 * `schema_inventory_deep()` helper in the central project through the service
 * relay. When that helper is not installed the caller degrades to the shallow
 * PostgREST description document and says so on screen.
 */
import { createServerFn } from "@tanstack/react-start";

export type CentralInventoryResult =
  | { ok: true; /** JSON payload — deserialised by the caller. */ inventoryJson: string }
  | { ok: false; error: string };

export const fetchCentralInventory = createServerFn({ method: "GET" }).handler(
  async (): Promise<CentralInventoryResult> => {
    const { hasServiceKey, runRelayRead } = await import("./pos-relay.server");
    if (!hasServiceKey()) {
      return {
        ok: false,
        error:
          "The central database service key is not configured — open System status and save it first.",
      };
    }
    const res = await runRelayRead({ kind: "cloudInventory" });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.error ??
          "The deep inventory helper is not installed in the central database (schema_inventory_deep).",
      };
    }
    return { ok: true, inventoryJson: JSON.stringify(res.row ?? {}) };
  },
);
