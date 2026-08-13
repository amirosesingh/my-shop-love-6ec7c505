import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  Printer,
  Search,
  Ban,
  Check,
  Tag,
  Wrench,
  Banknote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { ActionButton } from "@/components/pos/ActionButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BOOKING_TIMING_LABELS, bookingRulesOf } from "@/lib/pos-types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, usePos } from "@/lib/pos-store";
import { useUserPermissions } from "@/lib/pos-permissions";
import {
  bookingBalance,
  racketSummary,
  r2,
  JOB_STATUS_FLOW,
  JOB_STATUS_LABELS,
  type Booking,
  type JobStatus,
  type PaymentMethod,
} from "@/lib/pos-types";
import {
  printBookingPayment,
  printBookingSlip,
  printJobTag,
  printSaleReceipt,
} from "@/lib/pos-print";

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

const jobTone: Record<JobStatus, string> = {
  received: "border-muted text-muted-foreground",
  strung: "border-primary/40 text-primary",
  ready: "border-success/40 text-success",
  collected: "border-success/40 text-success",
};

function BookingsPage() {
  const {
    state,
    currentStore,
    addBookingPayment,
    collectBooking,
    cancelBooking,
    deleteBooking,
    setBookingJobStatus,
  } = usePos();
  const { requirePermission } = useUserPermissions();
  const { user, can } = useAuth();
  const rules = bookingRulesOf(state.settings.integrations.bookingRules);
  const isSupervisor = user?.role === "admin" || can("can_access_pos_settings");
  /** Cancelling can be reserved for supervisors by the branch rules. */
  const guardCancel = async () => {
    if (rules.managerOnlyCancel && !isSupervisor) {
      toast.error("Only a supervisor may cancel a booking");
      return false;
    }
    return requirePermission("can_cancel_booking");
  };
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Booking["status"] | "all">("active");
  /** Extra lens over the racket workflow, on top of the booking status. */
  const [jobFilter, setJobFilter] = useState<JobStatus | "all" | "jobs">("all");
  const [payFor, setPayFor] = useState<Booking | null>(null);
  const [removing, setRemoving] = useState<Booking | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [settle, setSettle] = useState(false);

  const bookings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.bookings
      .filter((b) => b.storeId === currentStore.id)
      .filter((b) => (tab === "all" ? true : b.status === tab))
      .filter((b) =>
        jobFilter === "all"
          ? true
          : jobFilter === "jobs"
            ? !!b.job
            : (b.jobStatus ?? "received") === jobFilter && !!b.job,
      )
      .filter(
        (b) =>
          !q ||
          b.ref.toLowerCase().includes(q) ||
          b.customerName.toLowerCase().includes(q) ||
          b.customerPhone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
          (b.job?.racketModel ?? "").toLowerCase().includes(q) ||
          (b.job?.stringType ?? "").toLowerCase().includes(q),
      );
  }, [state.bookings, currentStore.id, tab, query, jobFilter]);

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
    if (!(await requirePermission("can_collect_booking"))) return;
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
      const done = await collectBooking(payFor.id, value, method);
      if (!done) return;
      printSaleReceipt(done.sale, memberOf(payFor), "sale");
      toast.success(`Booking ${done.booking.ref} collected · bill ${done.sale.receiptNo}`);
    } else {
      if (value > balance) {
        toast.error("Part payment cannot exceed the outstanding balance");
        return;
      }
      const updated = await addBookingPayment(payFor.id, value, method, payFor.cashier);
      if (!updated) return;
      printBookingPayment(updated, updated.payments[updated.payments.length - 1]);
      toast.success(`${money(value)} received · balance ${money(bookingBalance(updated))}`);
    }
    setPayFor(null);
  }

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        <header className="grid grid-cols-[minmax(0,1fr)] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <CalendarClock className="size-5 shrink-0 text-primary" />
              <span className="truncate">Bookings, jobs &amp; pay later</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Reserved goods and racket stringing jobs at {currentStore.name}. Stock stays held
              until collection or cancellation.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ref, customer, phone, racket…"
              className="pl-9"
            />
          </div>
        </header>

        <div className="flex flex-wrap gap-1">
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

        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Wrench className="size-3.5" /> Job cards
          </span>
          {(["all", "jobs", ...JOB_STATUS_FLOW] as const).map((f) => (
            <button
              key={f}
              onClick={() => setJobFilter(f)}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                jobFilter === f
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "Everything" : f === "jobs" ? "String jobs" : JOB_STATUS_LABELS[f]}
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
              const job = b.job;
              const jobStatus = (b.jobStatus ?? "received") as JobStatus;
              const hasJob =
                !!job &&
                !!(job.racketModel || job.stringType || job.tensionMain || job.promisedAt);
              return (
                 <li key={b.id} className="rounded-lg border border-border p-4">
                   <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        {b.ref}
                        <Badge variant="outline" className={statusTone[b.status]}>
                          {b.status}
                        </Badge>
                        {overdue && (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            overdue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {b.customerName}
                        {b.customerPhone ? ` · ${b.customerPhone}` : ""} · booked{" "}
                        {new Date(b.createdAt).toLocaleDateString()} · collect by{" "}
                        {new Date(b.dueDate).toDateString()}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {b.lines.map((l) => `${l.qty} × ${l.name}`).join(" · ")}
                      </p>
                      {b.serviceName && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {b.serviceName}
                          {b.serviceFee ? ` · service fee ${b.serviceFee.toFixed(2)}` : ""}
                          {b.paymentTiming ? ` · ${BOOKING_TIMING_LABELS[b.paymentTiming]}` : ""}
                        </p>
                      )}
                      {hasJob && (
                        <div className="mt-2 rounded-md border border-border/70 bg-muted/30 p-2 text-xs">
                          <p className="flex flex-wrap items-center gap-2 font-medium">
                            <Wrench className="size-3.5 shrink-0 text-primary" />
                            <span className="min-w-0 truncate">
                              {racketSummary(job) || "String job"}
                            </span>
                            <Badge variant="outline" className={jobTone[jobStatus]}>
                              {JOB_STATUS_LABELS[jobStatus]}
                            </Badge>
                          </p>
                          {job?.promisedAt && (
                            <p className="mt-1 text-muted-foreground">
                              Ready by {new Date(job.promisedAt).toLocaleString()}
                              {job.droppedOffAt
                                ? ` · dropped off ${new Date(job.droppedOffAt).toLocaleDateString()}`
                                : ""}
                            </p>
                          )}
                          {(job?.grommetNotes || job?.jobNotes) && (
                            <p className="mt-1 text-muted-foreground">
                              {[job?.grommetNotes, job?.jobNotes].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {b.jobStatusBy && b.jobStatusAt && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {JOB_STATUS_LABELS[jobStatus]} by {b.jobStatusBy} ·{" "}
                              {new Date(b.jobStatusAt).toLocaleString()}
                            </p>
                          )}
                          {job?.notifyWhatsApp && (
                            <p className="mt-1 text-[11px] text-primary">
                              Customer wants a WhatsApp when it is ready.
                            </p>
                          )}
                        </div>
                      )}
                      {b.note && <p className="mt-1 text-xs text-muted-foreground">{b.note}</p>}
                      {b.saleReceiptNo && (
                        <p className="mt-1 text-xs text-success">Billed as {b.saleReceiptNo}</p>
                      )}
                    </div>
                    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:min-w-56 sm:max-w-full sm:items-end">
                      <div className="text-right">
                        <p className="numeric text-lg font-bold">{money(b.total)}</p>
                        <p className="numeric text-xs text-muted-foreground">
                          paid {money(b.paid)}
                        </p>
                        <p className="numeric text-sm font-semibold text-primary">
                          balance {money(balance)}
                        </p>
                      </div>

                      {hasJob && b.status === "active" && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {JOB_STATUS_FLOW.map((s) => (
                            <button
                              key={s}
                              onClick={() => {
                                setBookingJobStatus(b.id, s, b.cashier || "Counter");
                                toast.success(`${b.ref} · ${JOB_STATUS_LABELS[s].toLowerCase()}`);
                              }}
                              className={`rounded-md border px-2 py-1 text-[11px] ${
                                jobStatus === s
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {JOB_STATUS_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
                        <ActionButton
                          size="sm"
                          variant="outline"
                          layout="inline"
                          label="Print slip"
                          icon={<Printer className="size-4" />}
                          onClick={() => printBookingSlip(b, memberOf(b), state.settings.payment)}
                        />
                        {hasJob && (
                          <ActionButton
                            size="sm"
                            variant="outline"
                            layout="inline"
                            label="Job tag"
                            icon={<Tag className="size-4" />}
                            onClick={() => printJobTag(b)}
                          />
                        )}
                        {b.status === "active" && (
                          <>
                            <ActionButton
                              size="sm"
                              variant="outline"
                              layout="inline"
                              label="Part payment"
                              icon={<Banknote className="size-4" />}
                              onClick={() => openPay(b, false)}
                            />
                            <ActionButton
                              size="sm"
                              layout="inline"
                              label={`Collect ${money(balance)}`}
                              icon={<Check className="size-4" />}
                              onClick={() => openPay(b, true)}
                            />
                            <ActionButton
                              size="sm"
                              variant="ghost"
                              layout="inline"
                              label="Cancel"
                              icon={<Ban className="size-4" />}
                              className="text-destructive"
                              onClick={async () => {
                                if (!(await requirePermission("can_cancel_booking"))) return;
                                cancelBooking(b.id, "Cancelled at counter");
                                toast.success(`${b.ref} cancelled · stock released`);
                              }}
                            />
                          </>
                        )}
                        <ActionButton
                          size="sm"
                          variant="ghost"
                          layout="inline"
                          label="Delete job"
                          icon={<Trash2 className="size-4" />}
                          className="text-destructive"
                          onClick={async () => {
                            if (!(await requirePermission("can_cancel_booking"))) return;
                            setRemoving(b);
                            setRemoveReason(
                              b.status === "active" && jobStatus !== "collected"
                                ? ""
                                : "Job completed and collected",
                            );
                          }}
                        />
                      </div>
                    </div>
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

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {removing?.ref}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This removes the booking and its job card for good. Tell us why so it stays on the
              activity trail.
            </p>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input
                autoFocus
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                placeholder="Job collected / booked by mistake / duplicate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={removeReason.trim().length < 3}
              onClick={async () => {
                const target = removing;
                if (!target) return;
                setRemoving(null);
                await deleteBooking(target.id, removeReason.trim());
                toast.success(`${target.ref} deleted`);
                setRemoveReason("");
              }}
            >
              Delete job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}