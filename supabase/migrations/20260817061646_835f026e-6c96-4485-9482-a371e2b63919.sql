ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'store',
  ADD COLUMN IF NOT EXISTS parent_id text,
  ADD COLUMN IF NOT EXISTS is_central boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS building_name text,
  ADD COLUMN IF NOT EXISTS floor_label text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_parent_id_fkey'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_location_type_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_location_type_check
      CHECK (location_type IN ('store','main_building','sub_warehouse','central_warehouse'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stores_parent_id_idx ON public.stores(parent_id);
CREATE INDEX IF NOT EXISTS stores_is_active_idx ON public.stores(is_active);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS store_name_snapshot text,
  ADD COLUMN IF NOT EXISTS store_address_snapshot text;

CREATE OR REPLACE FUNCTION public.stores_hierarchy_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  walker text;
  hops int := 0;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A location cannot be its own parent';
    END IF;
    walker := NEW.parent_id;
    WHILE walker IS NOT NULL AND hops < 50 LOOP
      SELECT parent_id INTO walker FROM public.stores WHERE id = walker;
      IF walker = NEW.id THEN
        RAISE EXCEPTION 'Locations cannot be nested in a loop';
      END IF;
      hops := hops + 1;
    END LOOP;
  END IF;

  IF NEW.is_active = false AND (TG_OP = 'INSERT' OR OLD.is_active = true) THEN
    IF EXISTS (SELECT 1 FROM public.stores c WHERE c.parent_id = NEW.id AND c.is_active) THEN
      RAISE EXCEPTION 'Archive the sub-locations of this location first';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE COALESCE((p.stock_by_store ->> NEW.id)::numeric, 0) > 0
    ) THEN
      RAISE EXCEPTION 'This location still holds stock — transfer it out before archiving';
    END IF;
    NEW.archived_at := COALESCE(NEW.archived_at, now());
  END IF;

  IF NEW.is_active = true THEN
    NEW.archived_at := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stores_hierarchy_guard_trg ON public.stores;
CREATE TRIGGER stores_hierarchy_guard_trg
BEFORE INSERT OR UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.stores_hierarchy_guard();