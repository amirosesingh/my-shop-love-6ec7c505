import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Archive, ArchiveRestore, Building2, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { ConfirmSwitch } from "@/components/pos/ConfirmSwitch";
import { BRANCH_POLICY_COPY, branchPolicy, type BranchPolicyKey } from "@/lib/branch-policy";
import type { BranchPolicy, LocationType, Store } from "@/lib/pos-types";
import { LOCATION_TYPES, isActiveLocation, locationPath, locationTypeLabel } from "@/lib/locations";

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
  const {
    stores,
    allStores,
    currentStore,
    upsertStore,
    archiveStore,
    setCurrentStore,
    state,
    updateSettings,
  } = usePos();
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
      locationType: "store",
      parentId: null,
      active: true,
    });
    setName("");
    setCode("");
    setAddress("");
    setPhone("");
    toast.success(`${trimmed} added — now ${stores.length + 1} locations`);
  }

  function setPolicy(store: Store, key: BranchPolicyKey, value: boolean) {
    const current = branchPolicy(state.settings, store.id);
    const next: BranchPolicy = { ...current, [key]: value };
    updateSettings({
      integrations: {
        ...state.settings.integrations,
        branches: { ...(state.settings.integrations.branches ?? {}), [store.id]: next },
      },
    });
    toast.success(
      `${BRANCH_POLICY_COPY[key].label} ${value ? "turned on" : "turned off"} for ${store.name}`,
    );
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
          {allStores.map((s, i) => (
            <div key={s.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Building2 className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {locationTypeLabel(s.locationType)} {i + 1}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.code} · {locationPath(allStores, s.id)}
                    </p>
                  </div>
                </div>
                {!isActiveLocation(s) ? (
                  <Badge variant="secondary">Archived</Badge>
                ) : (
                  currentStore.id === s.id && <Badge variant="outline">Active</Badge>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Location type</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={s.locationType ?? "store"}
                    onChange={(e) =>
                      upsertStore({ ...s, locationType: e.target.value as LocationType })
                    }
                  >
                    {LOCATION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Parent location</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={s.parentId ?? ""}
                    onChange={(e) => upsertStore({ ...s, parentId: e.target.value || null })}
                  >
                    <option value="">None (top level)</option>
                    {stores
                      .filter((x) => x.id !== s.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Building name</Label>
                  <Input
                    className="h-9"
                    value={s.buildingName ?? ""}
                    onChange={(e) => upsertStore({ ...s, buildingName: e.target.value })}
                    placeholder="Riverside Tower"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Floor / room</Label>
                  <Input
                    className="h-9"
                    value={s.floorLabel ?? ""}
                    onChange={(e) => upsertStore({ ...s, floorLabel: e.target.value })}
                    placeholder="2nd Floor Vault"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!s.isCentral}
                  onChange={(e) => {
                    const on = e.target.checked;
                    if (on)
                      for (const other of allStores.filter((x) => x.isCentral && x.id !== s.id))
                        upsertStore({ ...other, isCentral: false });
                    upsertStore({ ...s, isCentral: on });
                  }}
                />
                Central hub — all inbound stock is received here first
              </label>
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
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Group / cluster</Label>
                <Input
                  value={s.groupId ?? ""}
                  onChange={(e) => upsertStore({ ...s, groupId: e.target.value.trim() })}
                  placeholder="default"
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground">
                  Branches sharing a group move stock as an internal transfer. Sending to a
                  different group is an inter-group transfer and re-maps the item into that
                  group's catalogue on arrival.
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

              <div className="space-y-2 rounded-md border border-border/70 bg-muted/30 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Branch independence
                </p>
                {(
                  [
                    "privateStock",
                    "privateCatalogue",
                    "allowTransfers",
                    "syncInventory",
                    "syncOther",
                  ] as BranchPolicyKey[]
                ).map((key) => {
                  const copy = BRANCH_POLICY_COPY[key];
                  return (
                    <ConfirmSwitch
                      key={key}
                      label={copy.label}
                      hint={copy.hint}
                      subject={s.name}
                      onWarning={copy.onWarning}
                      offWarning={copy.offWarning}
                      checked={branchPolicy(state.settings, s.id)[key]}
                      onConfirmedChange={(v) => setPolicy(s, key, v)}
                    />
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={!isActiveLocation(s)}
                  onClick={() => setCurrentStore(s.id)}
                >
                  View this store
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const archiving = isActiveLocation(s);
                    const refusal = archiveStore(s.id, archiving);
                    if (refusal) return toast.error(`${s.name} cannot be archived`, { description: refusal });
                    toast.success(`${s.name} ${archiving ? "archived" : "restored"}`);
                  }}
                >
                  {isActiveLocation(s) ? (
                    <Archive className="size-4 text-destructive" />
                  ) : (
                    <ArchiveRestore className="size-4 text-success" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
