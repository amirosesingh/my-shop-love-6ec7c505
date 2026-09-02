/**
 * Branch identity for this terminal.
 *
 * Every sale written to the local database is stamped with this id, so the
 * central server can tell the stores apart once the rows are pushed.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { electronDb, readBranch, writeBranch } from "@/core/local-db/local-db";

export function BranchSettings() {
  const [branchId, setBranchId] = useState("");
  const [branchName, setBranchName] = useState("");

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

  const save = () => {
    const id = branchId.trim();
    if (!id) {
      toast.error("Enter a branch ID, for example NYC-Main-01");
      return;
    }
    writeBranch({ branchId: id, branchName: branchName.trim() || id });
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Branch ID</Label>
          <Input
            placeholder="NYC-Main-01"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Branch name</Label>
          <Input
            placeholder="New York — Main Street"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
          />
        </div>
      </div>
      <Button size="sm" onClick={save}>
        Save branch identity
      </Button>
    </div>
  );
}
