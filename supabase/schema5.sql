-- SUPERSEDED: run supabase/schema_final.sql instead. Kept for history only.
-- ============================================================================
-- schema5.sql — cashiers live in their own table (no auth account)
-- Idempotent: safe to run multiple times.
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
-- Supervisor guard (re-created here so this script can run standalone)
-- ---------------------------------------------------------------------------
create or replace function public.is_app_supervisor()
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare ok boolean := false;
begin
  begin
    select exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','manager')
    ) into ok;
  exception when undefined_table then ok := false;
  end;
  if ok then return true; end if;
  begin
    select exists (
      select 1 from public.app_users a
      where a.auth_user_id = auth.uid()
        and a.role::text in ('admin','manager','supervisor')
    ) into ok;
  exception when undefined_table or undefined_column then ok := false;
  end;
  return coalesce(ok, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cashier table
-- ---------------------------------------------------------------------------
create table if not exists public.cashiers (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  full_name text not null default '',
  pin_hash text not null,
  store_id text,
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cashiers_username_key
  on public.cashiers (lower(username));

grant select, insert, update, delete on public.cashiers to authenticated;
grant all on public.cashiers to service_role;

alter table public.cashiers enable row level security;

drop policy if exists "Signed-in staff can read cashiers" on public.cashiers;
create policy "Signed-in staff can read cashiers"
  on public.cashiers for select to authenticated using (true);

drop policy if exists "Supervisors manage cashiers" on public.cashiers;
create policy "Supervisors manage cashiers"
  on public.cashiers for all to authenticated
  using (public.is_app_supervisor()) with check (public.is_app_supervisor());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists cashiers_touch_updated_at on public.cashiers;
create trigger cashiers_touch_updated_at
  before update on public.cashiers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.list_cashiers()
returns table (
  id uuid,
  username text,
  full_name text,
  store_id text,
  permissions jsonb,
  is_active boolean,
  last_login_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id, c.username, c.full_name, c.store_id, c.permissions,
         c.is_active, c.last_login_at, c.created_at
  from public.cashiers c
  where public.is_app_supervisor()
  order by c.username;
$$;

create or replace function public.upsert_cashier(
  p_id uuid,
  p_username text,
  p_full_name text,
  p_pin text,
  p_store_id text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors and admins can manage cashiers';
  end if;
  if coalesce(trim(p_username), '') = '' then
    raise exception 'Username is required';
  end if;
  if p_pin is not null and p_pin <> '' and p_pin !~ '^\d{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  if p_id is null then
    if p_pin is null or p_pin = '' then
      raise exception 'A PIN is required for a new cashier';
    end if;
    insert into public.cashiers (username, full_name, pin_hash, store_id, is_active)
    values (lower(trim(p_username)), coalesce(p_full_name, ''),
            extensions.crypt(p_pin, extensions.gen_salt('bf')), p_store_id, coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.cashiers set
      username = lower(trim(p_username)),
      full_name = coalesce(p_full_name, full_name),
      store_id = p_store_id,
      is_active = coalesce(p_is_active, is_active),
      pin_hash = case when p_pin is null or p_pin = '' then pin_hash
                      else extensions.crypt(p_pin, extensions.gen_salt('bf')) end
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.set_cashier_permissions(
  p_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors and admins can manage cashiers';
  end if;
  update public.cashiers
     set permissions = coalesce(permissions, '{}'::jsonb) || coalesce(p_permissions, '{}'::jsonb)
   where id = p_id;
end;
$$;

create or replace function public.delete_cashier(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors and admins can manage cashiers';
  end if;
  delete from public.cashiers where id = p_id;
end;
$$;

-- Terminal login: username + PIN, verified against the bcrypt digest.
create or replace function public.verify_cashier_pin(p_username text, p_pin text)
returns table (
  id uuid,
  username text,
  full_name text,
  store_id text,
  permissions jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_row public.cashiers;
begin
  select * into v_row from public.cashiers c
   where lower(c.username) = lower(trim(p_username)) and c.is_active
   limit 1;
  if v_row.id is null then return; end if;
  if v_row.pin_hash <> extensions.crypt(p_pin, v_row.pin_hash) then return; end if;

  update public.cashiers set last_login_at = now() where public.cashiers.id = v_row.id;

  id := v_row.id;
  username := v_row.username;
  full_name := v_row.full_name;
  store_id := v_row.store_id;
  permissions := coalesce(v_row.permissions, '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.list_cashiers() from public;
revoke all on function public.upsert_cashier(uuid, text, text, text, text, boolean) from public;
revoke all on function public.set_cashier_permissions(uuid, jsonb) from public;
revoke all on function public.delete_cashier(uuid) from public;
revoke all on function public.verify_cashier_pin(text, text) from public;

grant execute on function public.list_cashiers() to authenticated, service_role;
grant execute on function public.upsert_cashier(uuid, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.set_cashier_permissions(uuid, jsonb) to authenticated, service_role;
grant execute on function public.delete_cashier(uuid) to authenticated, service_role;
-- The till has no session yet when a cashier signs in.
grant execute on function public.verify_cashier_pin(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Migrate existing cashiers out of app_users
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  if to_regclass('public.app_users') is null then return; end if;

  for r in execute
    $q$ select a.user_id, coalesce(a.full_name, '') as full_name,
               a.store_id::text as store_id,
               coalesce(a.permissions, '{}'::jsonb) as permissions,
               coalesce(a.is_active, true) as is_active,
               a.pin_hash
          from public.app_users a
         where a.role::text = 'cashier' $q$
  loop
    insert into public.cashiers (username, full_name, pin_hash, store_id, permissions, is_active)
    values (
      lower(r.user_id),
      r.full_name,
      -- keep the existing digest when present, otherwise a locked PIN that
      -- must be reset by a supervisor
      coalesce(nullif(r.pin_hash, ''), extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf'))),
      r.store_id,
      r.permissions,
      r.is_active
    )
    on conflict (lower(username)) do update
      set full_name = excluded.full_name,
          store_id = excluded.store_id,
          permissions = excluded.permissions,
          is_active = excluded.is_active;
  end loop;

  delete from public.app_users where role::text = 'cashier';
exception when undefined_column then
  raise notice 'app_users cashier migration skipped: column mismatch';
end;
$$;

notify pgrst, 'reload schema';
