-- ---------------------------------------------------------------------------
-- 20260902010000_schema_inventory_deep.sql   (CENTRAL SERVER — PostgreSQL)
--
-- Feature: Phase 4 — deep database health check.
-- Adds a READ-ONLY inventory function the till's Schema manager calls through
-- the service relay. The PostgREST description document can only expose tables
-- and columns; this function also reports nullability, defaults, primary keys,
-- foreign keys, unique/check constraints, indexes, triggers, row-security
-- state and policies, which is what a real health check needs.
--
-- Nothing is modified. Safe to run repeatedly.
-- Run once in the central project's SQL editor, then re-check in the app.
-- ---------------------------------------------------------------------------

create or replace function public.schema_inventory_deep()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    jsonb_object_agg(t.relname, jsonb_build_object(
      'rls', t.relrowsecurity,
      'columns', coalesce((
        select jsonb_object_agg(a.attname, jsonb_build_object(
          'type', format_type(a.atttypid, a.atttypmod),
          'nullable', not a.attnotnull,
          'default', pg_get_expr(d.adbin, d.adrelid)
        ))
        from pg_attribute a
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
      ), '{}'::jsonb),
      'constraints', coalesce((
        select jsonb_object_agg(c.conname, jsonb_build_object(
          'kind', c.contype::text,
          'definition', pg_get_constraintdef(c.oid)
        ))
        from pg_constraint c where c.conrelid = t.oid
      ), '{}'::jsonb),
      'indexes', coalesce((
        select jsonb_agg(i.indexname order by i.indexname)
        from pg_indexes i where i.schemaname = 'public' and i.tablename = t.relname
      ), '[]'::jsonb),
      'triggers', coalesce((
        select jsonb_agg(g.tgname order by g.tgname)
        from pg_trigger g where g.tgrelid = t.oid and not g.tgisinternal
      ), '[]'::jsonb),
      'policies', coalesce((
        select jsonb_agg(p.policyname order by p.policyname)
        from pg_policies p where p.schemaname = 'public' and p.tablename = t.relname
      ), '[]'::jsonb)
    )),
    '{}'::jsonb
  )
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relkind = 'r';
$$;

revoke all on function public.schema_inventory_deep() from public;
grant execute on function public.schema_inventory_deep() to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------- DOWN ----------------------------------
-- drop function if exists public.schema_inventory_deep();
-- ---------------------------------------------------------------------------
