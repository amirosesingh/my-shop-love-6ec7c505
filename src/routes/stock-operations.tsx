/**
 * Stock Operations — the only place stock quantities change by hand.
 *
 * Scan (or type) a code, enter the physical count, press Enter: the row lands
 * in a PO-style review queue with the variance and its cost impact, and focus
 * snaps straight back to the punch bar for the next item.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ScanBarcode, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { money, stockAt, usePos } from "@/lib/pos-store";
import { resolveByBarcode } from "@/lib/product-lookup";
import { STOCK_ADJUSTMENT_REASONS, type StockAdjustmentReason } from "@/lib/pos-types";

type CountRow = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  subCategory: string;
  system: number;
  counted: number;
  cost: number;
};

function StockOperationsPage() {
  const { state, currentStore, applyStockCount } = usePos();
  const products = state.products;
  const [code, setCode] = useState("");
  const [counted, setCounted] = useState("");
  const [rows, setRows] = useState<CountRow[]>([]);
  const [reason, setReason] = useState<StockAdjustmentReason>("stock_count");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLInputElement>(null);

  const match = useMemo(() => resolveByBarcode(products, code), [products, code]);

  const queue = (productId: string, qty: number) => {
    const p = products.find((x: (typeof products)[number]) => x.id === productId);
    if (!p) return;
    setRows((prev) => {
      const row: CountRow = {
        productId: p.id,
        name: p.name,
        sku: p.sku ?? "",
        category: p.category ?? "",
        subCategory: p.subCategory ?? "",
        system: stockAt(p, currentStore.id),
        counted: Math.max(0, Math.round(qty)),
        cost: p.cost ?? 0,
      };
      const idx = prev.findIndex((r) => r.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = row;
        return next;
      }
      return [row, ...prev];
    });
  };

  const commitPunch = () => {
    if (!match) {
      toast.warning("No product matches that code.");
      codeRef.current?.select();
      return;
    }
    const qty = Number(counted);
    if (!counted.trim() || Number.isNaN(qty) || qty < 0) {
      toast.warning("Enter the physical counted quantity.");
      countRef.current?.focus();
      return;
    }
    queue(match.id, qty);
    setCode("");
    setCounted("");
    codeRef.current?.focus();
  };

  const totalImpact = rows.reduce((s, r) => s + (r.counted - r.system) * r.cost, 0);

  const save = () => {
    const entries = rows
      .filter((r) => r.counted !== r.system)
      .map((r) => ({ productId: r.productId, counted: r.counted }));
    if (!entries.length) {
      toast.warning("Nothing to post — every counted quantity matches the system.");
      return;
    }
    applyStockCount(entries, reason, note, currentStore.id);
    toast.success(`${entries.length} item${entries.length === 1 ? "" : "s"} adjusted.`);
    setRows([]);
    setNote("");
    codeRef.current?.focus();
  };

  const importFile = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("empty");
      const sheet = wb.Sheets[sheetName];
      if (!sheet) throw new Error("empty");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const problems: string[] = [];
      raw.forEach((r, i) => {
        const key = String(r["barcode"] ?? r["sku"] ?? r["code"] ?? "").trim();
        const qty = Number(r["counted"] ?? r["quantity"] ?? r["qty"]);
        if (!key) return problems.push(`Row ${i + 2}: no barcode or SKU`);
        const p = resolveByBarcode(products, key);
        if (!p) return problems.push(`Row ${i + 2}: "${key}" is not in the catalogue`);
        if (Number.isNaN(qty) || qty < 0) return problems.push(`Row ${i + 2}: invalid counted quantity`);
        queue(p.id, qty);
      });
      setErrors(problems);
      toast.success(`Imported ${raw.length - problems.length} row(s).`);
    } catch {
      toast.error("That file could not be read. Use .xlsx or .csv.");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
        <Tabs defaultValue="count">
          <TabsList>
            <TabsTrigger value="count">
              <ScanBarcode className="mr-2 size-4" /> Physical count
            </TabsTrigger>
            <TabsTrigger value="import">
              <UploadCloud className="mr-2 size-4" /> Bulk import
            </TabsTrigger>
            <TabsTrigger value="transfers">
              <ArrowLeftRight className="mr-2 size-4" /> Transfers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="count" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
                <div>
                  <Label htmlFor="so-code">Scan or type a barcode / SKU</Label>
                  <Input
                    id="so-code"
                    ref={codeRef}
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (match) countRef.current?.focus();
                        else toast.warning("No product matches that code.");
                      }
                    }}
                    placeholder="Scanner input lands here"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {match
                      ? `${match.name} · system stock ${stockAt(match, currentStore.id)}`
                      : "Waiting for a scan…"}
                  </p>
                </div>
                <div>
                  <Label htmlFor="so-count">Physical counted qty</Label>
                  <Input
                    id="so-count"
                    ref={countRef}
                    inputMode="numeric"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitPunch();
                      }
                    }}
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {match && counted.trim() && !Number.isNaN(Number(counted))
                      ? `Delta ${Number(counted) - stockAt(match, currentStore.id) >= 0 ? "+" : ""}${
                          Number(counted) - stockAt(match, currentStore.id)
                        }`
                      : "Press Enter to queue"}
                  </p>
                </div>
                <div className="flex items-end">
                  <Button onClick={commitPunch}>Add to queue</Button>
                </div>
              </div>
            </div>

            <ReviewTable rows={rows} onRemove={(id) => setRows((p) => p.filter((r) => r.productId !== id))} />

            <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[220px_1fr_auto]">
              <div>
                <Label>Reason</Label>
                <ThemedSelect
                  value={reason}
                  onChange={(v) => setReason(v as StockAdjustmentReason)}
                  options={STOCK_ADJUSTMENT_REASONS.map((r) => ({ value: r.value, label: r.label }))}
                  ariaLabel="Adjustment reason"
                />
              </div>
              <div>
                <Label htmlFor="so-note">Note</Label>
                <Textarea
                  id="so-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional context for the audit trail"
                />
              </div>
              <div className="flex items-end justify-end gap-3">
                <span className="numeric text-sm text-muted-foreground">
                  Impact {money(totalImpact)}
                </span>
                <Button onClick={save} disabled={!rows.length}>
                  Post adjustments
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) void importFile(file);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center ${
                dragging ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <UploadCloud className="size-8 text-muted-foreground" />
              <p className="text-sm">Drop an .xlsx or .csv with columns barcode/sku and counted.</p>
              <label className="cursor-pointer text-sm text-primary underline">
                or choose a file
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importFile(file);
                  }}
                />
              </label>
            </div>
            {errors.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <ReviewTable rows={rows} onRemove={(id) => setRows((p) => p.filter((r) => r.productId !== id))} />
          </TabsContent>

          <TabsContent value="transfers">
            <div className="rounded-xl border border-border bg-card p-6 text-sm">
              <p className="font-medium">Branch and cluster transfers</p>
              <p className="mt-1 text-muted-foreground">
                Transfers keep their own in-transit state until the receiving branch confirms.
              </p>
              <Button asChild className="mt-4">
                <Link to="/transfers">Open transfers</Link>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function ReviewTable({ rows, onRemove }: { rows: CountRow[]; onRemove: (id: string) => void }) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nothing queued yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Sub-category</TableHead>
            <TableHead className="text-right">System</TableHead>
            <TableHead className="text-right">Counted</TableHead>
            <TableHead className="text-right">Delta</TableHead>
            <TableHead className="text-right">Unit cost</TableHead>
            <TableHead className="text-right">Impact</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const delta = r.counted - r.system;
            return (
              <TableRow key={r.productId}>
                <TableCell className="numeric">{r.sku || "—"}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.category || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.subCategory || "—"}</TableCell>
                <TableCell className="numeric text-right">{r.system}</TableCell>
                <TableCell className="numeric text-right">{r.counted}</TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant="outline"
                    className={`numeric ${
                      delta > 0
                        ? "border-success/40 text-success"
                        : delta < 0
                          ? "border-destructive/40 text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </Badge>
                </TableCell>
                <TableCell className="numeric text-right">{money(r.cost)}</TableCell>
                <TableCell className="numeric text-right">{money(delta * r.cost)}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => onRemove(r.productId)}>
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export const Route = createFileRoute("/stock-operations")({
  head: () => ({
    meta: [
      { title: "Stock Operations — Northwind POS" },
      {
        name: "description",
        content:
          "Barcode-driven physical stock counts, bulk spreadsheet imports and branch transfers with a PO-style review of every variance.",
      },
      { property: "og:title", content: "Stock Operations — Northwind POS" },
      { property: "og:description", content: "Scan, count and post stock adjustments with a full variance review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockOperationsPage,
});