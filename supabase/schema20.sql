-- ============================================================================
-- schema20.sql — coupon audit trail, manual issuing, per-member caps and
-- voucher-level expiry. Safe to run repeatedly on an existing POS database.
-- Requires schema19.sql.
-- ============================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------- new columns
alter table public.coupon_campaigns
  add column if not exists max_per_member integer default 1;

alter table public.issued_vouchers
  add column if not exists expires_at timestamptz,
  add column if not exists issued_by text,
  add column if not exists issued_source text not null default 'PUBLIC';

-- The old rule allowed exactly one voucher per member; caps are counted now.
drop index if exists issued_vouchers_one_per_member;
create index if not exists issued_vouchers_campaign_member_idx
  on public.issued_vouchers (campaign_id, member_id);

-- ------------------------------------------------------------- audit trail
create table if not exists public.coupon_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('CLAIMED', 'ISSUED_MANUAL', 'REDEEMED', 'BLOCKED')),
  campaign_id uuid references public.coupon_campaigns(id) on delete cascade,
  campaign_name text,
  voucher_token text,
  member_id uuid references public.members(id) on delete set null,
  member_phone text,
  store_id text,
  terminal_id text,
  staff_name text,
  staff_role text,
  sale_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists coupon_events_campaign_idx on public.coupon_events (campaign_id);
create index if not exists coupon_events_created_idx on public.coupon_events (created_at desc);

grant select on public.coupon_events to authenticated;
grant insert on public.coupon_events to anon, authenticated;

alter table public.coupon_events enable row level security;

do $$ begin
  begin
    create policy "coupon events readable by staff" on public.coupon_events
      for select to authenticated using (true);
  exception when duplicate_object then null; end;
  begin
    create policy "coupon events append only" on public.coupon_events
      for insert to anon, authenticated with check (true);
  exception when duplicate_object then null; end;
end $$;

-- Append-only: block edits and deletes outright.
create or replace function public.coupon_events_readonly()
returns trigger language plpgsql as $$
begin
  raise exception 'coupon_events is append-only';
end;
$$;

drop trigger if exists coupon_events_no_change on public.coupon_events;
create trigger coupon_events_no_change
  before update or delete on public.coupon_events
  for each row execute function public.coupon_events_readonly();

create or replace function public.coupon_log(
  _type text,
  _campaign public.coupon_campaigns,
  _token text default null,
  _member uuid default null,
  _phone text default null,
  _store text default null,
  _terminal text default null,
  _staff text default null,
  _role text default null,
  _sale text default null,
  _note text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.coupon_events (
    event_type, campaign_id, campaign_name, voucher_token, member_id, member_phone,
    store_id, terminal_id, staff_name, staff_role, sale_id, note
  ) values (
    _type, _campaign.id, _campaign.name, _token, _member, _phone,
    _store, _terminal, _staff, _role, _sale, _note
  );
$$;

-- ------------------------------------------------------ claim with a cap
create or replace function public.coupon_claim(
  _slug text,
  _phone text,
  _full_name text default null,
  _email text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _c public.coupon_campaigns;
  _member uuid;
  _token text;
  _held integer;
begin
  select * into _c from public.coupon_campaigns where slug = _slug for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not _c.is_active then raise exception 'CAMPAIGN_INACTIVE'; end if;
  if _c.starts_at is not null and now() < _c.starts_at then raise exception 'CAMPAIGN_NOT_STARTED'; end if;
  if _c.expires_at is not null and now() > _c.expires_at then raise exception 'CAMPAIGN_EXPIRED'; end if;

  _member := public.member_join(_phone, _full_name, _email);

  select count(*) into _held
  from public.issued_vouchers
  where campaign_id = _c.id and member_id = _member;

  -- Hand back an unused voucher instead of issuing a duplicate.
  select token_slug into _token
  from public.issued_vouchers
  where campaign_id = _c.id and member_id = _member and status = 'ISSUED'
  order by issued_at desc
  limit 1;
  if _token is not null then return _token; end if;

  if _c.max_per_member is not null and _held >= _c.max_per_member then
    perform public.coupon_log('BLOCKED', _c, null, _member, _phone, null, null, null, null, null,
      'Per-member limit reached');
    raise exception 'MEMBER_LIMIT_REACHED';
  end if;

  if _c.max_claims is not null and _c.claims_count >= _c.max_claims then
    perform public.coupon_log('BLOCKED', _c, null, _member, _phone, null, null, null, null, null,
      'Campaign fully claimed');
    raise exception 'CAMPAIGN_FULLY_CLAIMED';
  end if;

  _token := public.voucher_token();
  insert into public.issued_vouchers (token_slug, campaign_id, member_id, issued_source)
  values (_token, _c.id, _member, 'PUBLIC');

  update public.coupon_campaigns set claims_count = claims_count + 1 where id = _c.id;

  perform public.coupon_log('CLAIMED', _c, _token, _member, _phone);

  return _token;
end;
$$;

-- ------------------------------------------------- backoffice manual issue
create or replace function public.coupon_issue_manual(
  _slug text,
  _phone text,
  _full_name text default null,
  _expires_at timestamptz default null,
  _staff text default null,
  _role text default null,
  _store text default null,
  _ignore_limit boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _c public.coupon_campaigns;
  _member uuid;
  _token text;
  _held integer;
begin
  select * into _c from public.coupon_campaigns where slug = _slug for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;

  _member := public.member_join(_phone, _full_name, null);

  select count(*) into _held
  from public.issued_vouchers
  where campaign_id = _c.id and member_id = _member;

  if not _ignore_limit
     and _c.max_per_member is not null
     and _held >= _c.max_per_member then
    perform public.coupon_log('BLOCKED', _c, null, _member, _phone, _store, null, _staff, _role, null,
      'Manual issue blocked by per-member limit');
    raise exception 'MEMBER_LIMIT_REACHED';
  end if;

  _token := public.voucher_token();
  insert into public.issued_vouchers
    (token_slug, campaign_id, member_id, expires_at, issued_by, issued_source)
  values (_token, _c.id, _member, _expires_at, _staff, 'MANUAL');

  update public.coupon_campaigns set claims_count = claims_count + 1 where id = _c.id;

  perform public.coupon_log('ISSUED_MANUAL', _c, _token, _member, _phone, _store, null, _staff, _role,
    null, case when _expires_at is null then null else 'Custom expiry' end);

  return _token;
end;
$$;

-- ------------------------------------------------------------- redemption
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

grant execute on function public.coupon_log(text, public.coupon_campaigns, text, uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.coupon_claim(text, text, text, text) to anon, authenticated;
grant execute on function public.coupon_issue_manual(text, text, text, timestamptz, text, text, text, boolean) to authenticated;
grant execute on function public.voucher_redeem(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
