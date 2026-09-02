/**
 * Payment collection types the till offers at checkout.
 *
 * The list lives in the central database so an administrator can add, rename,
 * reorder, disable or delete a tender without a new build. Every terminal
 * keeps the last good copy on disk, so a network drop never leaves a cashier
 * without payment buttons — and historical bills keep their stored method code
 * even after a type is removed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { describeError } from "@/lib/notify";

const sb = supabaseExternal as unknown as SupabaseClient;
const CACHE_KEY = "pos.payment-types.v1";

export type PaymentType = {
  id: string;
  name: string;
  /** stable code stored on every sale and ledger row */
  code: string;
  /** the cashier must type a serial / slip / voucher number for this tender */
  requiresReference: boolean;
  active: boolean;
  /** lucide icon name */
  icon: string;
  sort: number;
  /** built-in tenders the register has dedicated behaviour for */
  system: boolean;
};

export type PaymentTypeResult = { success: boolean; error?: string };

/** Shipped defaults, used before the first load and when the line is down. */
export const FALLBACK_PAYMENT_TYPES: PaymentType[] = [
  { id: "seed-cash", name: "Cash", code: "cash", requiresReference: false, active: true, icon: "Banknote", sort: 10, system: true },
  { id: "seed-card", name: "Card", code: "card", requiresReference: false, active: true, icon: "CreditCard", sort: 20, system: true },
  { id: "seed-wallet", name: "Wallet", code: "wallet", requiresReference: false, active: true, icon: "Wallet", sort: 30, system: true },
  { id: "seed-points", name: "Points", code: "points", requiresReference: false, active: true, icon: "Star", sort: 40, system: true },
  { id: "seed-transfer", name: "Bank transfer", code: "bank_transfer", requiresReference: true, active: true, icon: "Landmark", sort: 50, system: true },
];

type Row = Record<string, any>;

const toType = (r: Row): PaymentType => ({
  id: String(r.id),
  name: r.name ?? "",
  code: r.type_code ?? "",
  requiresReference: Boolean(r.requires_reference),
  active: r.is_active !== false,
  icon: r.icon || "Wallet",
  sort: Number(r.sort_order ?? 0),
  system: Boolean(r.is_system),
});

const toRow = (t: PaymentType): Row => ({
  id: t.id,
  name: t.name.trim(),
  type_code: t.code.trim().toLowerCase(),
  requires_reference: t.requiresReference,
  is_active: t.active,
  icon: t.icon || "Wallet",
  sort_order: Number.isFinite(t.sort) ? t.sort : 0,
  is_system: t.system,
});

export const blankPaymentType = (sort = 100): PaymentType => ({
  id: crypto.randomUUID(),
  name: "",
  code: "",
  requiresReference: false,
  active: true,
  icon: "Wallet",
  sort,
  system: false,
});

/** Turn a display name into a stable machine code. */
export const paymentCodeFrom = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

function readCache(): PaymentType[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(list) && list.length ? (list as PaymentType[]) : null;
  } catch {
    return null;
  }
}

function writeCache(list: PaymentType[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked — the shipped defaults still keep the till usable */
  }
}

const bySort = (a: PaymentType, b: PaymentType) => a.sort - b.sort || a.name.localeCompare(b.name);

/** Best copy available right now, without waiting for the network. */
export const cachedPaymentTypes = (): PaymentType[] =>
  (readCache() ?? FALLBACK_PAYMENT_TYPES).slice().sort(bySort);

export async function loadPaymentTypes(): Promise<PaymentType[]> {
  try {
    const res = await sb.from("payment_types").select("*").order("sort_order", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    const list = ((res.data as Row[] | null) ?? []).map(toType).sort(bySort);
    if (list.length) writeCache(list);
    return list.length ? list : cachedPaymentTypes();
  } catch (e) {
    console.error("[payment-types] load failed", e);
    return cachedPaymentTypes();
  }
}

export async function savePaymentType(t: PaymentType): Promise<PaymentTypeResult> {
  const name = t.name.trim();
  if (!name) return { success: false, error: "Give the payment method a name" };
  const code = (t.code.trim() || paymentCodeFrom(name)).toLowerCase();
  if (!code) return { success: false, error: "Give the payment method a code" };
  try {
    const res = await sb.from("payment_types").upsert(toRow({ ...t, name, code }) as never);
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  } catch (e) {
    return { success: false, error: describeError(e, "Saving the payment method") };
  }
}

export async function deletePaymentType(id: string): Promise<PaymentTypeResult> {
  try {
    const res = await sb.from("payment_types").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    return { success: true };
  } catch (e) {
    return { success: false, error: describeError(e, "Deleting the payment method") };
  }
}

/**
 * Live payment types for a screen. Starts from the cached copy so the payment
 * dialog paints instantly, then refreshes from the central database.
 */
export function usePaymentTypes() {
  const [types, setTypes] = useState<PaymentType[]>(cachedPaymentTypes);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadPaymentTypes().then((list) => {
      if (!alive) return;
      setTypes(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  return { types, loading, reload: () => setTick((n) => n + 1) };
}

/** Only the tenders a cashier may pick right now. */
export const activePaymentTypes = (types: PaymentType[]) => types.filter((t) => t.active);

/**
 * Label for a stored method code. Falls back to a readable version of the code
 * itself, so a bill taken on a since-deleted tender still reads correctly.
 */
export function paymentTypeLabel(code: string, types: PaymentType[] = cachedPaymentTypes()) {
  const hit = types.find((t) => t.code === code);
  if (hit) return hit.name;
  return code ? code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Unknown";
}

/**
 * Icon for a tender button. Custom methods name a lucide icon in settings; a
 * missing or unknown name falls back to a sensible built-in so a button never
 * renders blank.
 */
export function tenderIcon(icon: string, code: string) {
  const key = (icon || "").trim();
  const pick =
    (Icons as unknown as Record<string, LucideIcon | undefined>)[key] ??
    ({ cash: Icons.Banknote, card: Icons.CreditCard, wallet: Icons.Wallet, points: Icons.BadgeCheck, bank_transfer: Icons.Landmark } as Record<string, LucideIcon | undefined>)[code];
  return pick ?? Icons.Wallet;
}
