ALTER TABLE public.stock_count_drafts
  ALTER COLUMN lines TYPE TEXT USING lines::text;

ALTER TABLE public.stock_count_drafts
  ALTER COLUMN lines SET DEFAULT '[]';