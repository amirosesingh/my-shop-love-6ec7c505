/**
 * Branch identity for this terminal.
 *
 * The branch list comes from the central database, so the ID and the name are
 * the real ones and a rename reaches the till. Every sale written to the local
 * database is stamped with this id. When the list cannot be reached — a fresh
 * till, or no connection — the two fields can still be filled in by hand.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { electronDb, readBranch, writeBranch } from "@/core/local-db/local-db";
import { usePos } from "@/lib/pos-store";
import { bindTerminalBranch } from "@/lib/active-branch";
import { readTerminalConfig } from "@/core/activation/terminal-tokens";

export function BranchSettings() {
  const { stores } = usePos();
  const [branchId, setBranchId] = useState("");
  const [branchName, setBranchName] = useState("");

  const activation = useMemo(() => readTerminalConfig(), []);
  const lockedId = (activation?.locationId ?? "").trim() || null;
  const hasDirectory = stores.length > 0;

  useEffect(() => {
    const local = readBranch();
    setBranchId(local.branchId ?? "");
    setBranchName(local.branchName ?? "");
    void electronDb()
      ?.getBranch()
      .then((res) => {
        if (!res.ok) return;
        if (res.branchId) setBranchId(res.branchId);
        if (res.branchName) setBranchName(res.branchName);
      })
      .catch(() => {
        /* the shell may not be connected yet — local values stand */
      });
  }, []);

  // The activated branch always wins over anything stored locally.
  useEffect(() => {
    if (!lockedId) return;
    setBranchId(lockedId);
    const match = stores.find((s) => s.id === lockedId);
    if (match) setBranchName(match.name);
  }, [lockedId, stores]);

  const pick = (id: string) => {
    setBranchId(id);
    const match = stores.find((s) => s.id === id);
    if (match) setBranchName(match.name);
  };

  const source = lockedId
    ? "Fixed by this terminal's activation."
    : hasDirectory
      ? "Taken from the central database."
      : "Entered by hand — the branch list is not available right now.";

  const save = () => {
    const id = branchId.trim();
    if (!id) {
      toast.error("Choose a branch first");
      return;
    }
    const name = (stores.find((s) => s.id === id)?.name ?? branchName).trim() || id;
    writeBranch({ branchId: id, branchName: name });
    bindTerminalBranch(id, name);
    setBranchName(name);
    toast.success("Branch identity saved");
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">Branch identity</p>
        <p className="text-[11px] text-muted-foreground">
          Stamped on every locally-created sale so the central server can tell branches apart.
        </p>
      </div>

      {hasDirectory ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Branch</Label>
          <Select value={branchId} onValueChange={pick} disabled={!!lockedId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a branch" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {branchName ? `${branchName} — ` : ""}
            {branchId || "no branch chosen yet"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Branch ID</Label>
            <Input
              placeholder="NYC-Main-01"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={!!lockedId}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Branch name</Label>
            <Input
              placeholder="New York — Main Street"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              disabled={!!lockedId}
            />
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{source}</p>

      <Button size="sm" onClick={save} disabled={!!lockedId && !branchId}>
        Save branch identity
      </Button>
    </div>
  );
}
