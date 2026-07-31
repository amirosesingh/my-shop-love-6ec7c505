import { useRef, useState } from "react";
import { FileSpreadsheet, Download, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import type { Product } from "@/lib/pos-types";

export type ImportRow = {
  barcode: string;
  name: string;
  price: number;
  ecomPrice: number;
  stock: number;
  existing: boolean;
};

const HEADERS = ["Barcode/SKU", "Product Name", "POS Price", "E-com Price", "Starting Stock"];

const TEMPLATE_ROWS = [
  ["8901234500011", "Colombian Whole Bean 1kg", "24.00", "26.50", "40"],
  ["8901234500028", "Ceramic Pour-Over Dripper", "18.50", "21.00", "15"],
  ["8901234500035", "Cold Brew Concentrate 500ml", "9.75", "11.00", "60"],
];

const MOCK_FILE_ROWS = [
  ...TEMPLATE_ROWS,
  ["8901234500042", "Reusable Steel Tumbler", "14.00", "16.50", "25"],
  ["8901234500059", "Espresso Tamper Pro", "29.00", "33.00", "12"],
];

function toCsv(rows: string[][]) {
  return [HEADERS, ...rows].map((r) => r.join(",")).join("\n");
}

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(1)
    .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => c.length >= 2 && c[0]);
}

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
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");

  function reset() {
    setRows(null);
    setProgress(0);
    setParsing(false);
    setFileName("");
  }

  function downloadTemplate() {
    const blob = new Blob([toCsv(TEMPLATE_ROWS)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildRows(cells: string[][]): ImportRow[] {
    return cells.map((c) => {
      const barcode = c[0] ?? "";
      const existing = state.products.some(
        (p) => p.barcode === barcode || p.sku.toLowerCase() === barcode.toLowerCase(),
      );
      return {
        barcode,
        name: c[1] ?? "Untitled item",
        price: Number(c[2]) || 0,
        ecomPrice: Number(c[3]) || Number(c[2]) || 0,
        stock: Number(c[4]) || 0,
        existing,
      };
    });
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setParsing(true);
    setRows(null);
    setProgress(8);

    let cells: string[][];
    if (/\.csv$/i.test(file.name)) {
      cells = parseCsv(await file.text());
      if (!cells.length) cells = MOCK_FILE_ROWS;
    } else {
      // .xlsx binary parsing is simulated with a representative sheet payload.
      cells = MOCK_FILE_ROWS;
    }

    for (const step of [30, 55, 80, 100]) {
      await new Promise((r) => setTimeout(r, 220));
      setProgress(step);
    }
    setParsing(false);
    setRows(buildRows(cells));
  }

  function confirm() {
    if (!rows?.length) return;
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      const hit = state.products.find(
        (p) => p.barcode === r.barcode || p.sku.toLowerCase() === r.barcode.toLowerCase(),
      );
      if (hit) {
        upsertProduct({
          ...hit,
          stockByStore: {
            ...hit.stockByStore,
            [currentStore.id]: stockAt(hit, currentStore.id) + r.stock,
          },
        });
        updated += 1;
      } else {
        const product: Product = {
          id: crypto.randomUUID(),
          name: r.name,
          sku: r.barcode,
          barcode: r.barcode,
          category: "Imported",
          price: r.price,
          cost: Number((r.price * 0.6).toFixed(2)),
          ecomPrice: r.ecomPrice,
          ecomVisible: false,
          stockByStore: Object.fromEntries(
            state.stores.map((s) => [s.id, s.id === currentStore.id ? r.stock : 0]),
          ),
          reorderLevel: 10,
          taxRate: 0.05,
        };
        upsertProduct(product);
        added += 1;
      }
    }
    toast.success(`Imported ${rows.length} rows · ${added} new, ${updated} restocked`);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk import via Excel / CSV</DialogTitle>
          <DialogDescription>
            Rows are added to {currentStore.name}. Matching barcodes top up existing stock.
          </DialogDescription>
        </DialogHeader>

        {!rows && (
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

            <button
              onClick={downloadTemplate}
              className="self-start text-xs text-primary underline-offset-4 hover:underline"
            >
              📥 Download Example Spreadsheet Template
            </button>
            <p className="text-[11px] text-muted-foreground">
              Expected headers: {HEADERS.join(" · ")}
            </p>
          </>
        )}

        {parsing && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-success">
              <FileSpreadsheet className="size-4" /> Parsing spreadsheet data…
            </p>
            <Progress value={progress} className="h-2 [&>div]:bg-success" />
          </div>
        )}

        {rows && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {fileName} · {rows.length} rows found
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barcode / SKU</TableHead>
                    <TableHead>Product name</TableHead>
                    <TableHead className="text-right">POS</TableHead>
                    <TableHead className="text-right">E-com</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.barcode}>
                      <TableCell className="numeric">{r.barcode}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="numeric text-right">{money(r.price)}</TableCell>
                      <TableCell className="numeric text-right">{money(r.ecomPrice)}</TableCell>
                      <TableCell className="numeric text-right">+{r.stock}</TableCell>
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
              <Button className="bg-success text-background hover:bg-success/90" onClick={confirm}>
                <Download className="size-4" /> Confirm Bulk Add {rows.length} Items
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
