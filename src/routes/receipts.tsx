import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, Gift, Printer, ReceiptText, Search, ScrollText, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { useUserPermissions } from "@/lib/pos-permissions";
import {
  printSaleReceipt,
  printShiftReport,
  saleReceiptPreview,
  shiftReportPreview,
} from "@/lib/pos-print";
import type { PaymentMethod, Sale } from "@/lib/pos-types";

export const Route = createFileRoute("/receipts")({
  head: () => ({
    meta: [
      { title: "Receipt History Log — Northwind POS" },
      {
        name: "description",
        content:
          "Browse every processed receipt and reprint it as a standard customer receipt, a gift receipt or an internal Z-report.",
      },
      { property: "og:title", content: "Receipt History Log — Northwind POS" },
      {
        property: "og:description",
        content: "Three receipt templates, one history log, native printing.",
      },
    ],
  }),
  component: ReceiptVault,
});

type Template = "standard" | "gift" | "zreport";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
  { value: "points", label: "Points" },
  { value: "bank_transfer", label: "Bank transfer" },
];

const TEMPLATES: { key: Template; label: string; icon: typeof Printer }[] = [
  { key: "standard", label: "Standard Customer Receipt", icon: ReceiptText },
  { key: "gift", label: "Gift Receipt", icon: Gift },
  { key: "zreport", label: "Z-Report Receipt", icon: ScrollText },
];

function ReceiptVault() {
  const { state, currentStore, refundSale, changeSalePayment } = usePos();
  const { user } = useAuth();
  const { requirePermission } = useUserPermissions();
  const [query, setQuery] = useState("");
  const [template, setTemplate] = useState<Template>("standard");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payReason, setPayReason] = useState("");

  // Employees only ever see the log of the store they are on duty at.
  const sales = useMemo(
    () => state.sales.filter((s) => s.storeId === currentStore.id),
    [state.sales, currentStore.id],
  );

  const rows = sales.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      s.receiptNo.toLowerCase().includes(q) ||
      s.cashier.toLowerCase().includes(q) ||
      s.lines.some((l) => l.name.toLowerCase().includes(q))
    );
  });

  const selected: Sale | null =
    rows.find((s) => s.id === selectedId) ?? rows[0] ?? null;
  const member = selected
    ? (state.members.find((m) => m.id === selected.memberId) ?? null)
    : null;
  const shift = selected ? (state.shifts.find((s) => s.id === selected.shiftId) ?? null) : null;

  const previewHtml = useMemo(() => {
    if (!selected) return "";
    if (template === "zreport")
      return shift ? shiftReportPreview(shift, state.sales) : "";
    return saleReceiptPreview(selected, template === "gift" ? null : member, template === "gift" ? "gift" : "sale");
  }, [selected, template, member, shift, state.sales]);

  function print() {
    if (!selected) return;
    if (template === "zreport") {
      if (!shift) {
        toast.error("No shift record linked to this receipt");
        return;
      }
      printShiftReport(shift, state.sales, "zreport");
    } else if (template === "gift") {
      printSaleReceipt(selected, null, "gift");
    } else {
      printSaleReceipt(selected, member, "sale");
    }
    toast.success("Sent to printer");
  }

  async function openCancel() {
    if (!selected) return;
    if (!(await requirePermission("can_process_refund"))) return;
    setCancelReason("");
    setCancelOpen(true);
  }

  function confirmCancel() {
    if (!selected) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      toast.error("Type why this bill is being cancelled");
      return;
    }
    refundSale(selected.id);
    logActivity(selected, reason);
    setCancelOpen(false);
    toast.success(`Bill ${selected.receiptNo} cancelled and stock returned`);
  }

  function logActivity(sale: Sale, reason: string) {
    logger.log("sale_event", "Bill cancelled", "receipts", {
      saleId: sale.id,
      receiptNo: sale.receiptNo,
      total: sale.total,
      reason,
      staff: user?.name ?? null,
    });
  }

  async function openPaymentFix() {
    if (!selected) return;
    if (!(await requirePermission("can_edit_tenders"))) return;
    setPayMethod(selected.method);
    setPayReason("");
    setPayOpen(true);
  }

  function confirmPaymentFix() {
    if (!selected) return;
    if (payMethod === selected.method) {
      setPayOpen(false);
      return;
    }
    changeSalePayment(selected.id, payMethod, payReason.trim() || undefined);
    setPayOpen(false);
    toast.success(`Bill ${selected.receiptNo} now recorded as ${payMethod.replace("_", " ")}`);
  }

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Receipt history log</h1>
            <p className="text-sm text-muted-foreground">
              Viewing data for {currentStore.name} only · signed in as {user?.name}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search receipt no, cashier or item"
              className="w-72 pl-9"
            />
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-border bg-card">
            <ScrollArea className="h-[calc(100vh-220px)]">
              <ul className="divide-y divide-border">
                {rows.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                        selected?.id === s.id ? "bg-surface-2" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="numeric text-sm font-semibold">{s.receiptNo}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(s.createdAt).toLocaleString()} · {s.cashier} ·{" "}
                          {s.lines.length} item{s.lines.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {s.method}
                      </Badge>
                      <span className="numeric w-20 text-right text-sm font-semibold">
                        {money(s.total)}
                      </span>
                      {s.refunded && (
                        <Badge variant="outline" className="border-destructive/50 text-destructive">
                          refunded
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
                {!rows.length && (
                  <li className="py-16 text-center text-sm text-muted-foreground">
                    No receipts recorded at this store yet.
                  </li>
                )}
              </ul>
            </ScrollArea>
          </section>

          <aside className="space-y-3">
            <div className="grid gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTemplate(t.key)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    template === t.key
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </button>
              ))}
            </div>

            <Button className="w-full" disabled={!selected} onClick={print}>
              <Printer className="size-4" /> Print this template
            </Button>

            <div className="overflow-hidden rounded-lg border border-border bg-white">
              {selected && previewHtml ? (
                <iframe
                  key={`${selected.id}-${template}`}
                  title="Receipt preview"
                  srcDoc={previewHtml}
                  className="h-[520px] w-full"
                />
              ) : (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  {selected
                    ? "No shift record linked to this receipt."
                    : "Select a receipt to preview it."}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
