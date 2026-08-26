import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/public/terminal-staff — the sign-in grid for a till.
 *
 * The Android shell has no server of its own, so it calls this endpoint on the
 * hosted POS instead of a server function. It returns only the names, roles
 * and PIN lengths already shown on the sign-in screen — never credentials.
 */
const body = z.object({ storeId: z.string().max(60).nullable().optional() });

export const Route = createFileRoute("/api/public/terminal-staff")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { publiclyReadable } = await import("@/lib/public-api-guard.server");
        const denied = publiclyReadable(
          "returns only the names, roles and PIN lengths already shown on the sign-in screen",
        );
        if (denied) return denied;
        const parsed = body.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid payload", staff: [] }, { status: 400 });
        try {
          const mod = await import("@/lib/staff-admin.server");
          const staff = await mod.listTerminalStaff(parsed.data.storeId ?? null);
          return Response.json({ ok: true, staff });
        } catch (e) {
          return Response.json(
            { ok: false, error: (e as Error).message, staff: [] },
            { status: 500 },
          );
        }
      },
    },
  },
});