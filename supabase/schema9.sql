-- ============================================================================
-- schema9.sql — partner attribution for promotions / coupon codes.
-- Safe to run repeatedly on an existing POS database.
-- ============================================================================

alter table public.promotions add column if not exists partner text;

comment on column public.promotions.partner is
  'Collaborator or influencer the coupon codes of this rule belong to. Used to total redemptions per partner in the Coupon Usage report.';

notify pgrst, 'reload schema';