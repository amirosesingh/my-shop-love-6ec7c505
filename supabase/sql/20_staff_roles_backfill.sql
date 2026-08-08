-- ============================================================
-- 20_staff_roles_backfill.sql — keep sign-in identity and the staff list aligned
-- ============================================================
-- Run once on the POS database when a signed-in admin or supervisor is refused
-- (403 / "permission denied") while saving locations, products or settings.
--
-- The access rules on those tables ask `is_staff(auth.uid())`, which reads the
-- `user_roles` table. A staff member created only in `app_users` has no row
-- there, so the database treats them as a visitor. This script copies the role
-- across for every active account that is linked to a sign-in, and is safe to
-- re-run.
-- ============================================================

INSERT INTO public.user_roles (user_id, role)
SELECT a.auth_user_id, a.role
  FROM public.app_users a
 WHERE a.auth_user_id IS NOT NULL
   AND a.is_active
ON CONFLICT (user_id, role) DO NOTHING;

-- Link any staff record that was created by e-mail before the account existed.
UPDATE public.app_users a
   SET auth_user_id = u.id,
       updated_at   = now()
  FROM auth.users u
 WHERE a.auth_user_id IS NULL
   AND lower(a.email) = lower(u.email);

-- Second pass for the records just linked above.
INSERT INTO public.user_roles (user_id, role)
SELECT a.auth_user_id, a.role
  FROM public.app_users a
 WHERE a.auth_user_id IS NOT NULL
   AND a.is_active
ON CONFLICT (user_id, role) DO NOTHING;

-- Review the result: every active staff account should show a matching role.
-- SELECT a.user_id, a.email, a.role, r.role AS granted
--   FROM public.app_users a
--   LEFT JOIN public.user_roles r
--     ON r.user_id = a.auth_user_id AND r.role = a.role
--  WHERE a.is_active
--  ORDER BY a.user_id;