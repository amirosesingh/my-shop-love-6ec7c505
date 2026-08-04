/**
 * Digital coupon campaigns and the single-use vouchers issued from them.
 *
 * Campaigns are managed in the backoffice; vouchers are issued by the public
 * join / claim pages and locked at the till. Every write that must not be
 * tampered with (issuing, redeeming) goes through a database function, so the
 * browser only ever holds the publishable key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { r2 } from "./pos-types";

const sb = supabaseExternal as unknown as SupabaseClient;

export type DiscountKind = "PERCENTAGE" | "FIXED_AMOUNT";
export type CampaignScope = "BILL" | "CATEGORY" | "PRODUCT";
export type VoucherStatus = "ISSUED" | "REDEEMED" | "EXPIRED";

export type Campaign = {
  id: string;
  name: string;
  slug: string;
  discountType: DiscountKind;
  discountValue: number;
  scope: CampaignScope;
  /** category name or product id, depending on `scope` */
  scopeValue?: string | null;
  /** null / undefined means unlimited */
  maxClaims?: number | null;
  /** how many vouchers one member may hold for this campaign; null = unlimited */
  maxPerMember?: number | null;
  claimsCount: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  isWelcome: boolean;
  createdAt?: string;
};

export type Voucher = {
  id: string;
  tokenSlug: string;
  campaignId: string;
  memberId: string | null;
  status: VoucherStatus;
  issuedAt: string;
  redeemedAt?: string | null;
  redeemedBy?: string | null;
  storeId?: string | null;
  /** voucher-level expiry, overrides the campaign window when set */
  expiresAt?: string | null;
  issuedBy?: string | null;
  issuedSource?: "PUBLIC" | "MANUAL" | string | null;
  redeemedSaleId?: string | null;
};

export type CouponEventType = "CLAIMED" | "ISSUED_MANUAL" | "REDEEMED" | "BLOCKED";

export type CouponEvent = {
  id: string;
  type: CouponEventType;
  campaignId: string | null;
  campaignName: string;
  token: string | null;
  memberId: string | null;
  memberPhone: string | null;
  storeId: string | null;
  terminalId: string | null;
  staffName: string | null;
  staffRole: string | null;
  saleId: string | null;
  note: string | null;
  createdAt: string;
};

type Row = Record<string, any>;

const toCampaign = (r: Row): Campaign => ({
  id: r.id,
  name: r.name ?? "",
  slug: r.slug ?? "",
  discountType: (r.discount_type as DiscountKind) ?? "PERCENTAGE",
  discountValue: Number(r.discount_value ?? 0),
  scope: (r.scope as CampaignScope) ?? "BILL",
  scopeValue: r.scope_value ?? null,
  maxClaims: r.max_claims ?? null,
  maxPerMember: r.max_per_member ?? null,
  claimsCount: Number(r.claims_count ?? 0),
  startsAt: r.starts_at ?? null,
  expiresAt: r.expires_at ?? null,
  isActive: Boolean(r.is_active),
  isWelcome: Boolean(r.is_welcome),
  createdAt: r.created_at ?? undefined,
});

const toRow = (c: Campaign): Row => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  discount_type: c.discountType,
  discount_value: c.discountValue,
  scope: c.scope,
  scope_value: c.scopeValue || null,
  max_claims: c.maxClaims ?? null,
  max_per_member: c.maxPerMember ?? null,
  starts_at: c.startsAt || null,
  expires_at: c.expiresAt || null,
  is_active: c.isActive,
  is_welcome: c.isWelcome,
});

const toVoucher = (r: Row): Voucher => ({
  id: r.id,
  tokenSlug: r.token_slug,
  campaignId: r.campaign_id,
  memberId: r.member_id ?? null,
  status: (r.status as VoucherStatus) ?? "ISSUED",
  issuedAt: r.issued_at,
  redeemedAt: r.redeemed_at ?? null,
  redeemedBy: r.redeemed_by ?? null,
  storeId: r.store_id ?? null,
  expiresAt: r.expires_at ?? null,
  issuedBy: r.issued_by ?? null,
  issuedSource: r.issued_source ?? null,
  redeemedSaleId: r.redeemed_sale_id ?? null,
});

