/**
 * Central-schema introspection. The settings page asks the service relay for
 * the central database's table/column list (the PostgREST root document) so
 * the operator can see drift and download a repair script. Thin wrapper: all
 * logic lives in the server module it imports.
 */
import { createServerFn } from "@tanstack/react-start";

export const fetchCentralSchema = createServerFn({ method: "GET" }).handler(async () => {
  const { hasServiceKey, runRelayRead } = await import("./pos-relay.server");
  if (!hasServiceKey()) {
    return {
      ok: false as const,
      error:
        "The central database service key is not configured — open System status and save it first.",
    };
  }
  return runRelayRead({ kind: "cloudSchema" });
});
