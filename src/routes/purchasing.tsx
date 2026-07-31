import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FilePlus2, PackagePlus, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { stockAt, usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import type { Product } from "@/lib/pos-types";

export const Route = createFileRoute("/purchasing")({
  head: () => ({
    meta: [
      { title: "Purchase Orders & Receiving — Northwind POS" },
      {
        name: "description",
        content:
          "Post batch supplier invoices with multiple product receipt lines and track every shipment received into the branch.",
      },
      { property: "og:title", content: "Purchase Orders & Receiving — Northwind POS" },
      {
        property: "og:description",
        content: "Batch invoice intake, barcode receipt lines and received-shipment history.",
      },
    ],
  }),
  component: Purchasing,
});

type Line = {
  id: string;
  code: string;
  qty: string;
  error?: boolean;
};

type InvoiceLog = {
  id: string;
  invoiceNo: string;
  uniqueItems: number;
  totalUnits: number;
  at: string;
  operator: string;
  storeCode: string;
};

const newLine = (): Line => ({ id: crypto.randomUUID(), code: "", qty: "1" });

function Purchasing() {
  const { state, currentStore, upsertProduct, adjustStock } = usePos();
  const { can, user } = useAuth();
  const [invoiceNo, setInvoiceNo] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [history, setHistory] = useState<InvoiceLog[]>([]);
  const [draft, setDraft] = useState<{ product: Product; lineId: string } | null>(null);

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

  const findProduct = (code: string) =>
    state.products.find(
      (p) =>
        p.barcode === code.trim() || p.sku.toLowerCase() === code.trim().toLowerCase(),
    );

  const patch = (id: string, next: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...next } : l)));

  function postInvoice() {
    const ref = invoiceNo.trim();
    if (!ref) return toast.error("Master Invoice / PO Number is required");

    const filled = lines.filter((l) => l.code.trim());
    if (!filled.length) return toast.error("Add at least one product receipt line");

    const missing: string[] = [];
    setLines((ls) =>
      ls.map((l) => {
        if (!l.code.trim()) return { ...l, error: false };
        const hit = findProduct(l.code);
        if (!hit) missing.push(l.id);
        return { ...l, error: !hit };
      }),
    );

    const unresolved = filled.filter((l) => !findProduct(l.code));
    if (unresolved.length) {
      toast.error(
        `${unresolved.length} line${unresolved.length > 1 ? "s" : ""} not found in the catalog.`,
      );
      return;
    }

    let totalUnits = 0;
    for (const l of filled) {
      const hit = findProduct(l.code)!;
      const units = Math.max(1, Number(l.qty) || 1);
      totalUnits += units;
      adjustStock(hit.id, units, currentStore.id);
    }

    setHistory((h) => [
      {
        id: crypto.randomUUID(),
        invoiceNo: ref,
        uniqueItems: filled.length,
        totalUnits,
        at: new Date().toISOString(),
        operator: user?.name ?? "—",
        storeCode: currentStore.code,
      },
      ...h,
    ]);
    toast.success(`Invoice ${ref} posted · ${totalUnits} units received`);
    setInvoiceNo("");
    setLines([newLine()]);
  }

  function openDraft(line: Line) {
    const code = line.code.trim();
    setDraft({
      lineId: line.id,
      product: {
        id: crypto.randomUUID(),
        name: "",
        sku: code,
        barcode: code,
        category: "General",
        price: 0,
        cost: 0,
        ecomPrice: 0,
        ecomVisible: false,
        stockByStore: Object.fromEntries(state.stores.map((s) => [s.id, 0])),
        reorderLevel: 10,
        taxRate: 0.05,
      },
    });
  }

  function saveDraft() {
    if (!draft) return;
    const p = draft.product;
    if (!p.name.trim()) return toast.error("Title is required");
    if (!p.price) return toast.error("POS price is required");
    if (!p.ecomPrice) return toast.error("E-com price is required");
    upsertProduct(p);
    patch(draft.lineId, { error: false });
    toast.success(`“${p.name}” created — re-post the invoice to receive it.`);
    setDraft(null);
  }

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Purchase order &amp; receiving</h1>
          <p className="text-sm text-muted-foreground">
            Batch invoice intake for {currentStore.name} · operator {user?.name}
          </p>
        </header>

        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="max-w-md space-y-1">
            <Label className="text-xs text-muted-foreground">Master Invoice / PO Number *</Label>
            <Input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="e.g. INV-2026-0417"
              className="numeric h-11 text-base"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-semibold">Product receipt lines</p>
            {lines.map((l, i) => {
              const hit = l.code.trim() ? findProduct(l.code) : undefined;
              return (
                <div key={l.id} className="space-y-1">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1 space-y-1">
                      {i === 0 && (
                        <Label className="text-[11px] text-muted-foreground">Barcode / SKU</Label>
                      )}
                      <Input
                        value={l.code}
                        onChange={(e) => patch(l.id, { code: e.target.value, error: false })}
                        placeholder="Scan or type a barcode"
                        className={`numeric h-11 ${
                          l.error ? "border-2 border-destructive" : ""
                        }`}
                      />
                    </div>
                    <div className="w-32 space-y-1">
                      {i === 0 && (
                        <Label className="text-[11px] text-muted-foreground">Qty received</Label>
                      )}
                      <Input
                        value={l.qty}
                        onChange={(e) => patch(l.id, { qty: e.target.value })}
                        className="numeric h-11"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11"
                      onClick={() =>
                        setLines((ls) =>
                          ls.length > 1 ? ls.filter((x) => x.id !== l.id) : [newLine()],
                        )
                      }
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  {l.error ? (
                    <button
                      onClick={() => openDraft(l)}
                      className="text-xs font-medium text-warning underline-offset-4 hover:underline"
                    >
                      Create missing item record
                    </button>
                  ) : hit ? (
                    <p className="text-[11px] text-muted-foreground">
                      {hit.name} · in stock {stockAt(hit, currentStore.id)}
                    </p>
                  ) : null}
                </div>
              );
            })}

            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
              <Plus className="size-4" /> Add new row
            </Button>
          </div>

          <Separator />

          <Button className="h-11 w-full sm:w-auto" onClick={postInvoice}>
            <PackagePlus className="size-4" /> Post invoice to inventory
          </Button>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="px-5 py-3 text-sm font-semibold">Invoices received history</h2>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice no.</TableHead>
                <TableHead className="text-right">Unique items</TableHead>
                <TableHead className="text-right">Total units</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead className="text-right">Branch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="numeric font-medium">{h.invoiceNo}</TableCell>
                  <TableCell className="numeric text-right">{h.uniqueItems}</TableCell>
                  <TableCell className="numeric text-right">{h.totalUnits}</TableCell>
                  <TableCell className="numeric text-muted-foreground">
                    {new Date(h.at).toLocaleString()}
                  </TableCell>
                  <TableCell>{h.operator}</TableCell>
                  <TableCell className="numeric text-right text-muted-foreground">
                    {h.storeCode}
                  </TableCell>
                </TableRow>
              ))}
              {!history.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No invoices posted yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      <Sheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              <span className="flex items-center gap-2">
                <FilePlus2 className="size-4" /> Create new product record
              </span>
            </SheetTitle>
            <SheetDescription>
              Barcode {draft?.product.barcode} was not found. Complete the record, then post the
              invoice again.
            </SheetDescription>
          </SheetHeader>
          {draft && (
            <div className="grid gap-3 p-4">
              <Field label="Barcode / SKU">
                <Input
                  className="numeric"
                  value={draft.product.barcode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      product: {
                        ...draft.product,
                        barcode: e.target.value,
                        sku: e.target.value,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Title *">
                <Input
                  value={draft.product.name}
                  onChange={(e) =>
                    setDraft({ ...draft, product: { ...draft.product, name: e.target.value } })
                  }
                />
              </Field>
              <Field label="Category">
                <Input
                  value={draft.product.category}
                  onChange={(e) =>
                    setDraft({ ...draft, product: { ...draft.product, category: e.target.value } })
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="POS price *">
                  <Input
                    className="numeric"
                    value={draft.product.price}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        product: { ...draft.product, price: Number(e.target.value) || 0 },
                      })
                    }
                  />
                </Field>
                <Field label="E-com price *">
                  <Input
                    className="numeric"
                    value={draft.product.ecomPrice ?? 0}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        product: { ...draft.product, ecomPrice: Number(e.target.value) || 0 },
                      })
                    }
                  />
                </Field>
                <Field label="Cost">
                  <Input
                    className="numeric"
                    value={draft.product.cost}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        product: { ...draft.product, cost: Number(e.target.value) || 0 },
                      })
                    }
                  />
                </Field>
                <Field label="Reorder level">
                  <Input
                    className="numeric"
                    value={draft.product.reorderLevel}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        product: { ...draft.product, reorderLevel: Number(e.target.value) || 0 },
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
