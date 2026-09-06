import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
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
import { money, usePos } from "@/lib/pos-store";
import {
  DEFAULT_BATCH_SIZE,
  IMPORT_HEADERS,
  describeOutcome,
  outcomeReportRows,
  planImport,
  type ImportOutcome,
  type ImportRow,
  type RejectedRow,
} from "@/lib/product-import";
import { clearRun, findUnfinished, saveRun, type ImportRun } from "@/lib/import-journal";

const TEMPLATE_ROWS = [
  ["8901234500011", "Colombian Whole Bean 1kg", 24, 14.5, "Coffee", 40, 2],
  ["8901234500028", "Ceramic Pour-Over Dripper", 18.5, 9.25, "Merch", 15, 1],
  ["8901234500035", "Cold Brew Concentrate 500ml", 9.75, 4.4, "Drinks", 60, 1],
];

/** Only this many rows are drawn in the preview; a big file must not freeze it. */
const PREVIEW_LIMIT = 100;

function templateSheet() {
  const ws = XLSX.utils.aoa_to_sheet([[...IMPORT_HEADERS], ...TEMPLATE_ROWS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return wb;
}

export function BulkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { state, currentStore, importProducts } = usePos();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [skipped, setSkipped] = useState<RejectedRow[]>([]);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [resume, setResume] = useState<ImportRun | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");

  const reset = useCallback(() => {
    setRows(null);
    setSkipped([]);
    setProgress(0);
    setProgressLabel("");
    setBusy("");
    setFileName("");
    setResume(null);
  }, []);

  function downloadTemplate(kind: "xlsx" | "csv") {
    XLSX.writeFile(templateSheet(), `inventory-import-template.${kind}`, { bookType: kind });
  }

  function downloadReport(o: ImportOutcome) {
    const ws = XLSX.utils.aoa_to_sheet(outcomeReportRows(o));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rows not imported");
    XLSX.writeFile(wb, `import-report-${o.importId.slice(0, 8)}.xlsx`);
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setBusy("reading");
    setRows(null);
    setSkipped([]);
    setOutcome(null);
    setProgress(4);
    setProgressLabel("Reading the file…");

    let records: Record<string, unknown>[] = [];
    try {
      const buf = await file.arrayBuffer();
      // Let the reading message paint before the parser takes the thread.
      await new Promise((r) => setTimeout(r, 0));
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    } catch {
      setBusy("");
      toast.error("Could not read that file — use the .xlsx or .csv template");
      return;
    }

    setProgress(60);
    setProgressLabel(`Checking ${records.length} rows…`);
    await new Promise((r) => setTimeout(r, 0));

    // One pass over the file, one pass over the catalogue — no per-row scans.
    const plan = planImport(records, state.products);

    setProgress(100);
    setBusy("");
    setSkipped(plan.skipped);
    setRows(plan.rows);
    setResume(findUnfinished(file.name, currentStore.id) ?? null);
    if (!plan.rows.length) toast.error("No usable product rows found in that file");
  }

  async function run(continueRun: ImportRun | null) {
    if (!rows?.length) return;
    const importId = continueRun?.importId ?? crypto.randomUUID();
    const startedAt = continueRun?.startedAt ?? new Date().toISOString();
    const done = new Set(continueRun?.done ?? []);
    const total = rows.length + skipped.length;

    setBusy("saving");
    setProgress(0);
    setProgressLabel(`Saving ${rows.length - done.size} products…`);

    const journal: ImportRun = {
      importId,
      fileName,
      storeId: currentStore.id,
      startedAt,
      updatedAt: startedAt,
      total,
      created: continueRun?.created ?? 0,
      restocked: continueRun?.restocked ?? 0,
      done: [...done],
      skipped,
      failed: [],
      pending: [],
    };
    saveRun(journal);

    const result = await importProducts(rows, {
      importId,
      batchSize: DEFAULT_BATCH_SIZE,
      alreadyDone: [...done],
      onProgress: (saved, count) => {
        const pct = Math.round((saved / Math.max(1, count)) * 100);
        setProgress(pct);
        setProgressLabel(`Saved ${saved} of ${count} products… ${pct}%`);
      },
      // Written down as each batch lands, so a crash never loses the trail.
      onBatchSaved: (keys, totals) => {
        journal.done.push(...keys);
        journal.created = (continueRun?.created ?? 0) + totals.created;
        journal.restocked = (continueRun?.restocked ?? 0) + totals.restocked;
        saveRun(journal);
      },
    });

    const finished: ImportOutcome = {
      importId,
      fileName,
      startedAt,
      finishedAt: new Date().toISOString(),
      total,
      created: journal.created,
      restocked: journal.restocked,
      skipped,
      failed: result.failed,
      pending: result.pending,
    };
    journal.failed = result.failed;
    journal.pending = result.pending;
    if (!result.failed.length && !result.pending.length) {
      journal.finishedAt = finished.finishedAt;
      saveRun(journal);
      clearRun(importId);
    } else {
      saveRun(journal);
    }

    setBusy("");
    setOutcome(finished);
    if (result.failed.length || result.pending.length) {
      toast.error(describeOutcome(finished));
    } else {
      toast.success(describeOutcome(finished));
    }
  }

  const preview = rows?.slice(0, PREVIEW_LIMIT) ?? [];

  return (
    <>
      <Dialog
        open={open && !outcome}
        onOpenChange={(o) => {
          if (busy) return; // never close mid-save
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

          {!rows && !busy && (
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
                  Download Excel template (.xlsx)
                </button>
                <button
                  onClick={() => downloadTemplate("csv")}
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Download CSV template
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Expected headers: {IMPORT_HEADERS.join(" · ")}
              </p>
            </>
          )}

          {busy && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-success">
                <FileSpreadsheet className="size-4" /> {progressLabel}
              </p>
              <Progress value={progress} className="h-2 [&>div]:bg-success" />
              <p className="text-[11px] text-muted-foreground">
                Keep this window open — progress is written down as it goes, so an interruption
                never loses what was already saved.
              </p>
            </div>
          )}

          {rows && !busy && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {fileName} · {rows.length} rows ready
                {skipped.length ? ` · ${skipped.length} rows cannot be imported` : ""}
              </p>

              {resume && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                  An earlier run of this file stopped after {resume.done.length} rows. Continue and
                  only the remaining {Math.max(0, rows.length - resume.done.length)} are saved —
                  nothing is created twice.
                </div>
              )}

              {skipped.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {skipped.slice(0, 4).map((e) => (
                    <p key={e.line}>
                      Row {e.line}: {e.reason}
                    </p>
                  ))}
                  {skipped.length > 4 && <p>+{skipped.length - 4} more — full list in the report</p>}
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
                    {preview.map((r) => (
                      <TableRow key={`${r.key}-${r.line}`}>
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
              {rows.length > PREVIEW_LIMIT && (
                <p className="text-[11px] text-muted-foreground">
                  Showing the first {PREVIEW_LIMIT} of {rows.length} rows. All of them are imported.
                </p>
              )}

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={reset}>
                  Choose another file
                </Button>
                <Button
                  className="bg-success text-background hover:bg-success/90"
                  disabled={!rows.length}
                  onClick={() => void run(resume)}
                >
                  <Download className="size-4" />
                  {resume ? "Continue import" : `Import ${rows.length} items`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import result — every row accounted for */}
      <Dialog
        open={!!outcome}
        onOpenChange={(o) => {
          if (!o) {
            setOutcome(null);
            reset();
            onOpenChange(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import result</DialogTitle>
          </DialogHeader>
          {outcome && (
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4" />
                {describeOutcome(outcome)}
              </p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="numeric">Rows in the file: {outcome.total}</li>
                <li className="numeric">New products created: {outcome.created}</li>
                <li className="numeric">Existing products restocked: {outcome.restocked}</li>
                <li className="numeric">Skipped: {outcome.skipped.length}</li>
                <li className="numeric">Failed: {outcome.failed.length}</li>
                <li className="numeric">Still pending: {outcome.pending.length}</li>
              </ul>

              {(outcome.failed.length > 0 || outcome.pending.length > 0) && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p className="flex items-center gap-1 font-semibold">
                    <AlertTriangle className="size-3.5" /> Not saved
                  </p>
                  {[...outcome.failed, ...outcome.pending].slice(0, 8).map((e) => (
                    <p key={`${e.line}-${e.reason}`}>
                      Row {e.line} ({e.barcode}): {e.reason}
                    </p>
                  ))}
                  {outcome.failed.length + outcome.pending.length > 8 && (
                    <p>+{outcome.failed.length + outcome.pending.length - 8} more in the report</p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {outcome.skipped.length + outcome.failed.length + outcome.pending.length > 0 && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => downloadReport(outcome)}
                  >
                    <RotateCcw className="size-4" /> Download row report
                  </Button>
                )}
                <Button
                  className="flex-1"
                  onClick={() => {
                    setOutcome(null);
                    reset();
                    onOpenChange(false);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
