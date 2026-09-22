import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/pos/ipc-adopt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > 10_000)
          return Response.json({ ok: false, error: "Request is too large." }, { status: 413 });
        const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const proof = {
          accessToken: typeof input?.accessToken === "string" ? input.accessToken : undefined,
          sessionToken: typeof input?.sessionToken === "string" ? input.sessionToken : undefined,
          cashierToken: typeof input?.cashierToken === "string" ? input.cashierToken : undefined,
          terminalToken: typeof input?.terminalToken === "string" ? input.terminalToken : undefined,
        };
        if (
          (proof.accessToken?.length ?? 0) > 4000 ||
          (proof.sessionToken?.length ?? 0) > 400 ||
          (proof.cashierToken?.length ?? 0) > 2000 ||
          (proof.terminalToken?.length ?? 0) > 2000
        )
          return Response.json(
            { ok: false, error: "A valid sign-in is required." },
            { status: 401 },
          );
        if (!proof.accessToken && !proof.sessionToken && !proof.cashierToken)
          return Response.json(
            { ok: false, error: "A valid sign-in is required." },
            { status: 401 },
          );
        const { verifyRelayCaller } = await import("@/core/api/pos-relay.server");
        const { resolveRelayScope } = await import("@/core/api/relay-policy.server");
        try {
          const scope = await resolveRelayScope(await verifyRelayCaller(proof));
          // The app_users role is the authority for the desktop's admin IPC
          // session. Do not promote a browser-provided permission matrix to
          // administrator: that would allow a non-admin to alter the terminal
          // connection and its sealed credentials.
          if (!(scope.role === "admin" || scope.roleSlug === "admin")) {
            return Response.json(
              { ok: false, error: "This account cannot manage database and sync." },
              { status: 403 },
            );
          }
          return Response.json({
            ok: true,
            level: "admin",
            subject: scope.staffUserId ?? scope.label,
          });
        } catch {
          return Response.json(
            { ok: false, error: "Your sign-in could not be verified." },
            { status: 401 },
          );
        }
      },
    },
  },
});
