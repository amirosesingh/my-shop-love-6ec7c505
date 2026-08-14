import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Dedicated entry point for the racket / stringing intake workspace. It hands
 * over to the register, which opens the full-screen intake with the shift,
 * member and catalogue context already loaded.
 */
export const Route = createFileRoute("/pos/racket-service")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { booking: "racket" }, replace: true });
  },
});