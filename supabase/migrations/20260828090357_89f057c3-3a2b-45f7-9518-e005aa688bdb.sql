CREATE TABLE IF NOT EXISTS public.stock_count_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id TEXT,
  terminal_id TEXT,
  staff_id TEXT,
  staff_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  reason TEXT,
  note TEXT NOT NULL DEFAULT '',
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  line_count INTEGER NOT NULL DEFAULT 0,
  total_impact NUMERIC(18,4) NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ,
  posted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_drafts TO authenticated;
GRANT ALL ON public.stock_count_drafts TO service_role;

ALTER TABLE public.stock_count_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch staff read stock count drafts"
  ON public.stock_count_drafts FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff create stock count drafts"
  ON public.stock_count_drafts FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff update stock count drafts"
  ON public.stock_count_drafts FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id))
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff delete stock count drafts"
  ON public.stock_count_drafts FOR DELETE TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE INDEX IF NOT EXISTS stock_count_drafts_store_idx
  ON public.stock_count_drafts (store_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS update_stock_count_drafts_updated_at ON public.stock_count_drafts;
CREATE TRIGGER update_stock_count_drafts_updated_at
  BEFORE UPDATE ON public.stock_count_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS draft_id UUID;