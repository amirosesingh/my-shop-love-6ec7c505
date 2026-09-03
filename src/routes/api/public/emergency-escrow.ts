import { createFileRoute } from "@tanstack/react-router";

import { corsPreflight, withCors } from "@/lib/public-cors";
import { z } from "zod";

/**
 * POST /api/public/emergency-escrow — a till lodges its recovery secret.
 *
 * Not open: the caller must present the activation token of a registered,
 * unrevoked terminal, and the secret is only ever accepted for that same
 * terminal. The server stores it encrypted and replies with the company
 * recovery salt so the till stops trusting the old salt that shipped inside
 * every build.
 */
const body = z.object({
  terminalToken: z.string().min(8).max(200),
  secret: z.string().min(32).max(256),
  platform: z.string().max(40).optional(),
  deviceName: z.string().max(200).optional(),
  utcOffsetMinutes: z.number().int().min(-900).max(900).optional(),
});

async function handlePost(request: Request): Promise<Response> {
    const { callerVerifiedDownstream } = await import("@/lib/public-api-guard.server");
    const denied = callerVerifiedDownstream(
      "the registered terminal token is verified below before anything is stored",
    );
    if (denied) return denied;

    const parsed = body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success)
      return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });

    try {
      const { verifyRelayCaller } = await import("@/core/api/pos-relay.server");
      const caller = await verifyRelayCaller({
        terminalToken: parsed.data.terminalToken,
      }).catch(() => null);
      if (!caller || caller.kind !== "terminal")
        return Response.json(
          { ok: false, error: "This terminal is not registered" },
          { status: 401 },
        );

      const escrow = await import("@/lib/emergency-escrow.server");
      await escrow.saveEscrow({
        tokenId: parsed.data.terminalToken,
        secret: parsed.data.secret,
        platform: parsed.data.platform ?? "unknown",
        deviceName: parsed.data.deviceName ?? "",
        utcOffsetMinutes: parsed.data.utcOffsetMinutes ?? 0,
      });
      // Handed back only to a proven terminal — it replaces the salt that
      // used to be compiled into every installer.
      return Response.json({ ok: true, companySalt: await escrow.companySalt() });
    } catch (e) {
      return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
}

export const Route = createFileRoute("/api/public/emergency-escrow")({
  server: {
    handlers: {
      POST: async ({ request }) => withCors(await handlePost(request), request),
      OPTIONS: async ({ request }) => corsPreflight(request),
    },
  },
});
