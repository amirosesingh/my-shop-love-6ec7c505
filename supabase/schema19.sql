-- ============================================================================
-- schema19.sql — coupon campaigns, issued vouchers and public member join.
-- Safe to run repeatedly on an existing POS database.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- campaigns
create table if not exists public.coupon_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  discount_type text not null default 'PERCENTAGE'
    check (discount_type in ('PERCENTAGE', 'FIXED_AMOUNT')),
  discount_value numeric not null default 0,
  scope text not null default 'BILL' check (scope in ('BILL', 'CATEGORY', 'PRODUCT')),
  scope_value text,
  max_claims integer,
  claims_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  is_welcome boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- vouchers
create table if not exists public.issued_vouchers (
  id uuid primary key default gen_random_uuid(),
  token_slug text not null unique,
  campaign_id uuid not null references public.coupon_campaigns(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  status text not null default 'ISSUED' check (status in ('ISSUED', 'REDEEMED', 'EXPIRED')),
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by text,
  redeemed_sale_id text,
  store_id text
);

create unique index if not exists issued_vouchers_one_per_member
  on public.issued_vouchers (campaign_id, member_id)
  where member_id is not null;

create index if not exists issued_vouchers_member_idx on public.issued_vouchers (member_id);

grant select, insert, update, delete on public.coupon_campaigns to authenticated;
grant select, insert, update, delete on public.issued_vouchers to authenticated;
grant select on public.coupon_campaigns to anon;
grant select on public.issued_vouchers to anon;

alter table public.coupon_campaigns enable row level security;
alter table public.issued_vouchers enable row level security;

do $$ begin
  begin
    create policy "campaigns readable" on public.coupon_campaigns for select using (true);
  exception when duplicate_object then null; end;
  begin
    create policy "campaigns managed by staff" on public.coupon_campaigns
      for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end;
  begin
    create policy "vouchers readable" on public.issued_vouchers for select using (true);
  exception when duplicate_object then null; end;
  begin
    create policy "vouchers managed by staff" on public.issued_vouchers
      for all to authenticated using (true) with check (true);
  exception when duplicate_object then null; end;
end $$;

drop trigger if exists coupon_campaigns_set_updated_at on public.coupon_campaigns;
create trigger coupon_campaigns_set_updated_at
  before update on public.coupon_campaigns
  for each row execute function public.update_updated_at_column();

-- --------------------------------------------------------------- helpers
create or replace function public.normalize_phone(_phone text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g')
$$;

create or replace function public.voucher_token()
returns text language sql volatile as $$
  select 'vch_' || substr(replace(encode(gen_random_bytes(8), 'hex'), '-', ''), 1, 10)
$$;

/**
 * Find (or create) a member by phone and hand back the member row id.
 * Used by the public /join and /claim pages, so it runs as the table owner.
 */
create or replace function public.member_join(
  _phone text,
  _full_name text,
  _email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _digits text := public.normalize_phone(_phone);
  _id uuid;
  _code text;
begin
  if length(_digits) < 6 then
    raise exception 'A valid mobile number is required';
  end if;

  select id into _id
  from public.members
  where public.normalize_phone(phone) = _digits
  limit 1;

  if _id is not null then
    if coalesce(_email, '') <> '' then
      update public.members set email = _email where id = _id and coalesce(email, '') = '';
    end if;
    return _id;
  end if;

  if coalesce(trim(_full_name), '') = '' then
    raise exception 'NEW_MEMBER_NAME_REQUIRED';
  end if;

  _code := 'M' || to_char(now(), 'YYMMDD') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  insert into public.members (member_code, full_name, phone, email, loyalty_points, total_spent)
  values (_code, trim(_full_name), _phone, nullif(_email, ''), 0, 0)
  returning id into _id;

  return _id;
end;
$$;

/** Campaign is live when it is on, inside its window and under its claim cap. */
create or replace function public.campaign_is_live(_c public.coupon_campaigns)
returns boolean language sql stable as $$
  select _c.is_active
    and (_c.starts_at is null or now() >= _c.starts_at)
    and (_c.expires_at is null or now() <= _c.expires_at)
    and (_c.max_claims is null or _c.claims_count < _c.max_claims)
$$;

/**
 * Claim a campaign: find/create the member, then issue (or return) that
 * member's single voucher for the campaign. Returns the token slug.
 */
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
begin
  select * into _c from public.coupon_campaigns where slug = _slug for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not _c.is_active then raise exception 'CAMPAIGN_INACTIVE'; end if;
  if _c.starts_at is not null and now() < _c.starts_at then raise exception 'CAMPAIGN_NOT_STARTED'; end if;
  if _c.expires_at is not null and now() > _c.expires_at then raise exception 'CAMPAIGN_EXPIRED'; end if;

  _member := public.member_join(_phone, _full_name, _email);

  select token_slug into _token
  from public.issued_vouchers
  where campaign_id = _c.id and member_id = _member
  limit 1;
  if _token is not null then return _token; end if;

  if _c.max_claims is not null and _c.claims_count >= _c.max_claims then
    raise exception 'CAMPAIGN_FULLY_CLAIMED';
  end if;

  _token := public.voucher_token();
  insert into public.issued_vouchers (token_slug, campaign_id, member_id)
  values (_token, _c.id, _member);

  update public.coupon_campaigns set claims_count = claims_count + 1 where id = _c.id;

  return _token;
end;
$$;

/** Welcome reward for a brand-new signup; returns a token or null. */
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
begin
  perform public.member_join(_phone, _full_name, _email);

  select slug into _slug
  from public.coupon_campaigns c
  where c.is_welcome and public.campaign_is_live(c)
  order by c.created_at desc
  limit 1;

  if _slug is null then return null; end if;
  return public.coupon_claim(_slug, _phone, _full_name, _email);
end;
$$;

/** Atomic single-use lock. A second attempt on the same token fails. */
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
begin
  select * into _v from public.issued_vouchers where token_slug = _token for update;
  if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
  if _v.status = 'REDEEMED' then raise exception 'VOUCHER_ALREADY_REDEEMED'; end if;

  select * into _c from public.coupon_campaigns where id = _v.campaign_id;
  if _c.expires_at is not null and now() > _c.expires_at then
    update public.issued_vouchers set status = 'EXPIRED' where id = _v.id;
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

  return _v;
end;
$$;

grant execute on function public.member_join(text, text, text) to anon, authenticated;
grant execute on function public.coupon_claim(text, text, text, text) to anon, authenticated;
grant execute on function public.member_welcome_claim(text, text, text) to anon, authenticated;
grant execute on function public.voucher_redeem(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
