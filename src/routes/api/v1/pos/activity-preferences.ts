import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsPreflight, withCors } from "@/lib/public-cors";

const bodySchema = z.object({
  action: z.enum(["list", "clear"]),
  sessionToken: z.string().max(400).optional(),
  cashierToken: z.string().max(2000).optional(),
  terminalToken: z.string().max(200).optional(),
  accessToken: z.string().max(4000).optional(),
  eventId: z.string().uuid().optional(),
  cleared: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional(),
  query: z.string().trim().max(160).optional(),
  sortBy: z.enum(["created_at", "severity", "event_type", "store_id", "title"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  types: z.array(z.string().regex(/^[a-z_]{1,60}$/)).max(30).optional(),
  severities: z.array(z.enum(["info", "warning", "critical"])).max(3).optional(),
  storeId: z.string().max(64).optional(),
  actor: z.string().max(160).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const Route = createFileRoute("/api/v1/pos/activity-preferences")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const reply = (body: unknown, status = 200) =>
          withCors(Response.json(body, { status }), request);
        const raw = await request.text();
        if (raw.length > 12_000) return reply({ ok: false, error: "Request too large" }, 413);
        let body: unknown;
        try { body = JSON.parse(raw); }
        catch { return reply({ ok: false, error: "Invalid JSON" }, 400); }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return reply({ ok: false, error: "Invalid request" }, 400);
        const input = parsed.data;
        const { verifyRelayCaller, serviceRest } = await import("@/core/api/pos-relay.server");
        let caller: Awaited<ReturnType<typeof verifyRelayCaller>>;
        try {
          caller = await verifyRelayCaller(input);
        } catch {
          return reply({ ok: false, error: "Sign in is required" }, 401);
        }
        // Resolve from the live account row. A terminal token or cached role
        // claim alone must never read this feed or clear another user's row.
        const identities = [
          caller.authUserId && `auth_user_id=eq.${encodeURIComponent(caller.authUserId)}`,
          caller.staffUserId && `user_id=eq.${encodeURIComponent(caller.staffUserId)}`,
          caller.email && `email=eq.${encodeURIComponent(caller.email)}`,
        ].filter((value): value is string => Boolean(value));
        type Account = { user_id: string; role: string; role_slug: string | null; permissions: Record<string, boolean> | null; store_id: string | null; is_active: boolean };
        let account: Account | undefined;
        for (const identity of identities) {
          const response = await serviceRest(`app_users?${identity}&select=user_id,role,role_slug,permissions,store_id,is_active&limit=1`);
          if (!response.ok) return reply({ ok: false, error: "Account lookup failed" }, 503);
          account = ((await response.json()) as Account[])[0];
          if (account) break;
        }
        if (!account?.is_active || !(
          account.role === "admin" || account.role === "manager" ||
          account.role_slug === "admin" || account.role_slug === "supervisor" ||
          account.permissions?.can_view_audit_trail === true
        )) return reply({ ok: false, error: "Activity access denied" }, 403);

        if (input.action === "clear") {
          if (!input.eventId || input.cleared === undefined)
            return reply({ ok: false, error: "Event and clear state are required" }, 400);
          const response = await serviceRest("rpc/pos_set_activity_event_cleared", {
            method: "POST",
            body: JSON.stringify({ p_event_id: input.eventId, p_user_id: account.user_id, p_cleared: input.cleared }),
          });
          if (!response.ok) return reply({ ok: false, error: "Could not save notification state" }, 503);
          return reply({ ok: true });
        }

        const params = new URLSearchParams({
          select: "*",
          order: `${input.sortBy ?? "created_at"}.${input.sortDirection ?? "desc"}`,
          limit: String(input.limit ?? 200),
          offset: String(input.offset ?? 0),
        });
        if (input.types?.length) params.set("event_type", `in.(${input.types.join(",")})`);
        if (input.severities?.length) params.set("severity", `in.(${input.severities.join(",")})`);
        const branch = account.store_id ?? caller.storeId ?? null;
        if (branch && account.role !== "admin" && account.role_slug !== "admin") {
          if (input.storeId && input.storeId !== branch)
            return reply({ ok: false, error: "Branch access denied" }, 403);
          params.set("store_id", `eq.${branch}`);
        } else if (input.storeId) params.set("store_id", `eq.${input.storeId}`);
        if (input.actor) params.set("actor_name", `ilike.*${input.actor.replace(/[,*()]/g, "")}*`);
        if (input.query) {
          const term = input.query.replace(/[,*()]/g, "");
          if (term)
            params.set(
              "or",
              `(title.ilike.*${term}*,message.ilike.*${term}*,actor_name.ilike.*${term}*,entity_id.ilike.*${term}*)`,
            );
        }
        if (input.from) params.set("created_at", `gte.${input.from}`);
        if (input.to) params.append("created_at", `lte.${input.to}`);
        const response = await serviceRest(`activity_events?${params}`, { prefer: "count=exact" });
        if (!response.ok) return reply({ ok: false, error: "Could not load activity" }, 503);
        const range = response.headers.get("content-range") ?? "";
        const total = Number(range.split("/").at(-1));
        const rows = await response.json();
        return reply({ ok: true, rows, total: Number.isFinite(total) ? total : rows.length });
      },
      OPTIONS: async ({ request }) => corsPreflight(request),
    },
  },
});
