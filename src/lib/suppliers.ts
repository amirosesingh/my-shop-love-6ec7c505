/**
 * Supplier directory.
 *
 * Suppliers live centrally so every branch receives goods against the same
 * list. Reads go straight to the database; writes go through the offline
 * outbox like every other POS write, so receiving keeps working with no
 * connection.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { enqueue } from "./sync-outbox";
import { drainOutbox } from "./sync-engine";

const sb = supabaseExternal as unknown as SupabaseClient;

export type Supplier = {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  notes?: string;
  active: boolean;
  createdAt?: string;
};

type Row = Record<string, any>;

const toSupplier = (r: Row): Supplier => ({
  id: r.id,
  name: r.name ?? "",
  contactName: r.contact_name ?? "",
  phone: r.phone ?? "",
  email: r.email ?? "",
  address: r.address ?? "",
  taxNumber: r.tax_number ?? "",
  notes: r.notes ?? "",
  active: r.is_active ?? true,
  createdAt: r.created_at ?? undefined,
});

const toRow = (s: Supplier): Row => ({
  id: s.id,
  name: s.name,
  contact_name: s.contactName || null,
  phone: s.phone || null,
  email: s.email || null,
  address: s.address || null,
  tax_number: s.taxNumber || null,
  notes: s.notes || null,
  is_active: s.active,
});

const CACHE_KEY = "pos.suppliers.v1";

function cache(list: Supplier[]) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* storage full — the database still holds the list */
  }
}

export function cachedSuppliers(): Supplier[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "[]") as Supplier[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Central list, newest first. Falls back to the offline cache. */
export async function loadSuppliers(): Promise<Supplier[]> {
  const res = await sb.from("suppliers").select("*").order("name");
  if (res.error) return cachedSuppliers();
  const list = ((res.data as Row[] | null) ?? []).map(toSupplier);
  cache(list);
  return list;
}

export function saveSupplier(s: Supplier) {
  const list = cachedSuppliers();
  cache([...list.filter((x) => x.id !== s.id), s].sort((a, b) => a.name.localeCompare(b.name)));
  enqueue("Saving supplier", { kind: "upsert", table: "suppliers", rows: [toRow(s)] });
  void drainOutbox();
}

export function deleteSupplier(id: string) {
  cache(cachedSuppliers().filter((x) => x.id !== id));
  enqueue("Deleting supplier", { kind: "delete", table: "suppliers", match: { id } });
  void drainOutbox();
}

export const newSupplier = (name = ""): Supplier => ({
  id: crypto.randomUUID(),
  name,
  active: true,
});
