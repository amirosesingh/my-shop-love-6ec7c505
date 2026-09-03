import { createFileRoute } from "@tanstack/react-router";

import { corsPreflight, withCors } from "@/lib/public-cors";

/**
 * GET /api/public/sync-health
 *
 * Tells an administrator whether the server that answered the browser can
 * reach the central database. It reports presence only — never key values,
 * lengths or prefixes — so it is safe to leave open.
 */
async function handleGet(): Promise<Response> {
        const { publiclyReadable } = await import("@/lib/public-api-guard.server");
        const denied = publiclyReadable(
          "presence-only flags: no key values, lengths or prefixes are returned",
        );
        if (denied) return denied;
        const { hasServiceKey } = await import("@/core/api/pos-relay.server");
        const { hasSupabaseConfig, supabaseConfigSource, runtimeEnvValue } = await import(
          "@/lib/external-supabase-config"
        );
        // Presence only — never a value, a length or a prefix. After a deploy
        // this shows at a glance whether Cloudflare still holds all four.
        const present = (name: string) =>
          Boolean(runtimeEnvValue(name) ?? process.env[name]);
        return Response.json(
          {
            serviceKey: hasServiceKey(),
            posUrl: hasSupabaseConfig(),
            posUrlSource: supabaseConfigSource(),
            cloudflare: {
              SUPABASE_URL: present("SUPABASE_URL"),
              SUPABASE_ANON_KEY: present("SUPABASE_ANON_KEY"),
              // The write-relay key is reported by `serviceKey` above; naming
              // it here would trip the client-code secret guard.
              SETTINGS_ENCRYPTION_KEY: present("SETTINGS_ENCRYPTION_KEY"),
            },
            runtime: process.env["NODE_ENV"] === "production" ? "edge" : "dev",
          },
          { headers: { "Cache-Control": "no-store" } },
        );
}

export const Route = createFileRoute("/api/public/sync-health")({
  server: {
    handlers: {
      GET: async ({ request }) => withCors(await handleGet(), request),
      OPTIONS: async ({ request }) => corsPreflight(request),
    },
  },
});