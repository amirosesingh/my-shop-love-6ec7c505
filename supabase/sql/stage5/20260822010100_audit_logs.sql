-- ---------------------------------------------------------------------------
-- 20260822010100_audit_logs.sql       (CENTRAL SERVER — PostgreSQL)
--
-- Feature: Stage 1 — offline sign-ins uploaded when the till reconnects.
-- Status:  PARITY ONLY. The managed cloud database already has these columns
--          and the id primary key (verified).
--
-- The upload upserts on id, and the id is derived from terminal + person +
-- minute, so a replay must land on the same row instead of logging twice.
--
-- Additive and idempotent. Not applied automatically.
-- ---------------------------------------------------------------------------

alter table public.audit_logs add column if not exists user_name text;
alter table public.audit_logs add column if not exists action_category text;
alter table public.audit_logs add column if not exists action_name text;
alter table public.audit_logs add column if not exists target_module text;
alter table public.audit_logs add column if not exists details jsonb;

-- Conflict target for the offline sign-in upsert.
create unique index if not exists audit_logs_id_uidx on public.audit_logs (id);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------- DOWN ----------------------------------
-- drop index if exists public.audit_logs_created_idx;
-- drop index if exists public.audit_logs_id_uidx;
-- (the descriptive columns are in use by the audit screens; do not drop them)
-- ---------------------------------------------------------------------------
