import { createFileRoute, redirect } from "@tanstack/react-router";

/** Screen visibility now lives beside permissions on the Roles & access page. */
export const Route = createFileRoute("/settings/visibility")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/access", replace: true });
  },
});
