/**
 * Central-schema introspection. The settings page asks the service relay for
 * the central database's table/column list (the PostgREST root document) so
 * the operator can see drift and download a repair script. Thin wrapper: all
 * logic lives in the server module it imports.
 */
import { createServerFn } from "@tanstack/react-start";

export type CentralSchemaResult =
  | { ok: true; rows: { table: string; column: string }[] }
  | { ok: false; error: string };

export const fetchCentralSchema = createServerFn({ method: "GET" }).handler(
  async (): Promise<CentralSchemaResult> => {
    const { hasServiceKey, runRelayRead } = await import("./pos-relay.server");
    if (!hasServiceKey()) {
      return {
        ok: false,
        error:
          "The central database service key is not configured — open System status and save it first.",
      };
    }
    const res = await runRelayRead({ kind: "cloudSchema" });
    if (!res.ok) return { ok: false, error: res.error ?? "The central schema could not be read." };
    const rows = (res.rows ?? [])
      .map((r) => ({ table: String(r.table ?? ""), column: String(r.column ?? "") }))
      .filter((r) => r.table && r.column);
    return { ok: true, rows };
  },
);
