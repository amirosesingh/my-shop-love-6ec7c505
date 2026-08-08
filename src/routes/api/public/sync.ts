import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/public/sync
 *
 * Fallback write path for tills that have no account on the central database
 * (cashier PIN sign-in) or whose direct write was refused. The caller must
 * prove itself with a signed cashier session, an active terminal token, or a
 * staff access token; only then are the queued operations written with the
 * service key.
 */
const opSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("insert"),
    table: z.string().min(1).max(64),
    rows: z.array(z.record(z.string(), z.unknown())).max(500),
  }),
  z.object({
    kind: z.literal("upsert"),
    table: z.string().min(1).max(64),
    rows: z.array(z.record(z.string(), z.unknown())).max(500),
    onConflict: z.string().max(120).optional(),
  }),
  z.object({
    kind: z.literal("update"),
    table: z.string().min(1).max(64),
    values: z.record(z.string(), z.unknown()),
    match: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal("delete"),
    table: z.string().min(1).max(64),
    match: z.record(z.string(), z.unknown()),
  }),
]);

const bodySchema = z.object({
  cashierToken: z.string().max(2000).optional(),
  terminalToken: z.string().max(200).optional(),
  accessToken: z.string().max(4000).optional(),
  ops: z.array(opSchema).max(50).optional(),
  read: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("activeShift"), storeId: z.string().min(1).max(64) }),
      z.object({ kind: z.literal("stores") }),
    ])
    .optional(),
});

export const Route = createFileRoute("/api/public/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ ok: false, error: "Malformed request" }, { status: 400 });
        }

        if (!body.ops?.length && !body.read)
          return Response.json({ ok: false, error: "Nothing to do" }, { status: 400 });

        const { verifyRelayCaller, runRelayOp, runRelayRead } = await import(
          "@/lib/pos-relay.server"
        );
        // Without the internal key the relay cannot do anything: answer with a
        // readable "temporarily unavailable" instead of a blank server error.
        if (!process.env["POS_SUPABASE_SERVICE_ROLE_KEY"]) {
          return Response.json(
            {
              ok: false,
              error:
                "The central database key is not configured on this deployment, so syncing is paused.",
            },
            { status: 503 },
          );
        }
        try {
          await verifyRelayCaller(body);
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 401 });
        }

        if (body.read) {
          try {
            const result = await runRelayRead(body.read);
            return Response.json(result, { status: result.ok ? 200 : 500 });
          } catch (e) {
            return Response.json({ ok: false, error: (e as Error).message }, { status: 503 });
          }
        }

        const results: { ok: boolean; error?: string }[] = [];
        for (const op of body.ops ?? []) {
          try {
            results.push(await runRelayOp(op));
          } catch (e) {
            results.push({ ok: false, error: (e as Error).message });
          }
        }
        return Response.json({ ok: results.every((r) => r.ok), results });
      },
    },
  },
});