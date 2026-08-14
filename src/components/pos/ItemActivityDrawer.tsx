/**
 * Item activity: when the record was created, every stock movement recorded
 * against it, and the transfer lines it appeared on. Read-only history.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { money } from "@/lib/pos-store";
import type { Product } from "@/lib/pos-types";

type Movement = {
  id: string;
  at: string;
  kind: string;
  detail: string;
  delta: number;
  impact: number;
  by: string;
};

export function ItemActivityDrawer({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    let live = true;
    setLoading(true);
    setRows([]);
    void (async () => {
      const [adjustments, transfers, meta, merges] = await Promise.all([
        supabaseExternal
          .from("stock_adjustments")
          .select("id,created_at,reason,note,delta,cost_impact,staff_name,store_id")
          .eq("product_id", product.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabaseExternal
          .from("stock_transfer_items")
          .select("id,created_at,quantity,quantity_received,transfer_id")
          .eq("product_id", product.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseExternal
          .from("products")
          .select("created_at,updated_at")
          .eq("id", product.id)
          .maybeSingle(),
        supabaseExternal
          .from("audit_logs")
          .select("id,created_at,user_name,details,action_name")
          .eq("action_name", "Products merged")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (!live) return;
      const list: Movement[] = [
        ...(adjustments.data ?? []).map((r) => ({
          id: `adj-${r.id}`,
          at: r.created_at,
          kind: "Stock adjustment",
          detail: `${String(r.reason).replace(/_/g, " ")}${r.note ? ` — ${r.note}` : ""}${
            r.store_id ? ` · ${r.store_id}` : ""
          }`,
          delta: Number(r.delta ?? 0),
          impact: Number(r.cost_impact ?? 0),
          by: r.staff_name ?? "—",
        })),
        ...(transfers.data ?? []).map((r) => ({
          id: `trf-${r.id}`,
          at: r.created_at,
          kind: "Transfer line",
          detail: `Transfer ${String(r.transfer_id).slice(0, 8)} · received ${r.quantity_received ?? 0}`,
          delta: Number(r.quantity ?? 0),
          impact: 0,
          by: "—",
        })),
        ...(merges.data ?? [])
          .filter((r) => {
            const d = (r.details ?? {}) as {
              masterId?: string;
              merged?: { id?: string }[];
            };
            return (
              d.masterId === product.id || (d.merged ?? []).some((m) => m?.id === product.id)
            );
          })
          .map((r) => {
            const d = (r.details ?? {}) as {
              masterId?: string;
              merged?: { name?: string; barcode?: string }[];
              aliasBarcodes?: string[];
            };
            return {
              id: `mrg-${r.id}`,
              at: r.created_at,
              kind: "Products merged",
              detail:
                d.masterId === product.id
                  ? `Folded in ${(d.merged ?? []).map((m) => m?.name).filter(Boolean).join(", ") || "—"} · barcodes ${(d.aliasBarcodes ?? []).join(", ") || "—"}`
                  : "This record was folded into another product",
              delta: 0,
              impact: 0,
              by: r.user_name ?? "—",
            };
          }),
      ].sort((a, b) => b.at.localeCompare(a.at));
      setRows(list);
      setCreated((meta.data?.created_at as string | undefined) ?? null);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [product?.id]);

  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Activity · {product?.name}</SheetTitle>
        </SheetHeader>
        {product && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="numeric text-xs text-muted-foreground">
                {product.sku} · {product.barcode}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Created {created ? new Date(created).toLocaleString() : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {product.category}
                {product.subCategory ? ` › ${product.subCategory}` : ""}
              </p>
            </div>

            {loading ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading history…
              </p>
            ) : rows.length ? (
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.kind}</span>
                      <Badge
                        variant="outline"
                        className={`numeric ${
                          r.delta > 0
                            ? "border-success/40 text-success"
                            : r.delta < 0
                              ? "border-destructive/40 text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {r.delta > 0 ? `+${r.delta}` : r.delta}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.detail}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(r.at).toLocaleString()} · {r.by}
                      {r.impact ? ` · ${money(r.impact)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No movements recorded for this item yet.</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}