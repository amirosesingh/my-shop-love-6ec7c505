import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Check, Plus, Printer, Send, Trash2, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { stockAt, usePos } from "@/lib/pos-store";
import { printTransferNote } from "@/lib/pos-print";
import type { Transfer, TransferItem, TransferKind } from "@/lib/pos-types";

export const Route = createFileRoute("/transfers")({
  head: () => ({
    meta: [
      { title: "Stock Transfers — Northwind POS" },
      {
        name: "description",
        content:
          "Send stock between branches or request products from another store, then approve, receive and print transfer notes.",
      },
      { property: "og:title", content: "Stock Transfers — Northwind POS" },
      {
        property: "og:description",
        content: "Branch-to-branch stock transfers and product requests.",
      },
    ],
  }),
  component: Transfers,
  validateSearch: (search: Record<string, unknown>): TransferSearch => ({
    items: typeof search.items === "string" ? search.items : undefined,
    kind: search.kind === "request" ? "request" : search.kind === "transfer" ? "transfer" : undefined,
  }),
});

type TransferSearch = { items?: string; kind?: TransferKind };

const statusStyle: Record<string, string> = {
  requested: "border-warning/50 text-warning",
  in_transit: "border-primary/50 text-primary",
  received: "border-success/50 text-success",
  rejected: "border-destructive/50 text-destructive",
  cancelled: "border-destructive/50 text-destructive",
};

