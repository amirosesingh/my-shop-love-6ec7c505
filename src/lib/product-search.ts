/**
 * Catalogue search for stock paperwork.
 *
 * The transfer and receiving screens must work in a shop that carries tens of
 * thousands of items, so they never scan the whole catalogue in the browser.
 * This asks the database for a small, indexed, capped result set instead, and
 * falls back to whatever the till already holds locally when the query cannot
 * be answered (offline, relay down, local-first desktop).
 */
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { rowToProduct } from "./pos-db";
import type { Product } from "./pos-types";

export type CatalogSearch = {
  products: Product[];
  /** True when the rows came from the database rather than local state. */
  remote: boolean;
};

/** PostgREST `or=` needs commas and parentheses out of the way. */
const escape = (term: string) => term.replace(/[(),*]/g, " ").trim();

/** Match a term against everything a user might type or scan. */
export function matchesTerm(product: Product, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  const fields = [
    product.name,
    product.barcode,
    product.sku,
    product.category,
    product.subCategory,
    product.group,
    ...(product.barcodes ?? []),
    ...(product.variants ?? []).map((v) => v?.code),
  ];
  return fields.some((v) => (v ? String(v).toLowerCase().includes(n) : false));
}

/** Local filter used as the offline fallback and for exact-scan resolution. */
export function searchLocal(products: Product[], term: string, limit = 25): Product[] {
  const needle = term.trim().toLowerCase();
  const pool = needle ? products.filter((p) => matchesTerm(p, needle)) : products;
  return pool.slice(0, limit);
}

/** An exact code hit — what a barcode scanner should add without a click. */
export function exactCodeMatch(products: Product[], code: string): Product | undefined {
  const c = code.trim().toLowerCase();
  if (!c) return undefined;
  return products.find(
    (p) =>
      p.barcode?.toLowerCase() === c ||
      p.sku?.toLowerCase() === c ||
      (p.barcodes ?? []).some((b) => String(b ?? "").toLowerCase() === c) ||
      (p.variants ?? []).some((v) => String(v?.code ?? "").toLowerCase() === c),
  );
}

/**
 * Indexed, capped catalogue query. Never throws: a failed query simply means
 * the caller keeps using its local list.
 */
export async function searchCatalog(
  term: string,
  fallback: Product[],
  limit = 25,
): Promise<CatalogSearch> {
  const needle = escape(term);
  if (!needle) return { products: fallback.slice(0, limit), remote: false };
  try {
    const like = `%${needle}%`;
    const res = await supabase
      .from("products")
      .select("*")
      .is("deleted_at", null)
      .or(
        [
          `name.ilike.${like}`,
          `barcode.ilike.${like}`,
          `sku.ilike.${like}`,
          `category.ilike.${like}`,
        ].join(","),
      )
      .order("name")
      .limit(limit);
    if (res.error || !res.data) return { products: searchLocal(fallback, term, limit), remote: false };
    const rows = res.data.map((r) => rowToProduct(r as Record<string, unknown>));
    // A scanned alias barcode lives in a JSON column, so top the result up
    // from local state when the indexed columns found nothing.
    if (!rows.length) return { products: searchLocal(fallback, term, limit), remote: false };
    return { products: rows.filter((p) => !p.archived), remote: true };
  } catch {
    return { products: searchLocal(fallback, term, limit), remote: false };
  }
}
