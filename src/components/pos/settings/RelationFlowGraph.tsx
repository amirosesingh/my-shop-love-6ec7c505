import type { TableRelationHealth } from "@/lib/db-relations";

/** Fixed layout so the diagram reads the same on every run. */
const POS: Record<string, { x: number; y: number }> = {
  membership_tiers: { x: 10, y: 20 },
  members: { x: 10, y: 100 },
  coupon_campaigns: { x: 10, y: 180 },
  issued_vouchers: { x: 10, y: 260 },
  suppliers: { x: 10, y: 340 },
  sales: { x: 230, y: 40 },
  bookings: { x: 230, y: 130 },
  payment_transactions: { x: 230, y: 210 },
  purchase_orders: { x: 230, y: 300 },
  stock_transfers: { x: 230, y: 380 },
  sale_items: { x: 450, y: 40 },
  booking_payments: { x: 450, y: 130 },
  purchase_order_items: { x: 450, y: 300 },
  stock_transfer_items: { x: 450, y: 380 },
  stock_adjustments: { x: 450, y: 455 },
  promotions: { x: 670, y: 40 },
  products: { x: 670, y: 180 },
  product_barcodes: { x: 670, y: 260 },
  product_categories: { x: 670, y: 340 },
  item_activity_logs: { x: 670, y: 440 },
};

const W = 150;
const H = 34;

type EdgeKind = "healthy" | "missing" | "orphan";

const EDGE_CLASS: Record<EdgeKind, string> = {
  healthy: "stroke-emerald-500",
  missing: "stroke-amber-500",
  orphan: "stroke-destructive",
};

/** Non-auth operational tables and how they connect, coloured by integrity. */
export function RelationFlowGraph({ tables }: { tables: TableRelationHealth[] }) {
  const nodes = tables.filter((t) => POS[t.table]);
  const drawn = new Set(nodes.map((n) => n.table));

  const edges = nodes.flatMap((t) =>
    t.links
      .filter((l) => POS[l.parent] && l.parent !== t.table)
      .map((l) => ({
        from: t.table,
        to: l.parent,
        kind: (!l.declared ? "missing" : (l.orphans ?? 0) > 0 ? "orphan" : "healthy") as EdgeKind,
        label: l.label,
      })),
  );

  const nodeFill = (status: TableRelationHealth["status"]) =>
    status === "healthy"
      ? "fill-emerald-500/10 stroke-emerald-500/60"
      : status === "missing-fk"
        ? "fill-amber-500/10 stroke-amber-500/60"
        : "fill-destructive/10 stroke-destructive/60";

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card p-2">
      <svg viewBox="0 0 840 510" className="h-[420px] w-full min-w-[640px]" role="img"
        aria-label="Diagram of how the operational tables connect">
        {edges.map((e, i) => {
          const a = POS[e.from]!;
          const b = POS[e.to]!;
          const x1 = a.x + W / 2;
          const y1 = a.y + H / 2;
          const x2 = b.x + W / 2;
          const y2 = b.y + H / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={`${e.from}-${e.to}-${i}`}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              strokeWidth={e.kind === "healthy" ? 1.2 : 2}
              strokeDasharray={e.kind === "missing" ? "5 4" : undefined}
              className={`${EDGE_CLASS[e.kind]} opacity-70`}
            >
              <title>{`${e.label} — ${
                e.kind === "healthy" ? "linked" : e.kind === "missing" ? "no foreign key" : "orphan rows"
              }`}</title>
            </path>
          );
        })}

        {nodes.map((t) => {
          const p = POS[t.table]!;
          return (
            <g key={t.table}>
              <rect
                x={p.x}
                y={p.y}
                width={W}
                height={H}
                rx={6}
                className={nodeFill(t.status)}
                strokeWidth={1}
              />
              <text
                x={p.x + 8}
                y={p.y + 14}
                className="fill-foreground text-[10px] font-medium"
                style={{ fontSize: 10 }}
              >
                {t.label}
              </text>
              <text
                x={p.x + 8}
                y={p.y + 26}
                className="fill-muted-foreground"
                style={{ fontSize: 9 }}
              >
                {t.rows} rows
              </text>
            </g>
          );
        })}

        {[...drawn].length === 0 && (
          <text x={20} y={40} className="fill-muted-foreground" style={{ fontSize: 12 }}>
            Run the check to draw the table map.
          </text>
        )}
      </svg>

      <div className="flex flex-wrap gap-4 px-2 pb-1 pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-emerald-500" /> Linked and clean
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 border-t-2 border-dashed border-amber-500" /> No foreign key
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-destructive" /> Orphan records
        </span>
      </div>
    </div>
  );
}