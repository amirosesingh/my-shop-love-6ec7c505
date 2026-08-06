ALTER TABLE public.held_orders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.held_orders ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.held_orders ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.held_orders ALTER COLUMN member_id TYPE text USING member_id::text;