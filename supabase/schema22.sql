-- ============================================================================
-- Schema 22 — voucher lifecycle: disable / re-enable, full event trail
-- Safe to run more than once.
-- ============================================================================

alter table public.issued_vouchers
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by text,
  add column if not exists disable_reason text;

-- Widen the status check so DISABLED is a first-class state.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.issued_vouchers'::regclass
      and conname = 'issued_vouchers_status_check'
  ) then
    alter table public.issued_vouchers drop constraint issued_vouchers_status_check;
  end if;
end $$;

alter table public.issued_vouchers
  add constraint issued_vouchers_status_check
  check (status in ('ISSUED', 'REDEEMED', 'EXPIRED', 'DISABLED'));

-- Widen the event trail so disable / re-enable are recorded too.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.coupon_events'::regclass
      and conname = 'coupon_events_event_type_check'
  ) then
    alter table public.coupon_events drop constraint coupon_events_event_type_check;
  end if;
end $$;

alter table public.coupon_events
  add constraint coupon_events_event_type_check
  check (event_type in ('CLAIMED', 'ISSUED_MANUAL', 'REDEEMED', 'BLOCKED', 'DISABLED', 'REENABLED'));

/**
 * Backoffice: switch a voucher between ISSUED and DISABLED.
 * Used vouchers can never be re-opened. Every change writes a coupon event so
 * the audit trail always explains why a voucher stopped working.
 */
create or replace function public.voucher_set_status(
  _token text,
  _status text,
  _reason text default null,
  _staff text default null,
  _role text default null,
  _store text default null
)
returns public.issued_vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  _v public.issued_vouchers;
  _c public.coupon_campaigns;
begin
  if _status not in ('ISSUED', 'DISABLED') then
    raise exception 'VOUCHER_STATUS_INVALID';
  end if;

  select * into _v from public.issued_vouchers where token_slug = _token for update;
  if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
  if _v.status = 'REDEEMED' then raise exception 'VOUCHER_ALREADY_REDEEMED'; end if;

  select * into _c from public.coupon_campaigns where id = _v.campaign_id;

  update public.issued_vouchers
  set status = _status,
      disabled_at = case when _status = 'DISABLED' then now() else null end,
      disabled_by = case when _status = 'DISABLED' then _staff else null end,
      disable_reason = case when _status = 'DISABLED' then _reason else null end
  where id = _v.id
  returning * into _v;

  perform public.coupon_log(
    case when _status = 'DISABLED' then 'DISABLED' else 'REENABLED' end,
    _c, _token, _v.member_id, null, _store, null, _staff, _role, null,
    coalesce(_reason, case when _status = 'DISABLED' then 'Disabled from backoffice'
                           else 'Re-enabled from backoffice' end)
  );

  return _v;
end;
$$;

/** Redemption now refuses disabled vouchers with a clear reason. */
create or replace function public.voucher_redeem(
  _token text,
  _sale_id text default null,
  _store_id text default null,
  _staff text default null
)
returns public.issued_vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  _v public.issued_vouchers;
  _c public.coupon_campaigns;
  _deadline timestamptz;
begin
  select * into _v from public.issued_vouchers where token_slug = _token for update;
  if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
  if _v.status = 'REDEEMED' then raise exception 'VOUCHER_ALREADY_REDEEMED'; end if;

  select * into _c from public.coupon_campaigns where id = _v.campaign_id;

  if _v.status = 'DISABLED' then
    perform public.coupon_log('BLOCKED', _c, _token, _v.member_id, null, _store_id, null, _staff,
      null, _sale_id, 'Disabled voucher presented');
    raise exception 'VOUCHER_DISABLED';
  end if;

  -- A voucher's own expiry wins over the campaign window when it is set.
  _deadline := coalesce(_v.expires_at, _c.expires_at);
  if _deadline is not null and now() > _deadline then
    update public.issued_vouchers set status = 'EXPIRED' where id = _v.id;
    perform public.coupon_log('BLOCKED', _c, _token, _v.member_id, null, _store_id, null, _staff,
      null, _sale_id, 'Expired voucher presented');
    raise exception 'VOUCHER_EXPIRED';
  end if;

  update public.issued_vouchers
  set status = 'REDEEMED',
      redeemed_at = now(),
      redeemed_by = _staff,
      redeemed_sale_id = _sale_id,
      store_id = _store_id
  where id = _v.id
  returning * into _v;

  perform public.coupon_log('REDEEMED', _c, _token, _v.member_id, null, _store_id, null, _staff,
    null, _sale_id);

  return _v;
end;
$$;

grant execute on function public.voucher_set_status(text, text, text, text, text, text) to authenticated;
grant execute on function public.voucher_redeem(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';