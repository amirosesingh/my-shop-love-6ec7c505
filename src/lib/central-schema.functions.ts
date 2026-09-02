/**
 * Central-schema introspection. The settings page asks the service relay for
 * the central database's table/column list (the PostgREST root document,
 * including type and nullability metadata) so the operator can see drift
 * against the authoritative central schema and download a repair script.
 * A second call probes every authoritative table with a minimal read so the
 * exact PostgREST error behind any "unable to fetch" symptom is visible.
 * Thin wrapper: all logic lives in the server module it imports.
 */
import { createServerFn } from "@tanstack/react-start";

export type CentralSchemaColumn = {
  table: string;
  column: string;
  type: string | null;
  format: string | null;
  nullable: boolean;
};

export type CentralSchemaResult =
  | { ok: true; rows: CentralSchemaColumn[] }
  | { ok: false; error: string };

export const fetchCentralSchema = createServerFn({ method: "GET" }).handler(
  async (): Promise<CentralSchemaResult> => {
    const { hasServiceKey, runRelayRead } = await import("@/core/api/pos-relay.server");
    if (!hasServiceKey()) {
      return {
        ok: false,
        error:
          "The central database service key is not configured — open System status and save it first.",
      };
    }
    const res = await runRelayRead({ kind: "cloudSchema" });
    if (!res.ok) return { ok: false, error: res.error ?? "The central schema could not be read." };
    const rows: CentralSchemaColumn[] = (res.rows ?? [])
      .map((r) => ({
        table: String(r.table ?? ""),
        column: String(r.column ?? ""),
        type: typeof r.type === "string" ? r.type : null,
        format: typeof r.format === "string" ? r.format : null,
        nullable: r.nullable !== false,
      }))
      .filter((r) => r.table && r.column);
    return { ok: true, rows };
  },
);

export type CentralProbeRow = {
  table: string;
  label: string;
  ok: boolean;
  error: string | null;
};

export type CentralProbeResult =
  | { ok: true; rows: CentralProbeRow[] }
  | { ok: false; error: string };

/**
 * Probe every table in the authoritative central schema with a one-row read.
 * The result names, per table, the exact failure (missing table, permission
 * denied, connectivity) instead of a generic "unable to fetch".
 */
export const probeCentralTables = createServerFn({ method: "GET" }).handler(
  async (): Promise<CentralProbeResult> => {
    const { hasServiceKey, runRelayRead } = await import("@/core/api/pos-relay.server");
    const { CENTRAL_SCHEMA } = await import("./central-schema");
    if (!hasServiceKey()) {
      return {
        ok: false,
        error:
          "The central database service key is not configured — open System status and save it first.",
      };
    }
    const rows: CentralProbeRow[] = [];
    for (const spec of CENTRAL_SCHEMA) {
      const res = await runRelayRead({ kind: "cloudProbe", table: spec.table });
      rows.push({
        table: spec.table,
        label: spec.label,
        ok: res.ok,
        error: res.ok ? null : (res.error ?? "The table could not be read."),
      });
    }
    return { ok: true, rows };
  },
);
