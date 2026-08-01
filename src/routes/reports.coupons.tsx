import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/pos/AppShell";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination, usePagination } from "@/components/pos/TablePagination";
import { money, usePos } from "@/lib/pos-store";
import { useAuditLogs } from "@/lib/audit-log";
import {
  ReportHeader,
  StatCard,
  defaultRange,
  downloadCsv,
  inRange,
  stamp,
} from "@/components/pos/report-kit";

export const Route = createFileRoute("/reports/coupons")({
  head: () => ({
    meta: [
      { title: "Coupon Usage Report — Northwind POS" },
      {
        name: "description",
        content:
          "Track every coupon applied at the till: the code, whether it hit the whole bill or one item, the value taken off and the exact timestamp.",
      },
      { property: "og:title", content: "Coupon Usage Report — Northwind POS" },
      { property: "og:description", content: "Bill-level and item-level coupon audit trail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CouponReport,
});

type Row = {
  at: string;
  code: string;
  scope: string;
  target: string;
  value: number;
  receipt: string;
  staff: string;
  status: string;
};

function CouponReport() {
  const { state } = usePos();
  const logs = useAuditLogs();
  const init = defaultRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const rows = useMemo<Row[]>(() => {
    // Applications, removals and item-level hits come from the audit trail.
    const events: Row[] = logs
      .filter((l) => l.category === "promotion" && /coupon/i.test(l.action))
      .filter((l) => inRange(l.at, from, to))
      .map((l) => {
        const d = l.details as Record<string, unknown>;
        return {
          at: l.at,
          code: String(d.coupon ?? "—"),
          scope: String(d.scope ?? "bill"),
          target: String(d.product ?? "Whole bill"),
          value: Number(d.discountValue ?? 0),
          receipt: String(d.receiptNo ?? "—"),
          staff: l.staffName,
          status: /removed/i.test(l.action)
            ? "Removed"
            : /redeemed/i.test(l.action)
              ? "Redeemed"
              : "Applied",
        };
      });

    // Bills already stored with a coupon (covers history synced from cloud).
    const bills: Row[] = state.sales
      .filter((s) => s.couponCode && inRange(s.createdAt, from, to))
      .filter((s) => !events.some((e) => e.receipt === s.receiptNo && e.status === "Redeemed"))
      .map((s) => ({
        at: s.createdAt,
        code: s.couponCode!,
        scope: s.couponScope ?? "bill",
        target:
          s.couponScope === "item"
            ? (s.lines.find((l) => l.couponCode)?.name ?? "Item")
            : "Whole bill",
        value: s.couponDiscount ?? 0,
        receipt: s.receiptNo,
        staff: s.cashier,
        status: "Redeemed",
      }));

    return [...events, ...bills].sort((a, b) => b.at.localeCompare(a.at));
  }, [logs, state.sales, from, to]);

  const redeemed = rows.filter((r) => r.status === "Redeemed");
  const pager = usePagination(rows);

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <ReportHeader
          title="Coupon & Discount Usage"
          subtitle="Which coupon was used, on which bill or item, by whom and when."
          from={from}
          to={to}
          onFrom={setFrom}
          onTo={setTo}
          onExport={() =>
            downloadCsv("coupon-usage", [
              ["Time", "Coupon", "Scope", "Applied to", "Value", "Receipt", "Staff", "Status"],
              ...rows.map((r) => [
                stamp(r.at),
                r.code,
                r.scope,
                r.target,
                r.value,
                r.receipt,
                r.staff,
                r.status,
              ]),
            ])
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Coupon events" value={String(rows.length)} />
          <StatCard label="Coupons redeemed" value={String(redeemed.length)} />
          <StatCard
            label="Value given away"
            value={money(redeemed.reduce((a, r) => a + r.value, 0))}
          />
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Coupon</TableHead>
                <TableHead>Applied to</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageItems.map((r, i) => (
                <TableRow key={`${r.at}-${i}`}>
                  <TableCell className="numeric text-xs">{stamp(r.at)}</TableCell>
                  <TableCell className="font-medium">{r.code}</TableCell>
                  <TableCell>{r.target}</TableCell>
                  <TableCell className="capitalize">{r.scope}</TableCell>
                  <TableCell>{r.receipt}</TableCell>
                  <TableCell>{r.staff}</TableCell>
                  <TableCell className="numeric text-right">{money(r.value)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "Removed" ? "outline" : "secondary"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No coupons used in this date range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            page={pager.page}
            pageCount={pager.pageCount}
            pageSize={pager.pageSize}
            total={pager.total}
            from={pager.from}
            to={pager.to}
            label="coupon events"
            onPage={pager.setPage}
            onPageSize={pager.setPageSize}
          />
        </div>
      </div>
    </AppShell>
  );
}