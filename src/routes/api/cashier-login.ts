import { createFileRoute } from "@tanstack/react-router";
import { handleCashierLogin } from "./public/cashier-login";

/** Alias of /api/public/cashier-login for callers that use the short path. */
export const Route = createFileRoute("/api/cashier-login")({
  server: { handlers: { POST: async ({ request }) => handleCashierLogin(request) } },
});