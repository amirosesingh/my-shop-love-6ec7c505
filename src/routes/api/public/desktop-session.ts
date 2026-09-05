import { createFileRoute } from "@tanstack/react-router";

/**
 * Lets the Electron main process independently verify the renderer's existing
 * online sign-in. No token or database credential is returned or persisted.
 */
export const Route = createFileRoute("/api/public/desktop-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });
        try {
          const { verifyPosStaff } = await import("@/lib/secure-settings.server");
          const staff = await verifyPosStaff(token);
          const level = staff.role === "admin" ? "admin" : staff.role === "manager" ? "supervisor" : null;
          if (!level) {
            return Response.json({ ok: false, error: "Administrator access required" }, { status: 403 });
          }
          return Response.json({ ok: true, level, name: staff.userId });
        } catch {
          return Response.json({ ok: false, error: "The signed-in account could not be verified" }, { status: 401 });
        }
      },
    },
  },
});