/**
 * Instant kill-switch.
 *
 * The five-minute poll in `use-revocation-check` is the offline-safe floor.
 * This listener rides the live change feed instead, so the moment management
 * revokes a till the machine locks itself — no waiting for the next check.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { clearTerminalConfig } from "./terminal-tokens";
import { clearTerminalCredentials } from "./terminal-session";
import { clearDeviceProof } from "./terminal-proof";
import { lockDesktopWindow } from "./terminal-desktop-store";
import { markTerminalRevoked } from "./use-revocation-check";

let locking = false;

/**
 * Wipe everything this device holds and drop it on the locked screen. Safe to
 * call from anywhere and more than once.
 */
export function triggerImmediateLockdown(reason = "revoked by the master administrator"): void {
  if (typeof window === "undefined" || locking) return;
  locking = true;
  console.warn(`[Terminal] Access ${reason}. Locking this machine.`);
  try {
    clearTerminalCredentials();
    clearDeviceProof();
    clearTerminalConfig();
    window.sessionStorage.clear();
  } catch {
    /* keep going: locking matters more than tidy storage */
  }
  void supabaseExternal.auth.signOut({ scope: "local" }).catch(() => null);
  void lockDesktopWindow();
  markTerminalRevoked();
  locking = false;
}

/** Watch this till's own token row for a revocation. Returns an unsubscribe. */
export function watchTerminalRevocation(tokenId: string): () => void {
  if (typeof window === "undefined" || !tokenId) return () => {};
  const channel = supabaseExternal
    .channel(`terminal-status-${tokenId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "terminal_tokens", filter: `id=eq.${tokenId}` },
      (payload: { new?: Record<string, unknown> }) => {
        const row = payload.new ?? {};
        if (row["status"] === "revoked" || row["is_active"] === false) {
          triggerImmediateLockdown();
        }
      },
    )
    .subscribe();
  return () => {
    void supabaseExternal.removeChannel(channel);
  };
}
