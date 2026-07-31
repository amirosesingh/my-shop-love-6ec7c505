import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PackagePlus, ScanBarcode, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, stockAt, usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import type { Product } from "@/lib/pos-types";

export const Route = createFileRoute("/purchasing")({
  head: () => ({
    meta: [
      { title: "Purchase Orders & Receiving — Northwind POS" },
      {
        name: "description",
        content:
          "Scan supplier barcodes to receive stock instantly, or create a brand new product record when the code is unknown.",
      },
      { property: "og:title", content: "Purchase Orders & Receiving — Northwind POS" },
      {
        property: "og:description",
        content: "Barcode-driven goods receiving and new product creation.",
      },
    ],
  }),
  component: Purchasing,
});

type LogEntry = {
  id: string;
  barcode: string;
  name: string;
  qty: number;
  kind: "updated" | "created";
  at: string;
};

function Purchasing() {
  const { state, currentStore, upsertProduct, adjustStock } = usePos();
  const { can, user } = useAuth();
  const scanRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState("");
  const [qty, setQty] = useState("1");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [draft, setDraft] = useState<Product | null>(null);

  if (!can("products")) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <ShieldAlert className="mx-auto size-6 text-destructive" />
            <p className="mt-2 font-semibold">Permission required</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your profile does not have “Can Create New Products / Access PO Engine”.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  function submitScan(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    const units = Math.max(1, Number(qty) || 1);
    if (!code) return;

    const hit = state.products.find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase(),
    );

    if (hit) {
      adjustStock(hit.id, units, currentStore.id);
      setHighlightId(hit.id);
      setLog((l) => [
        {
          id: crypto.randomUUID(),
          barcode: code,
          name: hit.name,
          qty: units,
          kind: "updated",
          at: new Date().toISOString(),
        },
        ...l,
      ]);
      toast.success(`Existing Item updated. Added ${units} units to stock.`);
      setBarcode("");
      scanRef.current?.focus();
      return;
    }

    // Unknown barcode — interrupt and force a new product record.
    setDraft({
      id: crypto.randomUUID(),
      name: "",
      sku: code,
      barcode: code,
      category: "General",
      price: 0,
      cost: 0,
      ecomPrice: 0,
      ecomVisible: false,
      stockByStore: Object.fromEntries(
        state.stores.map((s) => [s.id, s.id === currentStore.id ? units : 0]),
      ),
      reorderLevel: 10,
      taxRate: 0.05,
    });
    toast.warning("Unknown barcode — create the product record to continue.");
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Title is required");
    if (!draft.price) return toast.error("POS price is required");
    if (!draft.ecomPrice) return toast.error("E-com price is required");
    upsertProduct(draft);
    setHighlightId(draft.id);
    setLog((l) => [
      {
        id: crypto.randomUUID(),
        barcode: draft.barcode,
        name: draft.name,
        qty: stockAt(draft, currentStore.id),
        kind: "created",
        at: new Date().toISOString(),
      },
      ...l,
    ]);
    toast.success(`New product “${draft.name}” added to the register.`);
    setDraft(null);
    setBarcode("");
    scanRef.current?.focus();
  }

  const recent = state.products.filter(
    (p) => p.id === highlightId || log.some((l) => l.barcode === p.barcode),
  );

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Purchase order &amp; receiving</h1>
          <p className="text-sm text-muted-foreground">
            Receiving into {currentStore.name} · operator {user?.name}
          </p>
        </header>

        <form
          onSubmit={submitScan}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-5"
        >
          <div className="min-w-64 flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Barcode scanner input</Label>
            <div className="relative">
              <ScanBarcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanRef}
                autoFocus
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type a barcode, then press Enter"
                className="numeric h-12 pl-9 text-lg"
              />
            </div>
          </div>
          <div className="w-32 space-y-1">
            <Label className="text-xs text-muted-foreground">Units received</Label>
            <Input
              className="numeric h-12 text-lg"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <Button type="submit" className="h-12">
            <PackagePlus className="size-4" /> Receive stock
          </Button>
        </form>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="px-5 py-3 text-sm font-semibold">Session receiving log</h2>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="numeric text-muted-foreground">
                    {new Date(l.at).toLocaleTimeString()}
                  </TableCell>
                  <TableCell className="numeric">{l.barcode}</TableCell>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="numeric text-right">+{l.qty}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={
                        l.kind === "created"
                          ? "border-accent/50 text-accent"
                          : "border-success/50 text-success"
                      }
                    >
                      {l.kind === "created" ? "new record" : "stock updated"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!log.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    Scan a barcode to start receiving.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        {recent.length > 0 && (
          <section className="rounded-lg border border-border bg-card">
            <h2 className="px-5 py-3 text-sm font-semibold">Affected product records</h2>
            <Separator />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">POS price</TableHead>
                  <TableHead className="text-right">E-com price</TableHead>
                  <TableHead className="text-center">Stock here</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((p) => (
                  <TableRow
                    key={p.id}
                    className={p.id === highlightId ? "bg-success/10" : undefined}
                  >
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="numeric text-muted-foreground">{p.barcode}</TableCell>
                    <TableCell className="numeric text-right">{money(p.price)}</TableCell>
                    <TableCell className="numeric text-right">
                      {money(p.ecomPrice ?? p.price)}
                    </TableCell>
                    <TableCell className="numeric text-center">
                      {stockAt(p, currentStore.id)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </div>

      <Sheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Create new product record</SheetTitle>
            <SheetDescription>
              Barcode {draft?.barcode} was not found in inventory. Complete the record to add it to
              the register.
            </SheetDescription>
          </SheetHeader>
          {draft && (
            <div className="grid gap-3 p-4">
              <Field label="Barcode / SKU">
                <Input
                  className="numeric"
                  value={draft.barcode}
                  onChange={(e) =>
                    setDraft({ ...draft, barcode: e.target.value, sku: e.target.value })
                  }
                />
              </Field>
              <Field label="Title *">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <Input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="POS price *">
                  <Input
                    className="numeric"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="E-com price *">
                  <Input
                    className="numeric"
                    value={draft.ecomPrice ?? 0}
                    onChange={(e) => setDraft({ ...draft, ecomPrice: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Cost">
                  <Input
                    className="numeric"
                    value={draft.cost}
                    onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label={`Opening stock · ${currentStore.code}`}>
                  <Input
                    className="numeric"
                    value={stockAt(draft, currentStore.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        stockByStore: {
                          ...draft.stockByStore,
                          [currentStore.id]: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          )}
          <SheetFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveDraft}>Save product record</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
