import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff Configuration — Northwind POS" },
      {
        name: "description",
        content:
          "Admin panel to manage employees, staff IDs, passwords and the store branch each cashier is currently assigned to.",
      },
      { property: "og:title", content: "Staff Configuration — Northwind POS" },
      {
        property: "og:description",
        content: "Assign and reassign cashier store duty from one admin dashboard.",
      },
    ],
  }),
  component: StaffConfiguration,
});

function StaffConfiguration() {
  const { stores } = usePos();
  const { isAdmin, staff, addStaff, updateStaff, removeStaff } = useAuth();
  const [name, setName] = useState("");
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("123");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");

  const storeLabel = (id: string) => {
    const i = stores.findIndex((s) => s.id === id);
    return i < 0 ? "Unassigned" : `Store ${i + 1} · ${stores[i].name}`;
  };

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <ShieldAlert className="mx-auto size-6 text-destructive" />
            <p className="mt-2 font-semibold">Admin only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Staff configuration is restricted to the admin account.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Staff configuration</h1>
          <p className="text-sm text-muted-foreground">
            Manage employees and reassign store duty — changes apply on their next screen load.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="px-5 py-3 text-sm font-semibold">Active employees</h2>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee name</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Assigned store duty</TableHead>
                <TableHead className="text-right">Remove</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Input
                      className="h-9"
                      value={s.name}
                      onChange={(e) => updateStaff({ ...s, name: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="numeric h-9 w-32"
                      value={s.staffId}
                      onChange={(e) => updateStaff({ ...s, staffId: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-9 w-28"
                      value={s.password}
                      onChange={(e) => updateStaff({ ...s, password: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={s.storeId}
                      onValueChange={(v) => {
                        updateStaff({ ...s, storeId: v });
                        toast.success(`${s.name} assigned to ${storeLabel(v)}`);
                      }}
                    >
                      <SelectTrigger className="h-9 w-56">
                        <SelectValue placeholder="Assigned store duty" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((st, i) => (
                          <SelectItem key={st.id} value={st.id}>
                            Store {i + 1} · {st.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        removeStaff(s.id);
                        toast.success(`${s.name} removed`);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!staff.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No employees yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Add employee</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Employee name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Staff ID</Label>
              <Input
                className="numeric w-36"
                placeholder="EMP-104"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Password</Label>
              <Input
                className="w-28"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Assigned store duty</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((st, i) => (
                    <SelectItem key={st.id} value={st.id}>
                      Store {i + 1} · {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                if (!name.trim() || !staffId.trim() || !password) {
                  toast.error("Name, staff ID and password are required");
                  return;
                }
                if (staff.some((s) => s.staffId.toLowerCase() === staffId.trim().toLowerCase())) {
                  toast.error("That staff ID is already in use");
                  return;
                }
                addStaff({
                  name: name.trim(),
                  staffId: staffId.trim(),
                  password,
                  storeId,
                });
                setName("");
                setStaffId("");
                setPassword("123");
                toast.success("Employee added");
              }}
            >
              <UserPlus className="size-4" /> Add employee
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
