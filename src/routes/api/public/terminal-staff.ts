import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/public/terminal-staff — the sign-in grid for a till.
 *
 * The Android shell has no server of its own, so it calls this endpoint on the
 * hosted POS instead of a server function. It is not open: the caller must
 * present the activation token of a registered, unrevoked terminal, and the
 * reply carries only the names and roles the sign-in screen shows — never PIN
 * lengths and never credentials.
 */
const body = z.object({
  storeId: z.string().max(60).nullable().optional(),
  terminalToken: z.string().max(200).optional(),
});

export const Route = createFileRoute("/api/public/terminal-staff")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { callerVerifiedDownstream } = await import("@/lib/public-api-guard.server");
        const denied = callerVerifiedDownstream(
          "the registered terminal token is verified below before any roster is read",
        );
        if (denied) return denied;
        const parsed = body.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid payload", staff: [] }, { status: 400 });
        const token = parsed.data.terminalToken?.trim();
        if (!token)
          return Response.json(
            { ok: false, error: "This terminal is not registered", staff: [] },
            { status: 401 },
          );
        try {
          const { verifyRelayCaller } = await import("@/lib/pos-relay.server");
          // Throws when the token proves nothing (unknown, revoked, retired).
          const caller = await verifyRelayCaller({ terminalToken: token }).catch(() => null);
          if (!caller || caller.kind !== "terminal")
            return Response.json(
              { ok: false, error: "This terminal is not registered", staff: [] },
              { status: 401 },
            );
          const mod = await import("@/lib/staff-admin.server");
          // A till only ever lists its own branch.
          const storeId = caller.storeId ?? parsed.data.storeId ?? null;
          const staff = await mod.listTerminalStaff(storeId);
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
