import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/sync-health
 *
 * Tells an administrator whether the server that answered the browser can
 * reach the central database. It reports presence only — never key values,
 * lengths or prefixes — so it is safe to leave open.
 */
export const Route = createFileRoute("/api/public/sync-health")({
  server: {
    handlers: {
      GET: async () => {
        const { hasServiceKey } = await import("@/lib/pos-relay.server");
        const { EXTERNAL_SUPABASE_URL } = await import("@/lib/external-supabase-config");
        return Response.json(
          {
            serviceKey: hasServiceKey(),
            posUrl: Boolean(EXTERNAL_SUPABASE_URL),
            runtime: process.env["NODE_ENV"] === "production" ? "edge" : "dev",
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});