const toEvent = (r: Row): CouponEvent => ({
  id: r.id,
  type: (r.event_type as CouponEventType) ?? "CLAIMED",
  campaignId: r.campaign_id ?? null,
  campaignName: r.campaign_name ?? "",
  token: r.voucher_token ?? null,
  memberId: r.member_id ?? null,
  memberPhone: r.member_phone ?? null,
  storeId: r.store_id ?? null,
  terminalId: r.terminal_id ?? null,
  staffName: r.staff_name ?? null,
  staffRole: r.staff_role ?? null,
  saleId: r.sale_id ?? null,
  note: r.note ?? null,
  createdAt: r.created_at,
});

export const blankCampaign = (): Campaign => ({
  id: crypto.randomUUID(),
  name: "",
  slug: "",
  discountType: "PERCENTAGE",
  discountValue: 10,
  scope: "BILL",
  scopeValue: null,
  maxClaims: null,
  maxPerMember: 1,
  claimsCount: 0,
  startsAt: null,
  expiresAt: null,
  isActive: true,
  isWelcome: false,
});

/** URL-safe slug from any campaign name. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export async function loadCampaigns(): Promise<Campaign[]> {
  const res = await sb.from("coupon_campaigns").select("*").order("created_at", { ascending: false });
  if (res.error) throw new Error(res.error.message);
  return ((res.data as Row[] | null) ?? []).map(toCampaign);
}

export async function saveCampaign(c: Campaign): Promise<void> {
  const res = await sb.from("coupon_campaigns").upsert(toRow(c) as never);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteCampaign(id: string): Promise<void> {
  const res = await sb.from("coupon_campaigns").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

export async function loadCampaignBySlug(slug: string): Promise<Campaign | null> {
  const res = await sb.from("coupon_campaigns").select("*").eq("slug", slug).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data ? toCampaign(res.data as Row) : null;
}

export async function loadVouchers(campaignId?: string): Promise<Voucher[]> {
  let q = sb.from("issued_vouchers").select("*").order("issued_at", { ascending: false });
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const res = await q;
  if (res.error) throw new Error(res.error.message);
  return ((res.data as Row[] | null) ?? []).map(toVoucher);
}

export type VoucherView = {
  voucher: Voucher;
  campaign: Campaign;
  memberName: string;
  memberCode: string;
};

/** Everything the public voucher page needs, in one round trip. */
export async function loadVoucherByToken(token: string): Promise<VoucherView | null> {
  const res = await sb
    .from("issued_vouchers")
    .select("*, coupon_campaigns(*), members(full_name, member_code)")
    .eq("token_slug", token)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  const row = res.data as Row | null;
  if (!row?.coupon_campaigns) return null;
  return {
    voucher: toVoucher(row),
    campaign: toCampaign(row.coupon_campaigns as Row),
    memberName: row.members?.full_name ?? "Lucky Charms member",
    memberCode: row.members?.member_code ?? "",
  };
}

/** Member's live vouchers, campaign included, for the register. */
export async function loadMemberVouchers(memberId: string): Promise<VoucherView[]> {
  const res = await sb
    .from("issued_vouchers")
    .select("*, coupon_campaigns(*), members(full_name, member_code)")
    .eq("member_id", memberId)
    .eq("status", "ISSUED");
  if (res.error) throw new Error(res.error.message);
  return ((res.data as Row[] | null) ?? [])
    .filter((r) => r.coupon_campaigns)
    .map((r) => ({
      voucher: toVoucher(r),
      campaign: toCampaign(r.coupon_campaigns as Row),
      memberName: r.members?.full_name ?? "",
      memberCode: r.members?.member_code ?? "",
    }))
    .filter((v) => !isVoucherExpired(v.voucher, v.campaign));
}

