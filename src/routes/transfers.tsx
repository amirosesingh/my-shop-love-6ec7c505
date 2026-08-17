import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  FileSpreadsheet,
  Plus,
  Printer,
  Send,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { groupOf, scopeBetween } from "@/lib/stock-transfers";
import { AppShell } from "@/components/pos/AppShell";
import { useAuth } from "@/lib/pos-auth";
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
import { availableAt, planDeduction, subWarehouses } from "@/lib/locations";
import { printTransferNote } from "@/lib/pos-print";
import type { Transfer, TransferItem, TransferKind } from "@/lib/pos-types";
import { branchPolicy } from "@/lib/branch-policy";

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
    allStores,
    currentStore,
    activeShift,
    createTransfer,
    approveTransfer,
    receiveTransfer,
    rejectTransfer,
    adjustStock,
  } = usePos();
  const { can } = useAuth();
  const search = Route.useSearch();
  const requireApproval = state.settings.integrations.requireTransferApproval;
  const canApprove = can("can_approve_transfer") || can("can_receive_transfer");

  // A branch with transfers switched off cannot send or receive stock.
  const others = stores.filter(
    (s) => s.id !== currentStore.id && branchPolicy(state.settings, s.id).allowTransfers,
  );
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransferKind>("transfer");
  const [items, setItems] = useState<TransferItem[]>([]);
  const [pickId, setPickId] = useState(state.products[0]?.id ?? "");
  const [otherStoreId, setOtherStoreId] = useState(others[0]?.id ?? "");
  // A move between clusters re-maps the item into the receiving catalogue.
  const crossGroup =
    Boolean(otherStoreId) &&
    scopeBetween(currentStore, stores.find((s) => s.id === otherStoreId)) === "INTER_GROUP";
  const [note, setNote] = useState("");

  const storeOf = (id: string) => stores.find((s) => s.id === id);
  const productOf = (id: string) => state.products.find((p) => p.id === id) ?? null;

  /** Levels underneath the sending location, if it is split into floors. */
  const sourceLevels = subWarehouses(allStores, currentStore.id);
  /** Where each line will physically be picked from — primary level first. */
  const pickPlan = (productId: string, qty: number) => {
    const p = productOf(productId);
    if (!p) return null;
    return planDeduction(p, allStores, currentStore.id, qty);
  };

  // Prefilled multi-item basket handed over from the inventory page.
  useEffect(() => {
    if (!others.some((store) => store.id === otherStoreId)) {
      setOtherStoreId(others[0]?.id ?? "");
    }
  }, [others, otherStoreId]);

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

  /** Bulk basket from a spreadsheet: barcode / SKU / name + quantity. */
  async function importSheet(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
      if (!sheet) throw new Error("empty workbook");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const pick = (r: Record<string, unknown>, keys: string[]) => {
        for (const [k, v] of Object.entries(r)) {
          if (keys.includes(k.trim().toLowerCase())) return String(v).trim();
        }
        return "";
      };
      const next: TransferItem[] = [];
      const missing: string[] = [];
      for (const r of rows) {
        const key = pick(r, ["barcode", "sku", "code", "product", "name", "item"]);
        const qty = Math.floor(Number(pick(r, ["qty", "quantity", "units"])) || 0);
        if (!key || qty <= 0) continue;
        const needle = key.toLowerCase();
        const p = state.products.find(
          (x) =>
            x.barcode?.toLowerCase() === needle ||
            x.sku?.toLowerCase() === needle ||
            x.name.toLowerCase() === needle,
        );
        if (!p) {
          missing.push(key);
          continue;
        }
        const found = next.find((i) => i.productId === p.id);
        if (found) found.qty += qty;
        else next.push({ productId: p.id, qty });
      }
      if (!next.length) {
        toast.error("Nothing matched — use columns Barcode / SKU / Name and Qty");
        return;
      }
      setItems((prev) => {
        const merged = [...prev];
        for (const i of next) {
          const hit = merged.find((x) => x.productId === i.productId);
          if (hit) hit.qty += i.qty;
          else merged.push(i);
        }
        return merged;
      });
      toast.success(
        `${next.length} line${next.length > 1 ? "s" : ""} imported${
          missing.length ? ` · ${missing.length} unknown item(s) skipped` : ""
        }`,
      );
    } catch {
      toast.error("Could not read that file — use a .xlsx or .csv sheet");
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Barcode", "Qty"],
      ...state.products.slice(0, 3).map((p) => [p.barcode ?? p.sku ?? p.name, 1]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transfer");
    XLSX.writeFile(wb, "stock-transfer-template.xlsx");
  }

  const mine = useMemo(
    () =>
      state.transfers.filter(
        (t) => t.fromStoreId === currentStore.id || t.toStoreId === currentStore.id,
      ),
    [state.transfers, currentStore.id],
  );
  /** Same cluster, across clusters, or everything. */
  const [scopeTab, setScopeTab] = useState<"all" | "INTRA_GROUP" | "INTER_GROUP">("all");
  const visible = useMemo(
    () =>
      mine.filter((t) =>
        scopeTab === "all"
          ? true
          : scopeBetween(
              stores.find((s) => s.id === t.fromStoreId),
              stores.find((s) => s.id === t.toStoreId),
            ) === scopeTab,
      ),
    [mine, scopeTab, stores],
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
      // With sub-warehouse levels the check — and the pick — spans every level.
      for (const i of clean) {
        const p = productOf(i.productId);
        const plan = p ? planDeduction(p, allStores, currentStore.id, i.qty) : null;
        if (!p || !plan || plan.shortBy > 0) {
          toast.error(
            `Short by ${plan?.shortBy ?? i.qty} × ${p?.name ?? "item"} at ${currentStore.name}`,
            { description: "Nothing has been moved. Reduce the quantity or restock first." },
          );
          return;
        }
      }
      // Consolidate the picked levels into the sending location so the
      // dispatch deduction below leaves the right shelf empty.
      if (sourceLevels.length)
        for (const i of clean) {
          const p = productOf(i.productId);
          if (!p) continue;
          for (const pick of planDeduction(p, allStores, currentStore.id, i.qty).picks) {
            if (pick.storeId === currentStore.id) continue;
            adjustStock(i.productId, -pick.qty, pick.storeId);
            adjustStock(i.productId, pick.qty, currentStore.id);
          }
        }
    }
    const t = createTransfer({
      kind,
      fromStoreId,
      toStoreId,
      items: clean,
      note,
      createdBy: activeShift?.cashier ?? "Manager",
      needsApproval: kind === "transfer" && requireApproval,
    });
    if (t.status === "in_transit") print({ ...t });
    setOpen(false);
    setNote("");
    setItems([]);
    toast.success(
      kind === "transfer"
        ? requireApproval
          ? `${t.ref} sent for approval · ${clean.length} item${clean.length > 1 ? "s" : ""}`
          : `${t.ref} dispatched · ${clean.length} item${clean.length > 1 ? "s" : ""}`
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
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 px-5 py-3 sm:flex sm:items-center sm:justify-between">
            <h2 className="truncate text-sm font-semibold">Transfer log</h2>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "All routes"],
                  ["INTRA_GROUP", "Within my group"],
                  ["INTER_GROUP", "Between groups"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setScopeTab(key)}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    scopeTab === key
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
              {visible.map((t) => {
                const showApprove =
                  t.status === "requested" &&
                  t.fromStoreId === currentStore.id &&
                  canApprove;
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
                      {scopeBetween(storeOf(t.fromStoreId), storeOf(t.toStoreId)) ===
                        "INTER_GROUP" && (
                        <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          inter-group
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyle[t.status]}>
                        {t.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {showApprove && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              approveTransfer(t.id);
                              print(t);
                              toast.success(`${t.ref} authorised and dispatched`);
                            }}
                          >
                            <Check className="size-4" /> Approve
                          </Button>
                        )}
                        {t.status === "requested" && !showApprove && (
                          <span className="text-[11px] text-muted-foreground">
                            Waiting for approval
                          </span>
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
              {!visible.length && (
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
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button asChild variant="outline" size="sm">
                  <label className="cursor-pointer">
                    <Upload className="size-3.5" /> Import from Excel / CSV
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importSheet(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
                <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                  <FileSpreadsheet className="size-3.5" /> Template
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
              {!others.length && (
                <p className="text-xs text-muted-foreground">
                  {stores.length <= 1
                    ? "No other branch is available in the central directory."
                    : "No other branch currently allows stock transfers."}
                </p>
              )}
            </div>
            {crossGroup && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  Inter-group transfer
                </p>
                <p className="mt-1 text-muted-foreground">
                  {currentStore.name} ({groupOf(currentStore)}) and{" "}
                  {storeOf(otherStoreId)?.name} ({groupOf(storeOf(otherStoreId))}) sit in different
                  clusters. On arrival each line is matched into the receiving cluster's own
                  catalogue by barcode, so stock stays isolated per group.
                </p>
              </div>
            )}
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
              {kind === "transfer"
                ? requireApproval
                  ? "Send for approval"
                  : "Dispatch & print note"
                : "Send request"}
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
