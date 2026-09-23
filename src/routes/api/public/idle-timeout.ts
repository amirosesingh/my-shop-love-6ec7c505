import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsPreflight, withCors } from "@/lib/public-cors";

async function handle(request: Request) {
  const { callerVerifiedDownstream } = await import("@/lib/public-api-guard.server");
  const denied = callerVerifiedDownstream("resolveRulesAccess verifies caller identity and branch; save RPC checks supervisor access");
  if (denied) return denied;
  const parsed = z.object({
    sessionToken: z.string().max(400).optional(), cashierToken: z.string().max(400).optional(),
    terminalToken: z.string().max(400).optional(), accessToken: z.string().max(4000).optional(),
    scope: z.enum(["branch", "global"]).default("branch"),
    storeId: z.string().max(64).optional(), minutes: z.number().int().min(1).max(1440).optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid idle timeout request" }, { status: 400 });
  const { resolveRulesAccess } = await import("@/lib/pos-rules-access.server");
  const access = await resolveRulesAccess(parsed.data);
  if (!access.ok) return Response.json({ ok: false, error: access.error }, { status: access.status });
  try {
    if (parsed.data.scope === "global") {
      if (!parsed.data.accessToken) return Response.json({ ok: false, error: "Administrator sign-in required" }, { status: 403 });
      const { verifyPosStaff } = await import("@/lib/secure-settings.server");
      const caller = await verifyPosStaff(parsed.data.accessToken);
      if (caller.role !== "admin") return Response.json({ ok: false, error: "Only administrators can edit global timeouts" }, { status: 403 });
    }
    const branchId = parsed.data.scope === "global" ? "" : access.branchId;
    if (parsed.data.minutes !== undefined) {
      if (!parsed.data.accessToken) return Response.json({ ok: false, error: "Sign in with a supervisor account" }, { status: 403 });
      const { saveIdleTimeout } = await import("@/lib/idle-timeout.functions");
      const result = await saveIdleTimeout({ data: { accessToken: parsed.data.accessToken, storeId: branchId, minutes: parsed.data.minutes } });
      return Response.json(result, { status: result.ok ? 200 : 403 });
    }
    const { resolveIdleMinutes } = await import("@/lib/session-guard.server");
    return Response.json({ ok: true, minutes: await resolveIdleMinutes({ branchId }) });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Idle timeout unavailable" }, { status: 500 });
  }
}
export const Route = createFileRoute("/api/public/idle-timeout")({
  server: { handlers: {
    POST: async ({ request }) => withCors(await handle(request), request),
    OPTIONS: async ({ request }) => corsPreflight(request),
  } },
});
