import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/sync — deprecated alias of `/api/v1/pos/sync`.
 *
 * Kept mounted because tills already in the field (Android APK, Electron
 * desktop) call this path; it runs the identical authorisation, so nothing is
 * weaker here. New clients use `/api/v1/pos/sync`.
 */
export const Route = createFileRoute("/api/public/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { callerVerifiedDownstream } = await import("@/lib/public-api-guard.server");
        const denied = callerVerifiedDownstream(
          "handleSyncRequest verifies the till token before touching any record",
        );
        if (denied) return denied;
        const { handleSyncRequest } = await import("@/lib/sync-endpoint.server");
        return handleSyncRequest(request);
      },
    },
  },
});
