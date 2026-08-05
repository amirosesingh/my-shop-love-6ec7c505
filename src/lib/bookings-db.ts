/**
 * Bookings (and racket stringing job cards) in the cloud database, so a job
 * raised on one till is visible from every other till and from the phone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import type { Booking, JobStatus } from "./pos-types";
import { commitOps, type CommitTarget } from "./pos-db";
import type { SyncOp } from "./sync-outbox";

const sb = supabaseExternal as unknown as SupabaseClient;

type Row = Record<string, any>;

const toRow = (b: Booking): Row => ({
  id: b.id,
  ref: b.ref,
  store_id: b.storeId,
  shift_id: b.shiftId,
  customer_name: b.customerName,
  customer_phone: b.customerPhone,
  member_id: b.memberId,
  service_type_id: b.serviceTypeId ?? null,
  service_name: b.serviceName ?? null,
  service_fee: b.serviceFee ?? 0,
  payment_timing: b.paymentTiming ?? null,
  lines: b.lines,
  subtotal: b.subtotal,
  discount: b.discount,
  tax: b.tax,
  total: b.total,
  paid: b.paid,
  due_date: b.dueDate || null,
  note: b.note ?? "",
  cashier: b.cashier ?? null,
  status: b.status,
  sale_receipt_no: b.saleReceiptNo ?? null,
  closed_at: b.closedAt ?? null,
  racket_model: b.job?.racketModel ?? null,
  string_type: b.job?.stringType ?? null,
  tension_main: b.job?.tensionMain ?? null,
  tension_cross: b.job?.tensionCross ?? null,
  tension_unit: b.job?.tensionUnit ?? "lb",
  grommet_notes: b.job?.grommetNotes ?? null,
  job_notes: b.job?.jobNotes ?? null,
  dropped_off_at: b.job?.droppedOffAt ?? null,
  promised_at: b.job?.promisedAt ?? null,
  job_status: b.jobStatus ?? "received",
  job_status_by: b.jobStatusBy ?? null,
  job_status_at: b.jobStatusAt ?? null,
  notify_whatsapp: !!b.job?.notifyWhatsApp,
});

const rowToBooking = (r: Row, payments: Row[]): Booking => ({
  id: r.id,
  ref: r.ref,
  storeId: r.store_id ?? "",
  shiftId: r.shift_id ?? "",
  lines: Array.isArray(r.lines) ? r.lines : [],
  serviceTypeId: r.service_type_id ?? undefined,
  serviceName: r.service_name ?? undefined,
  serviceFee: Number(r.service_fee) || 0,
  paymentTiming: r.payment_timing ?? undefined,
  subtotal: Number(r.subtotal) || 0,
  discount: Number(r.discount) || 0,
  tax: Number(r.tax) || 0,
  total: Number(r.total) || 0,
  paid: Number(r.paid) || 0,
  payments: payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount) || 0,
    method: p.method,
    at: p.paid_at ?? p.created_at,
    cashier: p.cashier ?? "",
  })),
  dueDate: r.due_date ?? "",
  memberId: r.member_id ?? null,
  customerName: r.customer_name ?? "",
  customerPhone: r.customer_phone ?? "",
  note: r.note ?? "",
  cashier: r.cashier ?? "",
  createdAt: r.created_at,
  status: r.status,
  closedAt: r.closed_at ?? undefined,
  saleReceiptNo: r.sale_receipt_no ?? undefined,
  jobStatus: (r.job_status as JobStatus) ?? "received",
  jobStatusBy: r.job_status_by ?? undefined,
  jobStatusAt: r.job_status_at ?? undefined,
  job: {
    racketModel: r.racket_model ?? undefined,
    stringType: r.string_type ?? undefined,
    tensionMain: r.tension_main == null ? undefined : Number(r.tension_main),
    tensionCross: r.tension_cross == null ? undefined : Number(r.tension_cross),
    tensionUnit: (r.tension_unit as "lb" | "kg") ?? "lb",
    grommetNotes: r.grommet_notes ?? undefined,
    jobNotes: r.job_notes ?? undefined,
    droppedOffAt: r.dropped_off_at ?? undefined,
    promisedAt: r.promised_at ?? undefined,
    notifyWhatsApp: !!r.notify_whatsapp,
  },
});

/** Write (or re-write) a booking and its payment history. */
export async function saveBooking(b: Booking) {
  const head = await sb.from("bookings").upsert(toRow(b) as never);
  if (head.error) throw new Error(head.error.message);
  if (!b.payments.length) return;
  await sb.from("booking_payments").delete().eq("booking_id", b.id);
  const rows = b.payments.map((p) => ({
    id: p.id,
    booking_id: b.id,
    amount: p.amount,
    method: p.method,
    cashier: p.cashier,
    paid_at: p.at,
  }));
  const res = await sb.from("booking_payments").insert(rows as never);
  if (res.error) throw new Error(res.error.message);
}

/** Best-effort mirror — never blocks the till when the network is down. */
export const saveBookingQuietly = (b: Booking) => {
  void saveBooking(b).catch(() => undefined);
};

/**
 * Store a booking and only resolve once it is safe: straight to the cloud when
 * the connection is up, otherwise into the offline queue on this device.
 */
export async function commitBooking(b: Booking): Promise<CommitTarget> {
  try {
    await saveBooking(b);
    return "cloud";
  } catch (err) {
    const ops: SyncOp[] = [{ kind: "upsert", table: "bookings", rows: [toRow(b)] }];
    if (b.payments.length)
      ops.push({
        kind: "upsert",
        table: "booking_payments",
        rows: b.payments.map((p) => ({
          id: p.id,
          booking_id: b.id,
          amount: p.amount,
          method: p.method,
          cashier: p.cashier,
          paid_at: p.at,
        })),
      });
    try {
      return await commitOps("Saving booking", ops);
    } catch {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

/** Every booking raised in the company, newest first. */
export async function loadBookings(): Promise<Booking[]> {
  const heads = await sb
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (heads.error) throw new Error(heads.error.message);
  const rows = (heads.data as Row[] | null) ?? [];
  if (!rows.length) return [];
  const pays = await sb
    .from("booking_payments")
    .select("*")
    .in("booking_id", rows.map((r) => r.id));
  const byBooking = new Map<string, Row[]>();
  for (const p of ((pays.data as Row[] | null) ?? [])) {
    const list = byBooking.get(p.booking_id) ?? [];
    list.push(p);
    byBooking.set(p.booking_id, list);
  }
  return rows.map((r) => rowToBooking(r, byBooking.get(r.id) ?? []));
}