function Transfers() {
  const {
    state,
    stores,
    currentStore,
    activeShift,
    createTransfer,
    approveTransfer,
    receiveTransfer,
    rejectTransfer,
  } = usePos();
  const search = Route.useSearch();

  const others = stores.filter((s) => s.id !== currentStore.id);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransferKind>("transfer");
  const [items, setItems] = useState<TransferItem[]>([]);
  const [pickId, setPickId] = useState(state.products[0]?.id ?? "");
  const [otherStoreId, setOtherStoreId] = useState(others[0]?.id ?? "");
  const [note, setNote] = useState("");

  const storeOf = (id: string) => stores.find((s) => s.id === id);
  const productOf = (id: string) => state.products.find((p) => p.id === id) ?? null;

  // Prefilled multi-item basket handed over from the inventory page.
  useEffect(() => {
    if (!search.items) return;
    const ids = search.items.split(",").filter(Boolean);
    if (!ids.length) return;
    setItems(ids.map((productId: string) => ({ productId, qty: 1 })));
    setKind(search.kind ?? "transfer");
    setOpen(true);
  }, [search.items, search.kind]);

  function addItem(productId: string) {
    if (!productId) return;
    setItems((prev) =>
      prev.some((i) => i.productId === productId)
        ? prev.map((i) => (i.productId === productId ? { ...i, qty: i.qty + 1 } : i))
        : [...prev, { productId, qty: 1 }],
    );
  }

  const mine = useMemo(
    () =>
      state.transfers.filter(
        (t) => t.fromStoreId === currentStore.id || t.toStoreId === currentStore.id,
      ),
    [state.transfers, currentStore.id],
  );
  const inbound = mine.filter((t) => t.toStoreId === currentStore.id && t.status === "in_transit");
  const toApprove = mine.filter(
    (t) => t.fromStoreId === currentStore.id && t.status === "requested",
  );

  function print(t: Transfer) {
    const from = storeOf(t.fromStoreId);
    const to = storeOf(t.toStoreId);
    if (from && to) printTransferNote(t, state.products, from, to);
  }

  function submit() {
    const clean = items
      .map((i) => ({ productId: i.productId, qty: Math.floor(Number(i.qty) || 0) }))
      .filter((i) => i.qty > 0);
    if (!clean.length || !otherStoreId) {
      toast.error("Add at least one product with a quantity, and pick a store");
      return;
    }
    const fromStoreId = kind === "transfer" ? currentStore.id : otherStoreId;
    const toStoreId = kind === "transfer" ? otherStoreId : currentStore.id;
    if (kind === "transfer") {
      const short = clean.find((i) => {
        const p = productOf(i.productId);
        return !p || stockAt(p, currentStore.id) < i.qty;
      });
      if (short) {
        const p = productOf(short.productId);
        toast.error(
          `Only ${p ? stockAt(p, currentStore.id) : 0} × ${p?.name ?? "item"} on hand at ${currentStore.name}`,
        );
        return;
      }
    }
    const t = createTransfer({
      kind,
      fromStoreId,
      toStoreId,
      items: clean,
      note,
      createdBy: activeShift?.cashier ?? "Manager",
    });
    print({ ...t });
    setOpen(false);
    setNote("");
    setItems([]);
    toast.success(
      kind === "transfer"
        ? `${t.ref} dispatched · ${clean.length} item${clean.length > 1 ? "s" : ""}`
        : `${t.ref} requested from ${storeOf(otherStoreId)?.name}`,
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Stock transfers</h1>
            <p className="text-sm text-muted-foreground">
              Move product between branches or request it from another store ·{" "}
              <span className="text-primary">{currentStore.name}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setKind("request");
                setOpen(true);
              }}
            >
              <ArrowLeftRight className="size-4" /> Request stock
            </Button>
            <Button
              onClick={() => {
                setKind("transfer");
                setOpen(true);
              }}
            >
              <Send className="size-4" /> New transfer
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Awaiting my approval" value={String(toApprove.length)} />
          <Metric label="Incoming in transit" value={String(inbound.length)} highlight />
          <Metric
            label="Completed"
            value={String(mine.filter((t) => t.status === "received").length)}
          />
        </div>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="px-5 py-3 text-sm font-semibold">Transfer log</h2>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mine.map((t) => {
                const canApprove =
                  t.status === "requested" &&
                  t.fromStoreId === currentStore.id &&
                  can("can_receive_transfer");
                const canReceive =
                  t.status === "in_transit" &&
                  t.toStoreId === currentStore.id &&
                  can("can_receive_transfer");
                return (
                  <TableRow key={t.id}>
                    <TableCell className="numeric">
                      {t.ref}
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(t.createdAt).toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {t.items.map((i) => (
                          <div key={i.productId} className="text-sm">
                            {productOf(i.productId)?.name ?? "—"}
                            <span className="numeric text-muted-foreground"> × {i.qty}</span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="numeric text-center">
                      {t.items.reduce((a, i) => a + i.qty, 0)}
                      <div className="text-[11px] text-muted-foreground">
                        {t.items.length} line{t.items.length > 1 ? "s" : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {storeOf(t.fromStoreId)?.code} → {storeOf(t.toStoreId)?.code}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyle[t.status]}>
                        {t.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canApprove && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              approveTransfer(t.id);
                              print(t);
                              toast.success(`${t.ref} approved and dispatched`);
                            }}
                          >
                            <Check className="size-4" /> Approve
                          </Button>
                        )}
                        {canReceive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              receiveTransfer(t.id);
                              toast.success(`${t.ref} received into ${currentStore.name}`);
                            }}
                          >
                            <Truck className="size-4" /> Receive
                          </Button>
                        )}
                        {(t.status === "requested" || t.status === "in_transit") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              rejectTransfer(t.id);
                              toast.success(`${t.ref} cancelled`);
                            }}
                          >
                            <X className="size-4 text-destructive" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => print(t)}>
                          <Printer className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!mine.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No transfers for this store yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {kind === "transfer" ? "Send stock to another store" : "Request stock from a store"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Add products</Label>
              <div className="flex gap-2">
                <Select value={pickId} onValueChange={setPickId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {stockAt(p, currentStore.id)} at {currentStore.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => addItem(pickId)}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-2">
              {items.map((i) => {
                const p = productOf(i.productId);
                return (
                  <div key={i.productId} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p?.name ?? "Unknown item"}</p>
                      <p className="numeric text-[11px] text-muted-foreground">
                        {currentStore.code} on hand: {p ? stockAt(p, currentStore.id) : 0}
                        {otherStoreId && p
                          ? ` · ${storeOf(otherStoreId)?.code} on hand: ${stockAt(p, otherStoreId)}`
                          : ""}
                      </p>
                    </div>
                    <Input
                      className="numeric h-9 w-20"
                      value={String(i.qty)}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.productId === i.productId
                              ? { ...x, qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) }
                              : x,
                          ),
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setItems((prev) => prev.filter((x) => x.productId !== i.productId))
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
              {!items.length && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No items yet — add one or more products to this note.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>{kind === "transfer" ? "Destination store" : "Supplying store"}</Label>
              <Select value={otherStoreId} onValueChange={setOtherStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>
              {kind === "transfer" ? "Dispatch & print note" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`numeric text-lg font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
