import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const callerInput = z.object({
  accessToken: z.string().min(10).optional(),
  cashierToken: z.string().min(10).optional(),
  storeId: z.string().max(64).nullish(),
  since: z.string().datetime().nullish(),
  tables: z.array(z.string().max(80)).max(60).optional(),
});

const rowsInput = callerInput.extend({
  table: z.string().min(1).max(80),
  limit: z.number().int().min(1).max(5000).optional(),
});

/** Without the central-database service key the comparison can only show zeros. */
const NO_KEY =
  "Comparison unavailable: this server has no central database service key configured.";

export const compareServerSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => callerInput.parse(input))
  .handler(async ({ data }) => {
    const { hasServiceKey } = await import("@/core/api/pos-relay.server");
    if (!hasServiceKey()) return { ok: false as const, error: NO_KEY, tables: [] };
    const { resolveCompareCaller } = await import("./data-compare-access.server");
    const caller = await resolveCompareCaller(data);
    if (!caller.ok) return { ok: false as const, error: caller.error, tables: [] };
    const { serverSummary } = await import("./data-compare.server");
    return {
      ok: true as const,
      storeId: caller.storeId,
      tables: await serverSummary({
        storeId: caller.storeId,
        since: data.since ?? null,
        ...(data.tables ? { tables: data.tables } : {}),
      }),
    };
  });

export const compareServerRows = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => rowsInput.parse(input))
  .handler(async ({ data }) => {
    const { hasServiceKey } = await import("@/core/api/pos-relay.server");
    if (!hasServiceKey()) return { ok: false as const, error: NO_KEY, rows: [] };
    const { resolveCompareCaller } = await import("./data-compare-access.server");
    const caller = await resolveCompareCaller(data);
    if (!caller.ok) return { ok: false as const, error: caller.error, rows: [] };
    const { serverRows } = await import("./data-compare.server");

    try {
      return {
        ok: true as const,
        rows: await serverRows({
          table: data.table,
          storeId: caller.storeId,
          since: data.since ?? null,
          ...(data.limit ? { limit: data.limit } : {}),
        }),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
        rows: [],
      };
    }
  });