/** Audit trail: claims, manual issues, redemptions and blocked attempts. */
export async function loadCouponEvents(campaignId?: string): Promise<CouponEvent[]> {
  let q = sb
    .from("coupon_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const res = await q;
  if (res.error) throw new Error(res.error.message);
  return ((res.data as Row[] | null) ?? []).map(toEvent);
}

/* ------------------------------- rpc calls ------------------------------- */

const friendly: Record<string, string> = {
  CAMPAIGN_NOT_FOUND: "That coupon link is not valid.",
  CAMPAIGN_INACTIVE: "This promotion is not running right now.",
  CAMPAIGN_NOT_STARTED: "This promotion has not started yet.",
  CAMPAIGN_EXPIRED: "This promotion has ended.",
  CAMPAIGN_FULLY_CLAIMED: "All coupons for this promotion have been claimed.",
  NEW_MEMBER_NAME_REQUIRED: "NEW_MEMBER_NAME_REQUIRED",
  VOUCHER_NOT_FOUND: "That voucher code is not recognised.",
  VOUCHER_ALREADY_REDEEMED: "This voucher has already been used.",
  VOUCHER_EXPIRED: "This voucher has expired.",
  MEMBER_LIMIT_REACHED: "This member has already claimed the maximum for this campaign.",
};

const explain = (message: string) => {
  const key = Object.keys(friendly).find((k) => message.includes(k));
  return key ? friendly[key]! : message;
};

/** Issue (or re-fetch) this phone number's voucher for a campaign. */
export async function claimCampaign(input: {
  slug: string;
  phone: string;
  fullName?: string;
  email?: string;
}): Promise<string> {
  const res = await sb.rpc("coupon_claim", {
    _slug: input.slug,
    _phone: input.phone,
    _full_name: input.fullName ?? null,
    _email: input.email ?? null,
  });
  if (res.error) throw new Error(explain(res.error.message));
  return res.data as string;
}

/** Register a member from the public join page; returns a welcome token if any. */
export async function joinMember(input: {
  phone: string;
  fullName: string;
  email?: string;
}): Promise<string | null> {
  const res = await sb.rpc("member_welcome_claim", {
    _phone: input.phone,
    _full_name: input.fullName,
    _email: input.email ?? null,
  });
  if (res.error) throw new Error(explain(res.error.message));
  return (res.data as string | null) ?? null;
}

/** Atomically lock a voucher at the till. Throws if it is used or expired. */
export async function redeemVoucher(input: {
  token: string;
  saleId?: string;
  storeId?: string;
  staff?: string;
}): Promise<void> {
  const res = await sb.rpc("voucher_redeem", {
    _token: input.token,
    _sale_id: input.saleId ?? null,
    _store_id: input.storeId ?? null,
    _staff: input.staff ?? null,
  });
  if (res.error) throw new Error(explain(res.error.message));
}

/** Backoffice: hand a voucher to a specific member, with an optional custom expiry. */
export async function issueVoucherManually(input: {
  slug: string;
  phone: string;
  fullName?: string;
  expiresAt?: string | null;
  staff?: string;
  role?: string;
  storeId?: string;
  ignoreLimit?: boolean;
}): Promise<string> {
  const res = await sb.rpc("coupon_issue_manual", {
    _slug: input.slug,
    _phone: input.phone,
    _full_name: input.fullName ?? null,
    _expires_at: input.expiresAt ?? null,
    _staff: input.staff ?? null,
    _role: input.role ?? null,
    _store: input.storeId ?? null,
    _ignore_limit: input.ignoreLimit ?? false,
  });
  if (res.error) throw new Error(explain(res.error.message));
  return res.data as string;
}

/* ------------------------------ status helpers ---------------------------- */

export const isExpired = (c: Campaign, now = new Date()) =>
  Boolean(c.expiresAt && now > new Date(c.expiresAt));

/** A voucher's own expiry wins over the campaign window when it is set. */
export const voucherDeadline = (v: Voucher, c: Campaign) => v.expiresAt ?? c.expiresAt ?? null;

export const isVoucherExpired = (v: Voucher, c: Campaign, now = new Date()) => {
  const deadline = voucherDeadline(v, c);
  return Boolean(deadline && now > new Date(deadline));
};

export const isScheduled = (c: Campaign, now = new Date()) =>
  Boolean(c.startsAt && now < new Date(c.startsAt));

export const isFull = (c: Campaign) =>
  c.maxClaims != null && c.claimsCount >= c.maxClaims;

export function campaignStatus(c: Campaign, now = new Date()) {
  if (!c.isActive) return "Off" as const;
  if (isExpired(c, now)) return "Expired" as const;
  if (isScheduled(c, now)) return "Scheduled" as const;
  if (isFull(c)) return "Fully claimed" as const;
  return "Live" as const;
}

export const discountLabel = (c: Campaign) =>
  c.discountType === "PERCENTAGE" ? `${c.discountValue}% off` : `${c.discountValue.toFixed(2)} off`;

export const scopeLabel = (c: Campaign) =>
  c.scope === "BILL"
    ? "whole bill"
    : c.scope === "CATEGORY"
      ? `category “${c.scopeValue ?? ""}”`
      : "one product";

/**
 * Currency value a voucher takes off, given the cart lines it applies to.
 * `base` is the eligible amount (whole bill, category lines or one product).
 */
export const voucherValue = (c: Campaign, base: number) =>
  r2(
    Math.min(
      base,
      c.discountType === "PERCENTAGE" ? (base * c.discountValue) / 100 : c.discountValue,
    ),
  );
