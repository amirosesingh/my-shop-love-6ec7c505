CREATE OR REPLACE FUNCTION public.settings_private_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT au.user_id FROM public.app_users au WHERE au.auth_user_id = auth.uid() LIMIT 1),
    auth.uid()::text,
    ''
  )
$function$;

DROP POLICY IF EXISTS "settings_overrides_private" ON public.settings_overrides;
CREATE POLICY "settings_overrides_private" ON public.settings_overrides
  FOR ALL TO authenticated
  USING (scope = 'PRIVATE' AND scope_id = public.settings_private_key())
  WITH CHECK (scope = 'PRIVATE' AND scope_id = public.settings_private_key());

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS product_group text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS technician text,
  ADD COLUMN IF NOT EXISTS liability_accepted boolean NOT NULL DEFAULT false;