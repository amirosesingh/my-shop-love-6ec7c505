-- ---------------------------------------------------------------------------
-- FIX: "Only supervisors can manage terminal users" / empty staff list
--
-- Cause: every management RPC authorised the caller with public.has_role(),
-- which only reads public.user_roles. Admins created through Staff Management
-- only exist in public.app_users, so they were never recognised.
--
-- This script adds public.is_app_supervisor(), which accepts an admin/manager
-- from EITHER user_roles OR app_users, links existing app_users rows to their
-- auth account, and re-creates the RPCs to use it. Safe to re-run.
-- ---------------------------------------------------------------------------

-- 1. Link app_users rows to auth accounts by email (idempotent)
update public.app_users a
   set auth_user_id = u.id
  from auth.users u
 where a.auth_user_id is null
   and lower(a.email) = lower(u.email);

-- 2. Mirror app_users admins/managers into user_roles (keeps has_role correct)
insert into public.user_roles (user_id, role)
select a.auth_user_id, a.role
  from public.app_users a
 where a.auth_user_id is not null
   and a.role in ('admin','manager')
on conflict (user_id, role) do nothing;

-- 3. Unified supervisor check
create or replace function public.is_app_supervisor()
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select
    exists (
      select 1 from public.user_roles r
       where r.user_id = auth.uid() and r.role in ('admin','manager')
    )
    or exists (
      select 1 from public.app_users a
       where a.is_active
         and a.role in ('admin','manager')
         and (a.auth_user_id = auth.uid()
              or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email','')))
    )
$$;
revoke all on function public.is_app_supervisor() from public;
grant execute on function public.is_app_supervisor() to anon, authenticated, service_role;

-- 4. Re-create the RPCs using the unified check
drop function if exists public.list_app_users();
create or replace function public.list_app_users()
returns table (id uuid, auth_user_id uuid, user_id text, full_name text, email text,
               role public.app_role, store_id text, is_active boolean, permissions jsonb,
               last_login_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.auth_user_id, a.user_id::text, a.full_name::text, a.email::text,
         a.role, a.store_id::text, a.is_active, a.permissions, a.last_login_at, a.created_at
  from public.app_users a
  where public.is_app_supervisor()
  order by a.user_id
$$;
revoke all on function public.list_app_users() from public;
grant execute on function public.list_app_users() to anon, authenticated, service_role;

drop function if exists public.set_app_user_permissions(text, jsonb);
create or replace function public.set_app_user_permissions(p_user_id text, p_permissions jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors can change permissions';
  end if;
  update public.app_users a
     set permissions = coalesce(a.permissions, '{}'::jsonb) || p_permissions,
         updated_at = now()
   where lower(a.user_id) = lower(trim(p_user_id));
end $$;
revoke all on function public.set_app_user_permissions(text, jsonb) from public;
grant execute on function public.set_app_user_permissions(text, jsonb) to authenticated, service_role;

drop function if exists public.set_app_user_profile(text, text, app_role, text, boolean);
create or replace function public.set_app_user_profile(
  p_user_id text, p_full_name text, p_role public.app_role, p_store_id text, p_is_active boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_app_supervisor() then
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

-- PIN column is legacy: accept 4-6 digits (or blank for email-only staff)
drop function if exists public.upsert_terminal_user(text, text, app_role, text, text, text, text);
create or replace function public.upsert_terminal_user(
  p_user_id text, p_full_name text, p_role public.app_role, p_store_id text,
  p_email text, p_pin text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_auth uuid;
begin
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors can manage terminal users';
  end if;
  if coalesce(p_pin,'') <> '' and p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  select u.id into v_auth from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;

  insert into public.app_users (user_id, full_name, role, store_id, email, pin_hash, auth_secret, auth_user_id)
  values (trim(p_user_id), trim(p_full_name), p_role, nullif(trim(coalesce(p_store_id,'')),''),
          lower(trim(p_email)),
          case when coalesce(p_pin,'') = '' then '' else extensions.crypt(p_pin, extensions.gen_salt('bf', 10)) end,
          coalesce(p_password,''), v_auth)
  on conflict (user_id) do update
    set full_name    = excluded.full_name,
        role         = excluded.role,
        store_id     = excluded.store_id,
        email        = excluded.email,
        pin_hash     = case when excluded.pin_hash = '' then public.app_users.pin_hash else excluded.pin_hash end,
        auth_secret  = excluded.auth_secret,
        auth_user_id = coalesce(excluded.auth_user_id, public.app_users.auth_user_id),
        updated_at   = now();

  -- keep user_roles in sync for supervisors/admins
  if v_auth is not null and p_role in ('admin','manager') then
    insert into public.user_roles (user_id, role) values (v_auth, p_role)
    on conflict (user_id, role) do nothing;
  end if;
end $$;
revoke all on function public.upsert_terminal_user(text, text, app_role, text, text, text, text) from public;
grant execute on function public.upsert_terminal_user(text, text, app_role, text, text, text, text) to authenticated, service_role;

drop function if exists public.set_terminal_active(text, boolean);
create or replace function public.set_terminal_active(p_user_id text, p_active boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_app_supervisor() then
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
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors can manage terminal users';
  end if;
  delete from public.app_users a where lower(a.user_id) = lower(trim(p_user_id));
end $$;
revoke all on function public.delete_terminal_user(text) from public;
grant execute on function public.delete_terminal_user(text) to authenticated, service_role;

notify pgrst, 'reload schema';
