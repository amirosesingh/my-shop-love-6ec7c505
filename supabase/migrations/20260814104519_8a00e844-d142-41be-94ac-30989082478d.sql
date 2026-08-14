ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'category';

ALTER TABLE public.product_categories
  DROP CONSTRAINT IF EXISTS product_categories_kind_check;

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_kind_check
  CHECK (kind IN ('category','group','sub'));

-- Flatten the old three-level tree into three independent lists.
WITH lvl AS (
  SELECT c.id,
         CASE
           WHEN c.parent_id IS NULL THEN 'category'
           WHEN p.parent_id IS NULL THEN 'group'
           ELSE 'sub'
         END AS kind
  FROM public.product_categories c
  LEFT JOIN public.product_categories p ON p.id = c.parent_id
)
UPDATE public.product_categories t
SET kind = lvl.kind, parent_id = NULL
FROM lvl
WHERE lvl.id = t.id;