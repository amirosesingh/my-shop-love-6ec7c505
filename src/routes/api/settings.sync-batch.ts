import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const body = z.object({
  scope: z.enum(["GLOBAL", "CLUSTER"]),
  scopeId: z.string().max(120).default(""),
  keys: z.array(z.string().max(64)).max(200).default([]),
});

/** POST /api/settings/sync-batch — push a scope's values to its child branches. */
export const Route = createFileRoute("/api/settings/sync-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const parsed = body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });

        const { verifyPosStaff } = await import("@/lib/secure-settings.server");
        const { pushScopedSettings } = await import("@/lib/settings-scope.server");
        try {
          const caller = await verifyPosStaff(token);
          if (!caller.isAdmin) return Response.json({ error: "Supervisors only" }, { status: 403 });
          const result = await pushScopedSettings(
            parsed.data.scope,
            parsed.data.scopeId,
            parsed.data.keys,
            token,
          );
          return Response.json({ result });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});