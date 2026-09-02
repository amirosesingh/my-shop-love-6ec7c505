import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { nextSku, readSkuSettings } from "@/lib/sku";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, stockAt, usePos } from "@/lib/pos-store";
import { resolveByBarcode } from "@/lib/product-lookup";
import type { Product } from "@/core/types/pos-types";

export type ImportRow = {
  barcode: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  stock: number;
  customPoints: number;
  existing: boolean;
};

type ErrorRow = { row: number; reason: string };

const HEADERS = [
  "barcode",
  "name",
  "price",
  "cost",
  "category",
  "stock_quantity",
  "custom_points",
] as const;

const TEMPLATE_ROWS = [
  ["8901234500011", "Colombian Whole Bean 1kg", 24, 14.5, "Coffee", 40, 2],
  ["8901234500028", "Ceramic Pour-Over Dripper", 18.5, 9.25, "Merch", 15, 1],
  ["8901234500035", "Cold Brew Concentrate 500ml", 9.75, 4.4, "Drinks", 60, 1],
];

function templateSheet() {
  const ws = XLSX.utils.aoa_to_sheet([[...HEADERS], ...TEMPLATE_ROWS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return wb;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function BulkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { state, currentStore, upsertProduct } = usePos();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [summary, setSummary] = useState<{ added: number; updated: number; errors: ErrorRow[] } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");

  function reset() {
    setRows(null);
    setErrors([]);
    setProgress(0);
    setProgressLabel("");
    setParsing(false);
    setFileName("");
  }

  function downloadTemplate(kind: "xlsx" | "csv") {
    const wb = templateSheet();
    XLSX.writeFile(wb, `inventory-import-template.${kind}`, { bookType: kind });
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setParsing(true);
    setRows(null);
    setErrors([]);
    setSummary(null);
    setProgress(2);
    setProgressLabel("Reading file…");

    let records: Record<string, unknown>[] = [];
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    } catch {
      setParsing(false);
      toast.error("Could not read that file — use the .xlsx or .csv template");
      return;
    }

    const parsed: ImportRow[] = [];
    const bad: ErrorRow[] = [];
    const total = records.length || 1;

    for (let i = 0; i < records.length; i++) {
      const raw = records[i];
      const key = (k: string) =>
        Object.entries(raw).find(([h]) => h.trim().toLowerCase().replace(/\s+/g, "_") === k)?.[1];
      const barcode = String(key("barcode") ?? key("sku") ?? "").trim();
      const name = String(key("name") ?? "").trim();
      if (!barcode || !name) {
        bad.push({ row: i + 2, reason: !barcode ? "Missing barcode" : "Missing product name" });
      } else {
        const price = num(key("price"));
        parsed.push({
          barcode,
          name,
          price,
          cost: num(key("cost")) || Number((price * 0.6).toFixed(2)),
          category: String(key("category") ?? "Imported").trim() || "Imported",
          stock: Math.round(num(key("stock_quantity"))),
          customPoints: num(key("custom_points")),
          existing: !!resolveByBarcode(state.products, barcode),
        });
      }
      const pct = Math.round(((i + 1) / total) * 100);
      setProgress(pct);
      setProgressLabel(`Importing row ${i + 1} of ${records.length}… ${pct}% complete`);
      // yield to the browser so the progress bar paints live
      if (i % 5 === 0) await new Promise((r) => setTimeout(r, 12));
    }

    setParsing(false);
    setErrors(bad);
    setRows(parsed);
    if (!parsed.length) toast.error("No valid product rows found in that file");
  }

  function confirm() {
    if (!rows?.length) return;
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      const hit = resolveByBarcode(state.products, r.barcode);
      if (hit) {
        upsertProduct({
          ...hit,
          stockByStore: {
            ...hit.stockByStore,
            [currentStore.id]: stockAt(hit, currentStore.id) + r.stock,
          },
          customPoints: r.customPoints || hit.customPoints,
        });
        updated += 1;
      } else {
        const product: Product = {
          id: crypto.randomUUID(),
          name: r.name,
          sku:
            readSkuSettings().mode === "auto"
              ? nextSku(state.products.map((p) => p.sku))
              : r.barcode,
          barcode: r.barcode,
          category: r.category,
          price: r.price,
          cost: r.cost,
          ecomPrice: r.price,
          ecomVisible: false,
          stockByStore: Object.fromEntries(
            state.stores.map((s) => [s.id, s.id === currentStore.id ? r.stock : 0]),
          ),
          reorderLevel: 10,
          taxRate: 0.05,
          customPoints: r.customPoints,
        };
        upsertProduct(product);
        added += 1;
      }
    }
    setSummary({ added, updated, errors });
    toast.success(`Imported ${rows.length} rows · ${added} new, ${updated} restocked`);
  }

  return (
    <>
      <Dialog
        open={open && !summary}
        onOpenChange={(o) => {
          if (!o) reset();
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk import from Excel / CSV</DialogTitle>
            <DialogDescription>
              Rows are added to {currentStore.name}. Matching barcodes top up existing stock.
            </DialogDescription>
          </DialogHeader>

          {!rows && !parsing && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                  dragging ? "border-success bg-success/10" : "border-border bg-surface-2"
                }`}
              >
                <UploadCloud className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Drag &amp; Drop your Store Inventory spreadsheet (.xlsx, .csv) here
                </p>
                <p className="text-xs text-muted-foreground">or click to browse your files</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => downloadTemplate("xlsx")}
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  📥 Download Excel template (.xlsx)
                </button>
                <button
                  onClick={() => downloadTemplate("csv")}
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  📥 Download CSV template
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Expected headers: {HEADERS.join(" · ")}
              </p>
            </>
          )}

          {parsing && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-success">
                <FileSpreadsheet className="size-4" /> {progressLabel || "Parsing spreadsheet data…"}
              </p>
              <Progress value={progress} className="h-2 [&>div]:bg-success" />
            </div>
          )}

          {rows && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {fileName} · {rows.length} valid rows
                {errors.length ? ` · ${errors.length} rows with errors` : ""}
              </p>
              {errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {errors.slice(0, 4).map((e) => (
                    <p key={e.row}>
                      Row {e.row}: {e.reason}
                    </p>
                  ))}
                  {errors.length > 4 && <p>+{errors.length - 4} more…</p>}
                </div>
              )}
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Barcode / SKU</TableHead>
                      <TableHead>Product name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Pts</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={`${r.barcode}-${i}`}>
                        <TableCell className="numeric">{r.barcode}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.category}</TableCell>
                        <TableCell className="numeric text-right">{money(r.price)}</TableCell>
                        <TableCell className="numeric text-right">{money(r.cost)}</TableCell>
                        <TableCell className="numeric text-right">+{r.stock}</TableCell>
                        <TableCell className="numeric text-right">{r.customPoints}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {r.existing ? "restock" : "new item"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={reset}>
                  Choose another file
                </Button>
                <Button
                  className="bg-success text-background hover:bg-success/90"
                  disabled={!rows.length}
                  onClick={confirm}
                >
                  <Download className="size-4" /> Confirm Bulk Add {rows.length} Items
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import summary */}
      <Dialog
        open={!!summary}
        onOpenChange={(o) => {
          if (!o) {
            setSummary(null);
            reset();
            onOpenChange(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import summary</DialogTitle>
          </DialogHeader>
          {summary && (
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4" />
                {summary.added + summary.updated} records inserted successfully
              </p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="numeric">New products created: {summary.added}</li>
                <li className="numeric">Existing products restocked: {summary.updated}</li>
                <li className="numeric">Error rows skipped: {summary.errors.length}</li>
              </ul>
              {summary.errors.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p className="flex items-center gap-1 font-semibold">
                    <AlertTriangle className="size-3.5" /> Rows not imported
                  </p>
                  {summary.errors.map((e) => (
                    <p key={e.row}>
                      Row {e.row}: {e.reason}
                    </p>
                  ))}
                </div>
              )}
              <Button
                className="w-full"
                onClick={() => {
                  setSummary(null);
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
