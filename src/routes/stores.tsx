import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";

export const Route = createFileRoute("/stores")({
  head: () => ({
    meta: [
      { title: "Manage Locations — Northwind POS" },
      {
        name: "description",
        content:
          "Create an unlimited number of storefront locations and edit the address, code and phone of every branch.",
      },
      { property: "og:title", content: "Manage Locations — Northwind POS" },
      { property: "og:description", content: "Infinite store builder for multi-branch retail." },
    ],
  }),
  component: Locations,
});

function Locations() {
  const { stores, currentStore, upsertStore, removeStore, setCurrentStore, state } = usePos();
  const { isAdmin } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <ShieldAlert className="mx-auto size-6 text-destructive" />
            <p className="mt-2 font-semibold">Admin only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Location management is restricted to the admin account.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  function addStore() {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Location name is required");
    const auto =
      code.trim().toUpperCase() ||
      `${trimmed.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "STR"}${stores.length + 1}`;
    upsertStore({
      id: crypto.randomUUID(),
      code: auto,
      name: trimmed,
      address: address.trim() || "Address pending",
      phone: phone.trim() || "—",
    });
    setName("");
    setCode("");
    setAddress("");
    setPhone("");
    toast.success(`${trimmed} added — now ${stores.length + 1} locations`);
  }

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Manage locations</h1>
          <p className="text-sm text-muted-foreground">
            <span className="numeric">{stores.length}</span> storefronts · every new location gets
            its own stock bucket on all {state.products.length} products.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Add a location</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Location name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Mall" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Code (optional)</Label>
              <Input className="w-28 numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="RVS" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="w-64" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-36 numeric" />
            </div>
            <Button onClick={addStore}>
              <Plus className="size-4" /> Create location
            </Button>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((s, i) => (
            <div key={s.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Building2 className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Store {i + 1}</p>
                    <p className="text-[11px] text-muted-foreground">{s.code}</p>
                  </div>
                </div>
                {currentStore.id === s.id && <Badge variant="outline">Active</Badge>}
              </div>
              <Input
                value={s.name}
                onChange={(e) => upsertStore({ ...s, name: e.target.value })}
                className="h-9"
              />
              <Input
                value={s.code}
                onChange={(e) => upsertStore({ ...s, code: e.target.value.toUpperCase() })}
                className="numeric h-9"
              />
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Receipt number prefix
                </Label>
                <Input
                  value={s.receiptPrefix ?? ""}
                  onChange={(e) =>
                    upsertStore({ ...s, receiptPrefix: e.target.value.toUpperCase() })
                  }
                  placeholder={s.code}
                  className="numeric h-9"
                />
                <p className="text-[10px] text-muted-foreground">
                  Receipts raised here are numbered {(s.receiptPrefix?.trim() || s.code || "R")}
                  -000123, keeping every branch unique. Leave blank to use the store code.
                </p>
              </div>
              <Input
                value={s.address}
                onChange={(e) => upsertStore({ ...s, address: e.target.value })}
                className="h-9"
              />
              <Input
                value={s.phone}
                onChange={(e) => upsertStore({ ...s, phone: e.target.value })}
                className="numeric h-9"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCurrentStore(s.id)}
                >
                  View this store
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={stores.length <= 1}
                  onClick={() => {
                    removeStore(s.id);
                    toast.success(`${s.name} removed`);
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
