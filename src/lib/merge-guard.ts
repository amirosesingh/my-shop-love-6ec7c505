/**
 * Safety net for the product merge utility.
 *
 * Folding two records together rewrites stock and barcodes, so it must never
 * happen while either record is still promised to a customer: an open booking,
 * a parked (held) ticket, or a purchase order line that has not been received.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import type { Booking, Product } from "@/core/types/pos-types";
import type { HeldOrder } from "./held-orders";

export type MergeBlock = { productId: string; name: string; reason: string };

/** Every product id a booking still points at. */
const bookingProductIds = (b: Booking) =>
  [
    ...b.lines.map((l) => l.productId),
    ...(b.charges ?? []).map((c) => c.productId),
    b.stringProductId,
    b.gripProductId,
  ].filter(Boolean) as string[];

/**
 * Checks the selected records against open work. Local state covers bookings
 * and held tickets; unreceived purchase order lines are read from the database
 * and simply skipped when it cannot be reached.
 */
export async function findMergeBlocks(
  products: Product[],
  bookings: Booking[],
  held: HeldOrder[],
): Promise<MergeBlock[]> {
  const ids = products.map((p) => p.id);
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const blocks: MergeBlock[] = [];

  for (const booking of bookings) {
    if (booking.status !== "active") continue;
    for (const id of bookingProductIds(booking)) {
      if (ids.includes(id))
        blocks.push({ productId: id, name: nameOf(id), reason: `open booking ${booking.ref}` });
    }
  }

  for (const ticket of held) {
    for (const line of ticket.lines) {
      if (ids.includes(line.productId))
        blocks.push({
          productId: line.productId,
          name: nameOf(line.productId),
          reason: `held ticket ${ticket.label}`,
        });
    }
  }

  try {
    const { data, error } = await supabaseExternal
      .from("purchase_order_items")
      .select("product_id,quantity_received,po_id")
      .in("product_id", ids)
      .eq("quantity_received", 0);
    if (!error) {
      for (const row of data ?? []) {
        const id = row.product_id as string | null;
        if (!id) continue;
        blocks.push({
          productId: id,
          name: nameOf(id),
          reason: `purchase order ${String(row.po_id).slice(0, 8)} not received yet`,
        });
      }
    }
  } catch {
    /* offline — local checks above still apply */
  }

  // one line per product/reason pair
  const seen = new Set<string>();
  return blocks.filter((b) => {
    const key = `${b.productId}|${b.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
