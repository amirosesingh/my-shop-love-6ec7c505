-- Run once on your own POS Supabase project (SQL editor) to fix
-- "permission denied for function is_staff_now" and refused saves.

-- 1. Signed-in staff must be able to run the access-rule helpers.
grant execute on function public.is_staff_now()            to authenticated, service_role;
grant execute on function public.is_supervisor_now()       to authenticated, service_role;
grant execute on function public.is_app_supervisor()       to authenticated, service_role;
grant execute on function public.has_perm(text)            to authenticated, service_role;
grant execute on function public.store_visible(text)       to authenticated, service_role;
grant execute on function public.user_store_id()           to authenticated, service_role;
grant execute on function public.user_cluster_id()         to authenticated, service_role;
grant execute on function public.current_app_user()        to authenticated, service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.campaign_is_live(public.coupon_campaigns) to anon, authenticated, service_role;

-- 2. Data API grants for every public table that has none.
do $$
declare t record; ok boolean;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname = 'public'
  loop
    select exists (
      select 1 from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public' and table_name = t.relname
        and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
    ) into ok;
    if not ok then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t.relname);
    end if;

    select exists (
      select 1 from information_schema.role_table_grants
      where grantee = 'service_role' and table_schema = 'public' and table_name = t.relname
        and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
    ) into ok;
    if not ok then
      execute format('grant all on public.%I to service_role', t.relname);
    end if;
  end loop;
end $$;

-- 3. Sequences used by those tables.
grant usage, select on all sequences in schema public to authenticated, service_role;
