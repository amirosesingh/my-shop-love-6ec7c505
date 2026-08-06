import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/settings?scope=GLOBAL|CLUSTER|BRANCH&scopeId=<id>
 *
 * Returns the effective settings for the scope together with the inheritance
 * metadata (source tier, whether the scope overrides it, and the value it
 * would fall back to). Requires a staff bearer token.
 */
export const Route = createFileRoute("/api/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const scope = (url.searchParams.get("scope") ?? "GLOBAL").toUpperCase();
        const scopeId = url.searchParams.get("scopeId") ?? "";
        if (scope !== "GLOBAL" && scope !== "CLUSTER" && scope !== "BRANCH") {
          return Response.json({ error: "Unknown scope" }, { status: 400 });
        }

        const { verifyPosStaff } = await import("@/lib/secure-settings.server");
        const { readScopedSettings } = await import("@/lib/settings-scope.server");
        try {
          await verifyPosStaff(token);
          const res = await readScopedSettings(scope, scopeId, token);
          return Response.json({ scope, scopeId, ...res });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 401 });
        }
      },
    },
  },
});