-- ---------------------------------------------------------------------------
-- 20260822010200_staff_roles.sql      (CENTRAL SERVER — PostgreSQL)
--
-- Feature: Stage 1 — the role/permission set the till mirrors for offline use.
-- Status:  PARITY ONLY for a self-hosted central server. The managed cloud
--          database already has this table (verified).
--
-- Creates the table with grants and row-level security in the required order:
-- create table -> grants -> enable RLS -> policies.
--
-- Additive and idempotent. Not applied automatically.
-- ---------------------------------------------------------------------------

create table if not exists public.staff_roles (
  slug        text primary key,
  name        text not null,
  base_level  text not null default 'cashier',
  permissions jsonb not null default '{}'::jsonb,
  is_core     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.staff_roles add column if not exists base_level text not null default 'cashier';
alter table public.staff_roles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.staff_roles add column if not exists is_core boolean not null default false;

grant select, insert, update, delete on public.staff_roles to authenticated;
grant all on public.staff_roles to service_role;

alter table public.staff_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'staff_roles'
       and policyname = 'staff_roles_read'
  ) then
    create policy staff_roles_read on public.staff_roles
      for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'staff_roles'
       and policyname = 'staff_roles_admin_write'
  ) then
    create policy staff_roles_admin_write on public.staff_roles
      for all to authenticated
      using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

-- ---------------------------------- DOWN ----------------------------------
-- drop policy if exists staff_roles_admin_write on public.staff_roles;
-- drop policy if exists staff_roles_read on public.staff_roles;
-- drop table if exists public.staff_roles;   -- only if this file created it
-- ---------------------------------------------------------------------------
