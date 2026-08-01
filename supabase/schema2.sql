-- SUPERSEDED: run supabase/schema_final.sql instead. Kept for history only.
-- ============================================================================
-- schema2.sql — RPC repair script
-- Fixes: "Could not find the function public.list_app_users without parameters
--         in the schema cache"
-- Safe to run any number of times on the live database (SQL Editor -> Run).
-- It only (re)creates the helper/RPC functions the POS frontend calls and then
-- reloads the PostgREST schema cache.
-- ============================================================================

create schema if not exists extensions;
do $$
begin
  create extension if not exists pgcrypto with schema extensions;
exception when others then
  begin
    create extension if not exists pgcrypto;
  exception when others then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 0. Prerequisites: role enum + role tables the functions depend on
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'manager', 'staff');
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.user_roles
                  where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.user_roles
                  where user_id = _user_id and role in ('admin','manager','staff'))
$$;

-- ---------------------------------------------------------------------------
-- 1. app_users table safety net (created only if the main schema never ran)
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  user_id varchar(64) not null unique,
  full_name varchar(160) not null default '',
  email varchar(255) not null default '',
  role public.app_role not null default 'staff',
  store_id varchar(64),
  is_active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  pin_hash text not null default '',
  auth_secret text not null default '',
  auth_user_id uuid,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users
  add column if not exists auth_user_id uuid,
  add column if not exists store_id varchar(64),
  add column if not exists last_login_at timestamptz,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists full_name varchar(160),
  add column if not exists email varchar(255),
  add column if not exists pin_hash text not null default '',
  add column if not exists auth_secret text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- role must be the enum for the functions below to compile
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'app_users'
                and column_name = 'role' and udt_name <> 'app_role') then
    update public.app_users
       set role = case lower(coalesce(role::text, ''))
                    when 'admin' then 'admin'
                    when 'manager' then 'manager'
                    when 'supervisor' then 'manager'
                    else 'staff'
                  end;
    alter table public.app_users alter column role drop default;
    alter table public.app_users
      alter column role type public.app_role using role::text::public.app_role;
    alter table public.app_users alter column role set default 'staff'::public.app_role;
    alter table public.app_users alter column role set not null;
  end if;
end $$;

revoke all on public.app_users from anon;
revoke all on public.app_users from authenticated;
grant all on public.app_users to service_role;
alter table public.app_users enable row level security;

-- ---------------------------------------------------------------------------
-- 2. The RPCs the frontend calls
-- ---------------------------------------------------------------------------

