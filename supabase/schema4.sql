-- ---------------------------------------------------------------------------
-- FIX: Authentication signup fails with "Database error saving new user"
--
-- Staff Management already creates the Auth account first and then calls
-- upsert_terminal_user() to persist the POS profile.  The optional Auth sync
-- trigger must therefore never roll back creation of an Auth account when an
-- older app_users layout, constraint, or stale function is still installed.
--
-- This replaces only the public trigger function.  The existing
-- on_auth_user_created trigger will automatically use this new definition.
-- Safe to re-run.
-- ---------------------------------------------------------------------------

create or replace function public.sync_auth_user_to_public()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'user_id'), ''),
    split_part(coalesce(new.email, new.id::text), '@', 1)
  );
  v_full_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    v_user_id
  );
  v_role public.app_role := case lower(coalesce(new.raw_user_meta_data ->> 'role', 'cashier'))
    when 'admin' then 'admin'::public.app_role
    when 'supervisor' then 'manager'::public.app_role
    when 'manager' then 'manager'::public.app_role
    else 'staff'::public.app_role
  end;
  v_store_id text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_id', '')), '');
begin
  begin
    insert into public.app_users
      (user_id, full_name, email, role, store_id, auth_user_id)
    values
      (v_user_id, v_full_name, lower(coalesce(new.email, '')), v_role, v_store_id, new.id)
    on conflict (user_id) do update
      set full_name    = excluded.full_name,
          email        = excluded.email,
          role         = excluded.role,
          store_id     = coalesce(excluded.store_id, public.app_users.store_id),
          auth_user_id = excluded.auth_user_id,
          updated_at   = now();
  exception
    when unique_violation then
      -- A legacy row may already own the same email under another user_id.
      update public.app_users
         set auth_user_id = new.id,
             full_name = v_full_name,
             role = v_role,
             store_id = coalesce(v_store_id, store_id),
             updated_at = now()
       where lower(email) = lower(coalesce(new.email, ''));
    when others then
      -- Auth account creation must not be rolled back by optional profile sync.
      -- Staff Management follows signup with upsert_terminal_user(), which
      -- reports any profile-specific error to the signed-in administrator.
      raise warning 'app_users sync skipped for auth user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

notify pgrst, 'reload schema';