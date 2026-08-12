import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/pos/sync — canonical write relay for tills.
 *
 * The caller must prove itself (signed cashier session, active terminal
 * token, or staff access token). The server then resolves that caller's
 * branch and permissions and refuses anything outside them.
 */
export const Route = createFileRoute("/api/v1/pos/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSyncRequest } = await import("@/lib/sync-endpoint.server");
        return handleSyncRequest(request);
      },
    },
  },
});
