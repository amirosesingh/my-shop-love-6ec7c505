/**
 * "Is anybody signed in on this device right now?" — one shared answer for the
 * background jobs that must not run for a visitor sitting on the sign-in
 * screen.
 *
 * Every central table is protected by row-level security, so a signed-out
 * browser that keeps syncing does not read or write anything: it only produces
 * a steady stream of rejected requests. Sync and telemetry therefore ask here
 * first and stay quiet until somebody is actually signed in.
 *
 * Three identities count, because the POS has three ways in:
 *   • a back-office account (central authentication session)
 *   • a cashier signed in on a till (session token)
 *   • the till itself, holding a cashier token from an earlier sign-in
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { cashierTokenSync, sessionTokenSync } from "./pos-credentials";

let authSession = false;
let watching = false;

/** Start listening once, lazily, so importing this module costs nothing. */
function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  try {
    void supabaseExternal.auth
      .getSession()
      .then(({ data }) => {
        authSession = Boolean(data.session);
      })
      .catch(() => {});
    supabaseExternal.auth.onAuthStateChange((_event, session) => {
      authSession = Boolean(session);
    });
  } catch {
    /* no central configuration yet — treated as signed out */
  }
}

/**
 * True when a request sent right now would carry an identity the database
 * will accept. Synchronous on purpose: it guards hot paths (sync ticks,
 * heartbeats) that must not await anything.
 */
export function hasSignedInIdentity(): boolean {
  if (typeof window === "undefined") return false;
  watch();
  return authSession || Boolean(sessionTokenSync()) || Boolean(cashierTokenSync());
}

/** Test seam. */
export function __setAuthSessionForTests(value: boolean) {
  authSession = value;
  watching = true;
}
