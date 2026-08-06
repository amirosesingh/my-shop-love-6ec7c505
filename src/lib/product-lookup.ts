/**
 * One place that answers "which product is this code?".
 *
 * A delivery can arrive with a different barcode for an item we already
 * stock, so every product carries a list of alias barcodes alongside its
 * primary one. Scanning any of them — or the SKU — resolves to the same
 * product.
 */
import type { Product } from "./pos-types";

export const normaliseCode = (code: string) => code.trim().toLowerCase();

/** Every code that resolves to this product. */
export const productCodes = (p: Product) =>
  [p.barcode, p.sku, ...(p.barcodes ?? [])].filter(Boolean).map(normaliseCode);

export function resolveByBarcode(products: Product[], code: string): Product | undefined {
  const needle = normaliseCode(code);
  if (!needle) return undefined;
  return products.find((p) => productCodes(p).includes(needle));
}

/** True when the code is already used by another product. */
export function codeTakenBy(products: Product[], code: string, exceptId?: string) {
  const needle = normaliseCode(code);
  return products.find((p) => p.id !== exceptId && productCodes(p).includes(needle));
}

/** Products that look like the scanned item, for the "already exists?" hint. */
export function suggestSimilar(products: Product[], name: string, limit = 5): Product[] {
  const needle = name.trim().toLowerCase();
  if (needle.length < 3) return [];
  return products
    .filter((p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase()))
    .slice(0, limit);
}
