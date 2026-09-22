import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/pos/ipc-authorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > 4096) return Response.json({ ok: false, error: "Request is too large." }, { status: 413 });
        const input = (await request.json().catch(() => null)) as
          | { username?: unknown; pin?: unknown; terminalId?: unknown; branchId?: unknown }
          | null;
        const username = typeof input?.username === "string" ? input.username.trim() : "";
        const pin = typeof input?.pin === "string" ? input.pin : "";
        if (!username || pin.length < 4 || pin.length > 32) {
          return Response.json({ ok: false, error: "Enter a valid username and PIN." }, { status: 400 });
        }
        const { cashierLoginServer } = await import("@/lib/cashier-login.server");
        const result = await cashierLoginServer({
          username,
          pin,
          platform: "windows-ipc-authorization",
          terminalId: typeof input?.terminalId === "string" ? input.terminalId : null,
          branchId: typeof input?.branchId === "string" ? input.branchId : null,
        });
        if (!result.ok) return Response.json(result, { status: 401 });
        // Database connection changes are administrator-only. This role comes
        // directly from public.app_users after the PIN check; a client-side
        // permission object must never turn a cashier into an administrator.
        if (result.cashier.role !== "admin" && result.cashier.role_slug !== "admin")
          return Response.json({ ok: false, error: "An Administrator account is required." }, { status: 403 });
        return Response.json({ ok: true, level: "admin", subject: result.cashier.username });
      },
    },
  },
});
