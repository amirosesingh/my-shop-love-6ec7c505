-- ============================================================================
-- schema27.sql — settings columns the app writes but older databases lack.
-- Idempotent: safe to run as many times as you like. Nothing is dropped.
-- ============================================================================

alter table public.pos_settings
  add column if not exists payment_details jsonb not null default '{}'::jsonb;

alter table public.pos_settings
  add column if not exists whatsapp_settings jsonb not null default '{}'::jsonb;

comment on column public.pos_settings.payment_details is
  'Bank transfer / payment instructions shown on receipts and booking slips.';
comment on column public.pos_settings.whatsapp_settings is
  'WhatsApp bill delivery configuration (enabled, phone number id, templates).';

notify pgrst, 'reload schema';