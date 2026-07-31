import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CreditCard,
  Minus,
  Plus,
  Printer,
  Search,
  Trash2,
  Wallet,
  Gift,
  Vault,
  Lock,
  Info,
  UserPlus,
  X,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cartTotals, money, stockAt, usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import type { CartLine, DiscountType, PaymentMethod, Sale } from "@/lib/pos-types";
import { lineUnitDiscount, r2 } from "@/lib/pos-types";
import { openCashDrawer, printSaleReceipt } from "@/lib/pos-print";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Register — Northwind POS" },
      {
        name: "description",
        content:
          "Ring up sales, attach members, take cash or card payments, open the drawer and print thermal receipts.",
      },
      { property: "og:title", content: "Register — Northwind POS" },
      { property: "og:description", content: "Fast touch checkout with receipts and members." },
    ],
  }),
  component: Register,
});

function Register() {
  const { state, activeShift, recordSale, openShift, currentStore } = usePos();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [cartDiscountType, setCartDiscountType] = useState<DiscountType>("amount");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [billQuery, setBillQuery] = useState("");
  const [billHit, setBillHit] = useState<Sale | null>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [exchangeRef, setExchangeRef] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [float, setFloat] = useState("150");
  const [cashier, setCashier] = useState(user?.name ?? "Cashier");
  const [tendered, setTendered] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(state.products.map((p) => p.category)))],
    [state.products],
  );

  const filtered = state.products.filter((p) => {
    const q = query.trim().toLowerCase();
    const match =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q);
    return match && (category === "All" || p.category === category);
  });

  const member = state.members.find((m) => m.id === memberId) ?? null;
  const totals = cartTotals(lines, cartDiscount, cartDiscountType);
  const balanceDue = totals.total >= 0 ? totals.total : 0;
  const refundDue = totals.total < 0 ? r2(-totals.total) : 0;
  const detail = state.products.find((p) => p.id === detailId) ?? null;

  const memberMatches = memberQuery.trim()
    ? state.members
        .filter((m) => {
          const q = memberQuery.trim().toLowerCase();
          return (
            m.name.toLowerCase().includes(q) ||
            m.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
            m.code.toLowerCase().includes(q)
          );
        })
        .slice(0, 5)
    : [];

  function addLine(productId: string) {
    if (!activeShift) {
      toast.error("Open a shift before ringing up a sale");
      setOpenShiftOpen(true);
      return;
    }
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;
    const onHand = stockAt(product, currentStore.id);
    if (onHand <= 0) {
      toast.error(`${product.name} is out of stock at ${currentStore.name}`);
      return;
    }
    setLines((ls) => {
      const found = ls.find((l) => l.productId === productId && !l.credit);
      if (found)
        return ls.map((l) =>
          l.productId === productId && !l.credit ? { ...l, qty: l.qty + 1 } : l,
        );
      return [
        ...ls,
        {
          productId,
          name: product.name,
          price: product.price,
          qty: 1,
          taxRate: product.taxRate,
          discount: 0,
          discountType: "amount",
        },
      ];
    });
  }

  function setQty(index: number, delta: number) {
    setLines((ls) =>
      ls
        .map((l, i) => (i === index ? { ...l, qty: l.credit ? l.qty - delta : l.qty + delta } : l))
        .filter((l) => (l.credit ? l.qty < 0 : l.qty > 0)),
    );
  }

  function patchLine(index: number, patch: Partial<CartLine>) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function clearCart() {
    setLines([]);
    setCartDiscount(0);
    setExchangeRef(null);
  }

  function lookupBill() {
    const ref = billQuery.trim().toLowerCase();
    const hit =
      state.sales.find((s) => s.receiptNo.toLowerCase() === ref) ??
      state.sales.find((s) => s.receiptNo.toLowerCase().includes(ref) && !!ref) ??
      null;
    setBillHit(hit);
    setPicks({});
    if (!hit) toast.error(`No bill found for “${billQuery}”`);
  }

  function addExchangeCredits() {
    if (!billHit) return;
    if (!activeShift) {
      toast.error("Open a shift before processing an exchange");
      return;
    }
    const credits: CartLine[] = Object.entries(picks)
      .filter(([, qty]) => qty > 0)
      .map(([idx, qty]) => {
        const src = billHit.lines[Number(idx)];
        return {
          productId: src.productId,
          name: src.name,
          price: r2(src.price - lineUnitDiscount(src)),
          qty: -qty,
          taxRate: src.taxRate,
          discount: 0,
          discountType: "amount" as DiscountType,
          credit: true,
        };
      });
    if (!credits.length) {
      toast.error("Select at least one item to exchange");
      return;
    }
    setLines((ls) => [...credits, ...ls]);
    setExchangeRef(billHit.receiptNo);
    setExchangeOpen(false);
    setBillQuery("");
    setBillHit(null);
    setPicks({});
    toast.success(`Credits from ${billHit.receiptNo} added to the ticket`);
  }

  function scanSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeShift) {
      toast.error("Open a shift before ringing up a sale");
      setOpenShiftOpen(true);
      return;
    }
    const hit = state.products.find(
      (p) => p.barcode === query.trim() || p.sku.toLowerCase() === query.trim().toLowerCase(),
    );
    if (hit) {
      addLine(hit.id);
      setQuery("");
    }
  }

  function completeSale() {
    if (!activeShift) {
      toast.error("Open a shift before taking payment");
      return;
    }
    const isRefund = totals.total < 0;
    const paid = isRefund ? totals.total : method === "cash" ? Number(tendered || 0) : totals.total;
    if (!isRefund && method === "cash" && paid < totals.total) {
      toast.error("Tendered amount is less than the total");
      return;
    }
    if (!isRefund && method === "points" && (member?.points ?? 0) < totals.total * 100) {
      toast.error("Not enough points on this member");
      return;
    }
    const sale = recordSale({
      storeId: currentStore.id,
      shiftId: activeShift.id,
      lines,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      paid,
      change: r2(Math.max(0, paid - totals.total)),
      method,
      memberId,
      pointsEarned: member ? Math.max(0, Math.round(totals.total)) : 0,
      cashier: activeShift.cashier,
      ...(exchangeRef
        ? { exchangeOfReceiptNo: exchangeRef, exchangeCredit: totals.credit }
        : {}),
    });
    if (method === "cash") openCashDrawer();
    printSaleReceipt(sale, member, "sale");
    setLastSale(sale);
    clearCart();
    setMemberId(null);
    setTendered("");
    setPayOpen(false);
    toast.success(
      exchangeRef
        ? `Exchange ${sale.receiptNo} completed against ${exchangeRef}`
        : `Sale ${sale.receiptNo} completed`,
    );
  }

  return (
    <AppShell>
      <div className="flex h-screen flex-col lg:flex-row">
        {/* Catalog */}
        <section className="flex min-h-0 flex-1 flex-col p-4">
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={scanSubmit} className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan barcode or search products…"
                className="h-11 pl-9 numeric"
              />
            </form>
            <Button variant="outline" className="h-11" onClick={() => openCashDrawer()}>
              <Vault className="size-4" /> Open drawer
            </Button>
            {!activeShift && (
              <Button className="h-11" onClick={() => setOpenShiftOpen(true)}>
                Open shift
              </Button>
            )}
          </div>

          {!activeShift && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <Lock className="size-4" />
              <span>
                Selling is locked at {currentStore.name}. Open a shift to ring up sales.
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  category === c
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <ScrollArea className="mt-4 min-h-0 flex-1 pr-2">
            <div className="grid grid-cols-2 gap-3 pb-6 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => (
                <div key={p.id} className="relative">
                <button
                  onClick={() => addLine(p.id)}
                  disabled={!activeShift}
                  className="group flex h-full w-full flex-col justify-between rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card"
                >
                  <span className="pr-6 text-sm font-medium leading-snug">{p.name}</span>
                  <span className="mt-2 flex items-center justify-between">
                    <span className="numeric text-base font-semibold text-primary">
                      {money(p.price)}
                    </span>
                    <span
                      className={`numeric text-[11px] ${
                        stockAt(p, currentStore.id) <= p.reorderLevel
                          ? "text-warning"
                          : "text-muted-foreground"
                      }`}
                    >
                      {stockAt(p, currentStore.id)} left
                    </span>
                  </span>
                </button>
                <button
                  aria-label={`Stock across stores for ${p.name}`}
                  onClick={() => setDetailId(p.id)}
                  className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  <Info className="size-3.5" />
                </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                  No products match “{query}”.
                </p>
              )}
            </div>
          </ScrollArea>
        </section>

        {/* Ticket */}
        <aside className="flex w-full shrink-0 flex-col border-l border-border bg-sidebar lg:w-[380px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Current ticket</p>
              <p className="numeric text-[11px] text-muted-foreground">
                {activeShift ? `${activeShift.cashier} · shift open` : "No shift open"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!lines.length}
              onClick={() => setLines([])}
            >
              <Trash2 className="size-4" /> Clear
            </Button>
          </div>

          <div className="border-b border-border px-4 py-3">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Search loyalty member
            </Label>
            {member ? (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-3 py-2">
                <BadgeCheck className="size-4 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="numeric text-[11px] text-muted-foreground">
                    {member.code} · {member.tier} · {member.points} pts · {member.phone}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Detach member"
                  onClick={() => setMemberId(null)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Phone number or name…"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <div className="mt-2 space-y-1">
                  {memberMatches.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{m.name}</p>
                        <p className="numeric text-[11px] text-muted-foreground">
                          {m.phone} · {m.points} pts · {m.tier}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          setMemberId(m.id);
                          setMemberQuery("");
                          toast.success(`${m.name} attached to receipt`);
                        }}
                      >
                        <UserPlus className="size-3" /> Attach
                      </Button>
                    </div>
                  ))}
                  {memberQuery.trim() && !memberMatches.length && (
                    <p className="py-1 text-[11px] text-muted-foreground">
                      No member matches “{memberQuery}”.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="divide-y divide-border">
              {lines.map((l) => (
                <div key={l.productId} className="flex items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="numeric text-[11px] text-muted-foreground">
                      {money(l.price)} · tax {(l.taxRate * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="size-7" onClick={() => setQty(l.productId, -1)}>
                      <Minus className="size-3" />
                    </Button>
                    <span className="numeric w-6 text-center text-sm">{l.qty}</span>
                    <Button size="icon" variant="outline" className="size-7" onClick={() => setQty(l.productId, 1)}>
                      <Plus className="size-3" />
                    </Button>
                  </div>
                  <span className="numeric w-16 text-right text-sm font-semibold">
                    {money(l.price * l.qty)}
                  </span>
                </div>
              ))}
              {!lines.length && (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Tap a product to start the ticket.
                </p>
              )}
            </div>
          </ScrollArea>

          <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
            <Row label="Subtotal" value={money(totals.subtotal)} />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discount</span>
              <Input
                value={cartDiscount || ""}
                onChange={(e) => setCartDiscount(Number(e.target.value) || 0)}
                placeholder="0.00"
                className="numeric h-8 w-24 text-right"
              />
            </div>
            <Row label="Tax" value={money(totals.tax)} />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Total</span>
              <span className="numeric text-2xl font-bold text-primary">{money(totals.total)}</span>
            </div>
            <Button
              className="mt-1 h-12 w-full text-base"
              disabled={!lines.length || !activeShift}
              onClick={() => {
                setTendered(totals.total.toFixed(2));
                setPayOpen(true);
              }}
            >
              {activeShift ? `Charge ${money(totals.total)}` : "Shift closed — selling locked"}
            </Button>
            {lastSale && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    printSaleReceipt(
                      lastSale,
                      state.members.find((m) => m.id === lastSale.memberId) ?? null,
                      "duplicate",
                    )
                  }
                >
                  <Printer className="size-4" /> Reprint
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printSaleReceipt(lastSale, null, "gift")}
                >
                  <Gift className="size-4" /> Gift
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printSaleReceipt(lastSale, null, "kitchen")}
                >
                  Kitchen
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Cross-store stock */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <p className="numeric text-xs text-muted-foreground">
                {detail.sku} · {detail.barcode} · {money(detail.price)}
              </p>
              <Separator />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Stock across all locations
              </p>
              <div className="space-y-1">
                {state.stores.map((s) => {
                  const qty = stockAt(detail, s.id);
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                        s.id === currentStore.id ? "border-primary/50 bg-primary/10" : "border-border"
                      }`}
                    >
                      <span>
                        {s.name}{" "}
                        <span className="text-[11px] text-muted-foreground">({s.code})</span>
                      </span>
                      <span
                        className={`numeric font-semibold ${
                          qty <= 0
                            ? "text-destructive"
                            : qty <= detail.reorderLevel
                              ? "text-warning"
                              : "text-foreground"
                        }`}
                      >
                        {qty}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Stock counts are shared company-wide. Financial metrics stay locked to{" "}
                {currentStore.name}.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take payment · {money(totals.total)}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { m: "cash", icon: Banknote, label: "Cash" },
                { m: "card", icon: CreditCard, label: "Card" },
                { m: "wallet", icon: Wallet, label: "Wallet" },
                { m: "points", icon: BadgeCheck, label: "Points" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.m}
                onClick={() => setMethod(opt.m)}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs transition-colors ${
                  method === opt.m
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <opt.icon className="size-4" />
                {opt.label}
              </button>
            ))}
          </div>

          {method === "cash" && (
            <div className="space-y-2">
              <Label>Cash tendered</Label>
              <Input
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                className="numeric h-12 text-xl"
              />
              <div className="flex gap-2">
                {[totals.total, 20, 50, 100].map((v, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => setTendered(v.toFixed(2))}
                  >
                    {money(v)}
                  </Button>
                ))}
              </div>
              <p className="numeric text-sm text-muted-foreground">
                Change due {money(Math.max(0, Number(tendered || 0) - totals.total))}
              </p>
            </div>
          )}
          {method === "points" && (
            <p className="text-sm text-muted-foreground">
              {member
                ? `${member.name} has ${member.points} points (100 pts = $1).`
                : "Attach a member to pay with points."}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button onClick={completeSale}>Complete &amp; print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open shift */}
      <Dialog open={openShiftOpen} onOpenChange={setOpenShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Cashier</Label>
              <Input value={cashier} onChange={(e) => setCashier(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Opening float</Label>
              <Input
                value={float}
                onChange={(e) => setFloat(e.target.value)}
                className="numeric"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                openShift(cashier || "Cashier", Number(float) || 0);
                openCashDrawer();
                setOpenShiftOpen(false);
                toast.success("Shift opened");
              }}
            >
              Open shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="numeric">{value}</span>
    </div>
  );
}