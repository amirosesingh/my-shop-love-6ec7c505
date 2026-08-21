import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/public/cashier-login — username + PIN sign-in for tills.
 *
 * Public by necessity (the caller has no session yet); the PIN itself is the
 * credential and is verified server-side with the internal key.
 */
const body = z.object({
  username: z.string().min(1).max(120),
  pin: z.string().min(4).max(32),
  platform: z.string().max(60).optional(),
  terminalId: z.string().max(64).optional(),
});

export async function handleCashierLogin(request: Request): Promise<Response> {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const { hasServiceKey } = await import("@/lib/pos-relay.server");
  if (!hasServiceKey())
    // `code` lets the till tell "the server cannot check anything" apart from
    // "this PIN is wrong", so it can fall back to its local database.
    return Response.json(
      {
        ok: false,
        code: "no_service_key",
        error: "Central database key missing on this server",
      },
      { status: 503 },
    );

  const { cashierLoginServer } = await import("@/lib/cashier-login.server");
  try {
    const result = await cashierLoginServer(parsed.data);
    return Response.json(result, { status: result.ok ? 200 : 401 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cashier-login")({
  server: { handlers: { POST: async ({ request }) => handleCashierLogin(request) } },
});