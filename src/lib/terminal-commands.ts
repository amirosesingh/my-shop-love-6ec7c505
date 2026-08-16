/**
 * Data-only remote commands an administrator can send to a till.
 *
 * The rule that matters: nothing runs until this terminal's own unsynced
 * sales have reached the central database. A catalogue refresh that ran first
 * could overwrite local rows that were never sent, so a command with work
 * still queued is reported back as blocked and tried again later.
 */
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { terminalId } from "./activity-journal";
import { activeBranchId } from "./active-branch";
import { drainOutbox } from "./sync-engine";
import { pendingCount } from "./sync-outbox";

export type CommandName = "sync_now" | "refresh_catalog";

export type TerminalCommand = {
  id: string;
  terminal_id: string;
  store_id: string | null;
  command: CommandName | string;
  status: "pending" | "running" | "done" | "failed" | "blocked";
  note: string | null;
  result: string | null;
  issued_by: string | null;
  issued_role: string | null;
  created_at: string;
  finished_at: string | null;
};

export const COMMAND_LABEL: Record<string, string> = {
  sync_now: "Force immediate queue sync",
  refresh_catalog: "Refresh master catalogue & cache",
};

/** Queue a command for one terminal. Admin side only. */
export async function issueCommand(input: {
  terminalId: string;
  storeId?: string | null;
  command: CommandName;
  issuedBy?: string | null;
  issuedRole?: string | null;
  note?: string;
}) {
  const { error } = await supabase.from("terminal_commands").insert({
    terminal_id: input.terminalId,
    store_id: input.storeId ?? null,
    command: input.command,
    issued_by: input.issuedBy ?? null,
    issued_role: input.issuedRole ?? null,
    note: input.note ?? null,
  } as never);
  if (error) throw error;
}

/** Recent commands, newest first. */
export async function listCommands(limit = 40): Promise<TerminalCommand[]> {
  const { data, error } = await supabase
    .from("terminal_commands")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as TerminalCommand[];
}

async function finish(id: string, status: TerminalCommand["status"], result: string) {
  await supabase
    .from("terminal_commands")
    .update({ status, result, finished_at: new Date().toISOString() } as never)
    .eq("id", id);
}

/**
 * Pick up anything queued for this till and run it, offline work first.
 * `onRefresh` is supplied by the caller so the catalogue reload stays in the
 * data layer that owns it.
 */
export async function runPendingCommands(onRefresh: () => Promise<void>): Promise<number> {
  if (typeof window === "undefined") return 0;
  const me = terminalId();
  const { data, error } = await supabase
    .from("terminal_commands")
    .select("*")
    .eq("terminal_id", me)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error || !data?.length) return 0;

  let ran = 0;
  for (const row of data as unknown as TerminalCommand[]) {
    await supabase
      .from("terminal_commands")
      .update({ status: "running", picked_up_at: new Date().toISOString() } as never)
      .eq("id", row.id);

    // Sync priority guard: unsynced sales always go up before anything else.
    const drained = await drainOutbox();
    const left = pendingCount();
    if (left > 0) {
      await finish(
        row.id,
        "blocked",
        `${left} offline change${left === 1 ? "" : "s"} still waiting to sync — command will retry.`,
      );
      // Put it back in line so the next poll tries again once the queue clears.
      await supabase.from("terminal_commands").update({ status: "pending" } as never).eq("id", row.id);
      continue;
    }

    try {
      if (row.command === "refresh_catalog") await onRefresh();
      await finish(
        row.id,
        "done",
        row.command === "refresh_catalog"
          ? "Catalogue and cache refreshed after the queue was clear."
          : `Queue synced (${drained.pushed} change${drained.pushed === 1 ? "" : "s"} sent).`,
      );
      ran += 1;
    } catch (e) {
      await finish(row.id, "failed", (e as Error).message);
    }
  }
  return ran;
}

/** Store this till reports itself under, for command targeting. */
export const myTerminal = () => ({ id: terminalId(), storeId: activeBranchId() });
