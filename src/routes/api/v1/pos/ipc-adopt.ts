import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/pos/ipc-adopt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const input = (await request.json().catch(() => null)) as { accessToken?: unknown } | null;
        const accessToken = typeof input?.accessToken === "string" ? input.accessToken : "";
        if (!accessToken || accessToken.length > 4000) return Response.json({ ok: false, error: "A valid sign-in is required." }, { status: 401 });
        const { verifyRelayCaller } = await import("@/core/api/pos-relay.server");
        const { resolveRelayScope } = await import("@/core/api/relay-policy.server");
        try {
          const scope = await resolveRelayScope(await verifyRelayCaller({ accessToken }));
          if (!(scope.role === "admin" || scope.roleSlug === "admin" || scope.permissions.can_manage_sync_backup === true)) {
            return Response.json({ ok: false, error: "This account cannot manage database and sync." }, { status: 403 });
          }
          return Response.json({ ok: true, level: "admin", subject: scope.staffUserId ?? scope.label });
        } catch {
          return Response.json({ ok: false, error: "Your sign-in could not be verified." }, { status: 401 });
        }
      },
    },
  },
});
