-- ---------------------------------------------------------------------------
-- 20260822010000_app_users.sql        (CENTRAL SERVER — PostgreSQL)
--
-- Feature: Stage 1 — offline cashier sign-in.
-- Status:  PARITY ONLY. The managed cloud database already has every column
--          below (verified). This file exists so a self-hosted central server
--          built from an older script can be brought in line.
--
-- Sequenced after the newest existing migration, 20260821035305_*.sql.
-- Additive and idempotent; existing rows are untouched.
-- Not applied automatically — do not run it against a live database blindly.
-- ---------------------------------------------------------------------------

alter table public.app_users add column if not exists role_slug text;
alter table public.app_users add column if not exists pin_length smallint not null default 0;
alter table public.app_users add column if not exists row_version integer not null default 1;
alter table public.app_users add column if not exists last_login_at timestamptz;
alter table public.app_users add column if not exists store_id varchar;

-- The till mirrors the roster keyed on user_id, so it must be unique centrally.
create unique index if not exists app_users_user_id_uidx on public.app_users (lower(user_id));

-- ---------------------------------- DOWN ----------------------------------
-- drop index if exists public.app_users_user_id_uidx;
-- alter table public.app_users drop column if exists role_slug;
-- alter table public.app_users drop column if exists pin_length;
-- alter table public.app_users drop column if exists row_version;
-- ---------------------------------------------------------------------------
