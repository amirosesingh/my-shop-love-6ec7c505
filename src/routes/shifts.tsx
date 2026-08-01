import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Printer, RotateCcw, Vault } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { useUserPermissions } from "@/lib/pos-permissions";
import { openCashDrawer, printSaleReceipt, printShiftReport } from "@/lib/pos-print";

export const Route = createFileRoute("/shifts")({
  head: () => ({
    meta: [
      { title: "Shifts & Sales — Northwind POS" },
      {
        name: "description",
        content:
          "Open and close cashier shifts, count the drawer, print X and Z reports and reprint or refund any receipt.",
      },
      { property: "og:title", content: "Shifts & Sales — Northwind POS" },
      { property: "og:description", content: "Shift control, drawer counts and X/Z reports." },
    ],
  }),
  component: Shifts,
});

function Shifts() {
  const { state, activeShift, openShift, closeShift, refundSale, currentStore, stores } = usePos();
  const { user, isAdmin } = useAuth();
  const { requirePermission } = useUserPermissions();
  const [cashier, setCashier] = useState(user?.name ?? "Cashier");
  const [float, setFloat] = useState("150");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);

  const storeSales = state.sales.filter((s) => s.storeId === currentStore.id);
  const storeShifts = state.shifts.filter((s) => s.storeId === currentStore.id);
  const shiftSales = activeShift
    ? storeSales.filter((s) => s.shiftId === activeShift.id && !s.refunded)
    : [];
  const cashTaken = shiftSales.filter((s) => s.method === "cash").reduce((a, s) => a + s.total, 0);
  const expected = (activeShift?.openingFloat ?? 0) + cashTaken;

  const storeIndex = stores.findIndex((s) => s.id === currentStore.id);
  const storeLabel = `Store ${storeIndex + 1}`;

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              Shifts &amp; receipts · {currentStore.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Drawer control, X / Z reports and full sales history
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              if (await requirePermission("can_open_drawer")) openCashDrawer();
            }}
          >
            <Vault className="size-4" /> Open drawer
          </Button>
        </header>

        {!isAdmin && (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
            Viewing data for {storeLabel} Only
          </div>
        )}

        {isAdmin && (
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Aggregated multi-store statistics</h2>
            <div className="grid gap-4 md:grid-cols-4">
              {stores.map((st, i) => {
                const sales = state.sales.filter((s) => s.storeId === st.id && !s.refunded);
                return (
                  <Metric
                    key={st.id}
                    label={`Store ${i + 1} · ${st.name} (${sales.length} sales)`}
                    value={money(sales.reduce((a, s) => a + s.total, 0))}
                  />
                );
              })}
              <Metric
                label="Company-wide revenue"
                value={money(
                  state.sales.filter((s) => !s.refunded).reduce((a, s) => a + s.total, 0),
                )}
                highlight
              />
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-5">
          {activeShift ? (
            <div className="grid gap-4 md:grid-cols-4">
              <Metric label="Cashier" value={activeShift.cashier} />
              <Metric
                label="Opened"
                value={new Date(activeShift.openedAt).toLocaleTimeString()}
              />
              <Metric label="Transactions" value={String(shiftSales.length)} />
              <Metric label="Expected drawer" value={money(expected)} highlight />
              <div className="md:col-span-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => printShiftReport(activeShift, storeSales, "xreport")}
                >
                  <Printer className="size-4" /> Print X report
                </Button>
                <Button
                  onClick={async () => {
                    if (!(await requirePermission("can_close_drawer"))) return;
                    setCounted(expected.toFixed(2));
                    setCloseOpen(true);
                  }}
                >
                  Close shift
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cashier</Label>
                <Input value={cashier} onChange={(e) => setCashier(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Opening float</Label>
                <Input
                  className="numeric w-32"
                  value={float}
                  onChange={(e) => setFloat(e.target.value)}
                />
              </div>
              <Button
                onClick={async () => {
                  if (!(await requirePermission("can_open_drawer"))) return;
                  openShift(cashier || "Cashier", Number(float) || 0);
                  openCashDrawer();
                  toast.success("Shift opened");
                }}
              >
                Open shift
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="px-5 py-3 text-sm font-semibold">Receipts</h2>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Reprint</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storeSales.map((s) => {
                const member = state.members.find((m) => m.id === s.memberId) ?? null;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="numeric">
                      {s.receiptNo}
                      {s.refunded && (
                        <Badge variant="outline" className="ml-2 border-destructive/50 text-destructive">
                          refunded
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{s.cashier}</TableCell>
                    <TableCell className="uppercase text-muted-foreground">{s.method}</TableCell>
                    <TableCell className="numeric text-right">{money(s.total)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => printSaleReceipt(s, member, "duplicate")}
                        >
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => printSaleReceipt(s, member, "gift")}
                        >
                          Gift
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={s.refunded}
                          onClick={async () => {
                            if (!(await requirePermission("can_process_refund"))) return;
                            refundSale(s.id);
                            printSaleReceipt(s, member, "refund");
                            openCashDrawer();
                            toast.success(`${s.receiptNo} refunded`);
                          }}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!storeSales.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No sales recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="px-5 py-3 text-sm font-semibold">Shift history</h2>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cashier</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="text-right">Float</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Z report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storeShifts.map((sh) => (
                <TableRow key={sh.id}>
                  <TableCell>{sh.cashier}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(sh.openedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sh.closedAt ? new Date(sh.closedAt).toLocaleString() : "open"}
                  </TableCell>
                  <TableCell className="numeric text-right">{money(sh.openingFloat)}</TableCell>
                  <TableCell className="numeric text-right">
                    {sh.countedCash === null ? "—" : money(sh.countedCash)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => printShiftReport(sh, storeSales, "zreport")}
                    >
                      <Printer className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!storeShifts.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No shifts yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close shift &amp; count drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="numeric text-sm text-muted-foreground">
              Expected in drawer: {money(expected)}
            </p>
            <div className="space-y-1">
              <Label>Counted cash</Label>
              <Input
                className="numeric h-12 text-xl"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </div>
            <p className="numeric text-sm">
              Variance {money(Number(counted || 0) - expected)}
            </p>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const closed = closeShift(Number(counted || 0), note);
                if (closed) {
                  printShiftReport(closed, storeSales, "zreport");
                  openCashDrawer();
                  toast.success("Shift closed · Z report printed");
                }
                setCloseOpen(false);
                setNote("");
              }}
            >
              Close &amp; print Z
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
    <div className="rounded-md bg-surface-2 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`numeric text-lg font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}