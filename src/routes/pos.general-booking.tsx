import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Dedicated entry point for the standard pay-later booking workspace. The
 * register owns the cart, so it opens the booking workspace over it.
 */
export const Route = createFileRoute("/pos/general-booking")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { booking: "general" }, replace: true });
  },
});