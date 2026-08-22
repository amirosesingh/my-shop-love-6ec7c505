You do NOT need to run any SQL file on the current Lovable Cloud backend if you are using the managed database. The two migrations below have already been applied to your live Supabase project during the previous fix (version 1.3.28). Running them again is safe because they are idempotent, but unnecessary.

You only need to run these files if:
- You have a self-hosted / separate PostgreSQL instance that mirrors the cloud schema, or
- You reset/rebuild the cloud database and need to restore the fix, or
- You are running the desktop (Electron) app with its own offline SQL Server/SQLite that uses a different schema update path.

## Files to run, in order

### 1. Branch-less till account fix (already applied)
`supabase/migrations/20260822062130_688b7b9c-b5e0-43f0-9d72-404a0581252d.sql`

```sql
CREATE OR REPLACE FUNCTION public.app_users_require_store() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- A blank branch means "works at every branch"; the terminal supplies the
  -- branch at sign-in. Normalise empty strings so the checks stay simple.
  IF NEW.store_id IS NOT NULL AND btrim(NEW.store_id) = '' THEN
    NEW.store_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_store_access(_store_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN _store_id IS NULL THEN public.is_staff_now()
    WHEN public.is_app_supervisor() THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = (SELECT auth.uid())
        AND u.is_active
        AND (u.store_id = _store_id
             OR nullif(btrim(coalesce(u.store_id, '')), '') IS NULL)
    )
  END
$$;
```

This removes the hard requirement that every cashier/warehouse account must have a branch, so **"All branches" = NULL in the database** works again.

### 2. Real-time sync on settings tables (already applied)
`supabase/migrations/20260822055555_cf02db7c-90df-4c4a-8265-d7e4892c16c8.sql`

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_users','staff_roles','stores','pos_settings','pos_store_settings'] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
```

This enables the live broadcast of staff/branch/settings changes so the desktop app can push them to your local SQL Server immediately.

## How to confirm it is already live

If you want to be sure the cloud database already has the fix, run the following query in the SQL editor (or psql):

```sql
SELECT proname, prosrc
FROM pg_proc
WHERE proname IN ('app_users_require_store', 'user_has_store_access');
```

You should see the `app_users_require_store` body only contains the empty-string normalisation block (no `RAISE EXCEPTION` for missing store_id) and `user_has_store_access` checks for `store_id IS NULL`.

## For offline / desktop SQL Server or SQLite

If you are using the Electron app with a local SQL Server or SQLite mirror, those use a separate migration path. The relevant files are:

- SQL Server: `db/offline/migrations/20260822_0101_app_users.sql`
- SQLite: `electron/db/migrations/0101_app_users.sql`

Run them in the SQL Server Management Studio or SQLite command line on the local machine, in numeric order. They are also idempotent.