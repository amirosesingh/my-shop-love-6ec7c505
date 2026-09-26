/**
 * Data-only remote commands an administrator can send to a till.
 *
 * The rule that matters: nothing runs until this terminal's own unsynced
 * sales have reached the central database. A catalogue refresh that ran first
 * could overwrite local rows that were never sent, so a command with work
 * still queued is reported back as blocked and tried again later.
 */
import { terminalId } from "./activity-journal";
import { activeBranchId } from "./active-branch";
import { routedQuery } from "@/core/api/db-query";
import { commitOps } from "@/core/api/pos-db";

export type CommandName = "refresh_catalog";

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
  await commitOps("Issuing terminal command", [{ kind: "insert", table: "terminal_commands", rows: [{
    id: crypto.randomUUID(), terminal_id: input.terminalId,
    store_id: input.storeId ?? null,
    command: input.command,
    issued_by: input.issuedBy ?? null,
    issued_role: input.issuedRole ?? null,
    note: input.note ?? null,
    status: "pending", created_at: new Date().toISOString(),
  }] }]);
}

/** Recent commands, newest first. */
export async function listCommands(limit = 40): Promise<TerminalCommand[]> {
  return await routedQuery("terminal_commands", {
    orderBy: { column: "created_at", ascending: false }, limit,
  }) as unknown as TerminalCommand[];
}

async function finish(id: string, status: TerminalCommand["status"], result: string) {
  await commitOps("Finishing terminal command", [{ kind: "update", table: "terminal_commands",
    match: { id }, values: { status, result, finished_at: new Date().toISOString() } }]);
}

/**
 * Pick up anything queued for this till and run it, offline work first.
 * `onRefresh` is supplied by the caller so the catalogue reload stays in the
 * data layer that owns it.
 */
export async function runPendingCommands(onRefresh: () => Promise<void>): Promise<number> {
  if (typeof window === "undefined") return 0;
  const me = terminalId();
  const data = await routedQuery("terminal_commands", { match: { terminal_id: me, status: "pending" },
    orderBy: { column: "created_at", ascending: true }, limit: 200 });
  if (!data.length) return 0;

  let ran = 0;
  for (const row of data as unknown as TerminalCommand[]) {
    await commitOps("Running terminal command", [{ kind: "update", table: "terminal_commands",
      match: { id: row.id }, values: { status: "running", picked_up_at: new Date().toISOString() } }]);

    try {
      await onRefresh();
      await finish(row.id, "done", "Catalogue refreshed from the central database.");
      ran += 1;
    } catch (e) {
      await finish(row.id, "failed", (e as Error).message);
    }
  }
  return ran;
}

/** Store this till reports itself under, for command targeting. */
export const myTerminal = () => ({ id: terminalId(), storeId: activeBranchId() });
