ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS closing_float numeric,
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.shifts SET status = CASE WHEN closed_at IS NULL THEN 'OPEN' ELSE 'CLOSED' END;

ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_status_check CHECK (status IN ('OPEN','CLOSED'));

CREATE OR REPLACE FUNCTION public.shifts_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL THEN
    NEW.status := 'CLOSED';
  ELSIF NEW.status = 'CLOSED' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  ELSE
    NEW.status := 'OPEN';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shifts_sync_status_trg ON public.shifts;
CREATE TRIGGER shifts_sync_status_trg
BEFORE INSERT OR UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.shifts_sync_status();

CREATE INDEX IF NOT EXISTS shifts_open_by_store_idx
  ON public.shifts (store_id, opened_at DESC)
  WHERE status = 'OPEN';