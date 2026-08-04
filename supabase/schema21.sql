-- ============================================================================
-- Schema 21 — operational switches on pos_settings + manual welcome coupons
-- Safe to run more than once.
-- ============================================================================

alter table public.pos_settings
  add column if not exists integration_settings jsonb not null default '{}'::jsonb;

/**
 * Welcome coupon on signup is now opt-in. The admin toggle lives in
 * pos_settings.integration_settings->>'autoIssueWelcome'; when it is off the
 * member is still created, but no voucher is handed out.
 */
create or replace function public.member_welcome_claim(
  _phone text,
  _full_name text,
  _email text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _slug text;
  _auto boolean;
begin
  perform public.member_join(_phone, _full_name, _email);

  select coalesce((integration_settings->>'autoIssueWelcome')::boolean, false)
    into _auto
  from public.pos_settings
  where id = 1;

  if coalesce(_auto, false) is not true then
    return null;
  end if;

  select slug into _slug
  from public.coupon_campaigns c
  where c.is_welcome and public.campaign_is_live(c)
  order by c.created_at desc
  limit 1;

  if _slug is null then return null; end if;
  return public.coupon_claim(_slug, _phone, _full_name, _email);
end;
$$;

grant execute on function public.member_welcome_claim(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