-- list_app_users() — used by the Staff Management screen
drop function if exists public.list_app_users();
create or replace function public.list_app_users()
returns table (id uuid, auth_user_id uuid, user_id text, full_name text, email text,
               role public.app_role, store_id text, is_active boolean, permissions jsonb,
               last_login_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.auth_user_id, a.user_id::text, a.full_name::text, a.email::text,
         a.role, a.store_id::text, a.is_active, a.permissions, a.last_login_at, a.created_at
  from public.app_users a
  where public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')
  order by a.user_id
$$;
revoke all on function public.list_app_users() from public;
grant execute on function public.list_app_users() to anon, authenticated, service_role;

-- current_app_user() — signed-in profile + permission matrix
drop function if exists public.current_app_user();
create or replace function public.current_app_user()
returns table (id uuid, user_id text, full_name text, role public.app_role, store_id text,
               email text, permissions jsonb, is_active boolean)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.user_id::text, a.full_name::text, a.role, a.store_id::text,
         a.email::text, a.permissions, a.is_active
  from public.app_users a
  where a.auth_user_id = auth.uid()
     or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;
revoke all on function public.current_app_user() from public;
grant execute on function public.current_app_user() to anon, authenticated, service_role;

-- verify_terminal_pin() — cashier User ID + 4-digit PIN login
drop function if exists public.verify_terminal_pin(text, text);
create or replace function public.verify_terminal_pin(p_user_id text, p_pin text)
returns table (user_id text, full_name text, role public.app_role, store_id text,
               email text, auth_secret text)
language plpgsql security definer set search_path = public, extensions as $$
declare u public.app_users%rowtype;
begin
  select * into u from public.app_users a
   where lower(a.user_id) = lower(trim(p_user_id)) and a.is_active;
  if not found then return; end if;
  if u.pin_hash = '' or u.pin_hash <> extensions.crypt(p_pin, u.pin_hash) then return; end if;
  update public.app_users set last_login_at = now() where id = u.id;
  return query select u.user_id::text, u.full_name::text, u.role, u.store_id::text,
                      u.email::text, u.auth_secret;
end $$;
revoke all on function public.verify_terminal_pin(text, text) from public;
grant execute on function public.verify_terminal_pin(text, text) to anon, authenticated, service_role;

-- set_app_user_permissions() — permission toggles
drop function if exists public.set_app_user_permissions(text, jsonb);
create or replace function public.set_app_user_permissions(p_user_id text, p_permissions jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can change permissions';
  end if;
  update public.app_users a
     set permissions = coalesce(a.permissions, '{}'::jsonb) || p_permissions,
         updated_at = now()
   where lower(a.user_id) = lower(trim(p_user_id));
end $$;
revoke all on function public.set_app_user_permissions(text, jsonb) from public;
grant execute on function public.set_app_user_permissions(text, jsonb) to authenticated, service_role;

-- set_app_user_profile() — name / role / store / active flag
drop function if exists public.set_app_user_profile(text, text, app_role, text, boolean);
create or replace function public.set_app_user_profile(
  p_user_id text, p_full_name text, p_role public.app_role, p_store_id text, p_is_active boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can edit staff profiles';
  end if;
  update public.app_users a
     set full_name  = coalesce(nullif(trim(p_full_name), ''), a.full_name),
         role       = coalesce(p_role, a.role),
         store_id   = nullif(trim(coalesce(p_store_id, '')), ''),
         is_active  = coalesce(p_is_active, a.is_active),
         updated_at = now()
   where lower(a.user_id) = lower(trim(p_user_id));
end $$;
revoke all on function public.set_app_user_profile(text, text, app_role, text, boolean) from public;
grant execute on function public.set_app_user_profile(text, text, app_role, text, boolean) to authenticated, service_role;

-- upsert_terminal_user() — provisioning (PIN hashed in the database)
drop function if exists public.upsert_terminal_user(text, text, app_role, text, text, text, text);
create or replace function public.upsert_terminal_user(
  p_user_id text, p_full_name text, p_role public.app_role, p_store_id text,
  p_email text, p_pin text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can manage terminal users';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;
  insert into public.app_users (user_id, full_name, role, store_id, email, pin_hash, auth_secret)
  values (trim(p_user_id), trim(p_full_name), p_role, nullif(trim(coalesce(p_store_id,'')),''),
          lower(trim(p_email)), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), p_password)
  on conflict (user_id) do update
    set full_name   = excluded.full_name,
        role        = excluded.role,
        store_id    = excluded.store_id,
        email       = excluded.email,
        pin_hash    = excluded.pin_hash,
        auth_secret = excluded.auth_secret,
        updated_at  = now();
end $$;
revoke all on function public.upsert_terminal_user(text, text, app_role, text, text, text, text) from public;
grant execute on function public.upsert_terminal_user(text, text, app_role, text, text, text, text) to authenticated, service_role;

-- set_terminal_active() / delete_terminal_user()
drop function if exists public.set_terminal_active(text, boolean);
create or replace function public.set_terminal_active(p_user_id text, p_active boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can manage terminal users';
  end if;
  update public.app_users a set is_active = p_active, updated_at = now()
   where lower(a.user_id) = lower(trim(p_user_id));
end $$;
revoke all on function public.set_terminal_active(text, boolean) from public;
grant execute on function public.set_terminal_active(text, boolean) to authenticated, service_role;

drop function if exists public.delete_terminal_user(text);
create or replace function public.delete_terminal_user(p_user_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only admins can delete terminal users';
  end if;
  delete from public.app_users a where lower(a.user_id) = lower(trim(p_user_id));
end $$;
revoke all on function public.delete_terminal_user(text) from public;
grant execute on function public.delete_terminal_user(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Force PostgREST to refresh its schema cache (this is what fixes the
--    "could not find the function ... in the schema cache" error)
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Verify: should list every function above
-- select routine_name from information_schema.routines
--  where routine_schema = 'public' order by 1;
