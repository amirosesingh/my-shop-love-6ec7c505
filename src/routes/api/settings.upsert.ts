import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const body = z.object({
  scope: z.enum(["GLOBAL", "CLUSTER", "BRANCH"]),
  scopeId: z.string().max(120).default(""),
  patch: z.record(
    z.string().max(64),
    z.object({
      value: z.union([z.string().max(500), z.number(), z.boolean()]).nullable().optional(),
      isOverridden: z.boolean(),
    }),
  ),
});

/** PUT (or POST) /api/settings/upsert — write or clear overrides for one scope. */
async function handle({ request }: { request: Request }) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return new Response("Unauthorized", { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });

  const { verifyPosStaff } = await import("@/lib/secure-settings.server");
  const { writeScopedSettings } = await import("@/lib/settings-scope.server");
  try {
    const caller = await verifyPosStaff(token);
    if (!caller.isAdmin) return Response.json({ error: "Supervisors only" }, { status: 403 });
    const settings = await writeScopedSettings(
      parsed.data.scope,
      parsed.data.scopeId,
      parsed.data.patch,
      token,
    );
    return Response.json({ settings });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export const Route = createFileRoute("/api/settings/upsert")({
  server: { handlers: { PUT: handle, POST: handle } },
});