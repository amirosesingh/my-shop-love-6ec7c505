import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Printer, Search, Ban, Check } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, usePos } from "@/lib/pos-store";
import { useUserPermissions } from "@/lib/pos-permissions";
import { bookingBalance, r2, type Booking, type PaymentMethod } from "@/lib/pos-types";
import { printBookingPayment, printBookingSlip, printSaleReceipt } from "@/lib/pos-print";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings & Pay Later — Northwind POS" },
      {
        name: "description",
        content:
          "Track reserved goods, take part payments, settle balances and hand over collected bookings.",
      },
      { property: "og:title", content: "Bookings & Pay Later — Northwind POS" },
      {
        property: "og:description",
        content: "Layaway tickets with deposits, due dates and balance collection.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingsPage,
});

const statusTone: Record<Booking["status"], string> = {
  active: "border-primary/40 text-primary",
  collected: "border-success/40 text-success",
  cancelled: "border-muted text-muted-foreground",
};

function BookingsPage() {
  const { state, currentStore, addBookingPayment, collectBooking, cancelBooking } = usePos();
  const { requirePermission } = useUserPermissions();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Booking["status"] | "all">("active");
  const [payFor, setPayFor] = useState<Booking | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [settle, setSettle] = useState(false);

  const bookings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.bookings
      .filter((b) => b.storeId === currentStore.id)
      .filter((b) => (tab === "all" ? true : b.status === tab))
      .filter(
        (b) =>
          !q ||
          b.ref.toLowerCase().includes(q) ||
          b.customerName.toLowerCase().includes(q) ||
          b.customerPhone.replace(/\s/g, "").includes(q.replace(/\s/g, "")),
      );
  }, [state.bookings, currentStore.id, tab, query]);

  const memberOf = (b: Booking) => state.members.find((m) => m.id === b.memberId) ?? null;
  const today = new Date().toISOString().slice(0, 10);

  function openPay(b: Booking, full: boolean) {
    setPayFor(b);
    setSettle(full);
    setAmount(bookingBalance(b).toFixed(2));
    setMethod("cash");
  }

  async function submitPayment() {
    if (!payFor) return;
    if (!(await requirePermission("can_process_sale"))) return;
    const value = r2(Number(amount || 0));
    const balance = bookingBalance(payFor);
    if (value <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    if (settle) {
      if (value < balance) {
        toast.error(`Collecting requires the full balance of ${money(balance)}`);
        return;
      }
      const done = collectBooking(payFor.id, value, method);
      if (!done) return;
      printSaleReceipt(done.sale, memberOf(payFor), "sale");
      toast.success(`Booking ${done.booking.ref} collected · bill ${done.sale.receiptNo}`);
    } else {
      if (value > balance) {
        toast.error("Part payment cannot exceed the outstanding balance");
        return;
      }
      const updated = addBookingPayment(payFor.id, value, method, payFor.cashier);
      if (!updated) return;
      printBookingPayment(updated, updated.payments[updated.payments.length - 1]);
      toast.success(`${money(value)} received · balance ${money(bookingBalance(updated))}`);
    }
    setPayFor(null);
  }

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <CalendarClock className="size-5 text-primary" /> Bookings &amp; pay later
            </h1>
            <p className="text-sm text-muted-foreground">
              Reserved goods at {currentStore.name}. Stock stays held until collection or
              cancellation.
            </p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ref, customer or phone…"
              className="pl-9"
            />
          </div>
        </header>

        <div className="flex gap-1">
          {(["active", "collected", "cancelled", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md border px-3 py-1.5 text-xs capitalize ${
                tab === t
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {bookings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No bookings here yet. Start one from the register with “Book &amp; pay later”.
          </p>
        ) : (
          <ul className="space-y-3">
            {bookings.map((b) => {
              const balance = bookingBalance(b);
              const overdue = b.status === "active" && b.dueDate < today;
              return (
                <li key={b.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-semibold">
                        {b.ref}
                        <Badge variant="outline" className={statusTone[b.status]}>
                          {b.status}
                        </Badge>
                        {overdue && (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            overdue
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {b.customerName}
                        {b.customerPhone ? ` · ${b.customerPhone}` : ""} · booked{" "}
                        {new Date(b.createdAt).toLocaleDateString()} · collect by{" "}
                        {new Date(b.dueDate).toDateString()}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {b.lines.map((l) => `${l.qty} × ${l.name}`).join(" · ")}
                      </p>
                      {b.note && <p className="mt-1 text-xs text-muted-foreground">{b.note}</p>}
                      {b.saleReceiptNo && (
                        <p className="mt-1 text-xs text-success">Billed as {b.saleReceiptNo}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="numeric text-lg font-bold">{money(b.total)}</p>
                      <p className="numeric text-xs text-muted-foreground">
                        paid {money(b.paid)}
                      </p>
                      <p className="numeric text-sm font-semibold text-primary">
                        balance {money(balance)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => printBookingSlip(b, memberOf(b), state.settings.payment)}
                    >
                      <Printer className="size-4" /> Slip
                    </Button>
                    {b.status === "active" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openPay(b, false)}>
                          Part payment
                        </Button>
                        <Button size="sm" onClick={() => openPay(b, true)}>
                          <Check className="size-4" /> Collect &amp; settle {money(balance)}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={async () => {
                            if (!(await requirePermission("can_void_item"))) return;
                            cancelBooking(b.id, "Cancelled at counter");
                            toast.success(`${b.ref} cancelled · stock released`);
                          }}
                        >
                          <Ban className="size-4" /> Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {settle ? "Collect & settle" : "Take part payment"} · {payFor?.ref}
            </DialogTitle>
          </DialogHeader>
          {payFor && (
            <div className="space-y-3">
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Booking total</span>
                  <span className="numeric">{money(payFor.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid so far</span>
                  <span className="numeric">{money(payFor.paid)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Balance due</span>
                  <span className="numeric text-primary">{money(bookingBalance(payFor))}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Amount received</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="numeric"
                />
              </div>
              <div className="space-y-1">
                <Label>Method</Label>
                <div className="flex overflow-hidden rounded-md border border-border">
                  {(["cash", "card", "wallet"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`flex-1 px-2 py-2 text-xs capitalize ${
                        method === m
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {settle && (
                <p className="text-xs text-muted-foreground">
                  Collecting raises the final bill, deducts the reserved stock and prints the sale
                  receipt.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitPayment()}>
              {settle ? "Collect & print bill" : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}