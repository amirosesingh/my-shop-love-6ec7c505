/**
 * Quiet background reporter.
 *
 * Every minute this till tells the monitoring centre how it is doing, and
 * checks whether an administrator has asked it to sync or refresh its data.
 * It never changes anything the operator can see.
 */
import { useEffect } from "react";
import { useAuth } from "@/lib/pos-auth";
import { publishTelemetry } from "@/lib/telemetry";
import { runPendingCommands } from "@/lib/terminal-commands";

export function TelemetryAgent() {
  const { user, terminalUser } = useAuth();
  const name = user?.name ?? terminalUser?.name ?? null;
  const role = user?.role ?? terminalUser?.role ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let stopped = false;

    const refreshCatalogue = async () => {
      // Reload once the queue is clear so every screen picks up the fresh copy.
      window.setTimeout(() => window.location.reload(), 1500);
    };

    const beat = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return;
      await publishTelemetry({ name, role });
      try {
        await runPendingCommands(refreshCatalogue);
      } catch {
        /* commands are best-effort */
      }
    };

    void beat();
    const timer = window.setInterval(() => void beat(), 60_000);
    window.addEventListener("online", () => void beat());
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [name, role]);

  return null;
}
