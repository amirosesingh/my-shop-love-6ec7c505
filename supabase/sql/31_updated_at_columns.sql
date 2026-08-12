-- 31_updated_at_columns.sql
-- Adds the missing "last updated" stamps that the background sync polls on.
--
-- Without these columns the tills ask PostgREST for `updated_at > <time>` on
-- members, membership_tiers and promotions, get HTTP 400, and silently fall
-- back to created_at -- so edits to existing rows never reach a till.
--
-- Safe to re-run: nothing is dropped and no data is lost.

-- Shared trigger function (already present on most installs).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.members            ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.membership_tiers   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.promotions         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Existing rows: line the stamp up with when the row was created.
UPDATE public.members          SET updated_at = created_at WHERE updated_at < created_at;
UPDATE public.membership_tiers SET updated_at = created_at WHERE updated_at < created_at;
UPDATE public.promotions       SET updated_at = created_at WHERE updated_at < created_at;

DROP TRIGGER IF EXISTS set_members_updated_at ON public.members;
CREATE TRIGGER set_members_updated_at BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_membership_tiers_updated_at ON public.membership_tiers;
CREATE TRIGGER set_membership_tiers_updated_at BEFORE UPDATE ON public.membership_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_promotions_updated_at ON public.promotions;
CREATE TRIGGER set_promotions_updated_at BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Verification: all three should report a column and a trigger.
SELECT c.table_name,
       (SELECT count(*) FROM information_schema.columns x
         WHERE x.table_schema = 'public' AND x.table_name = c.table_name
           AND x.column_name = 'updated_at') AS has_column,
       (SELECT count(*) FROM pg_trigger t
         WHERE t.tgrelid = ('public.' || c.table_name)::regclass AND NOT t.tgisinternal) AS triggers
FROM (VALUES ('members'), ('membership_tiers'), ('promotions')) AS c(table_name);