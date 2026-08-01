-- Master schema for the POS backend. Run this in your Supabase SQL editor.
-- Includes the full POS schema, app_users identity table and auth sync trigger.

create extension if not exists pgcrypto;

create table if not exists public.membership_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_percentage numeric not null default 0,
  points_multiplier numeric not null default 1.0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  name text not null,
  category text,
  sku text,
  cost_price numeric not null default 0,
  selling_price numeric not null default 0,
  ecom_price numeric,
  ecom_visible boolean not null default true,
  stock_quantity integer not null default 0,
  stock_by_store jsonb not null default '{}'::jsonb,
  reorder_level integer not null default 0,
  tax_rate numeric not null default 0,
  custom_points numeric,
  point_multiplier numeric not null default 1.0,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  member_code text not null unique,
  full_name text not null,
  phone text not null,
  email text,
  address text,
  date_of_birth date,
  tier_id uuid references public.membership_tiers(id),
  loyalty_points numeric not null default 0,
  total_spent numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  member_id uuid references public.members(id),
  store_id text,
  shift_id text,
  cashier_name text,
  subtotal_amount numeric not null default 0,
  total_amount numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  payment_type text not null default 'cash',
  points_earned numeric not null default 0,
  points_redeemed numeric not null default 0,
  is_exchange boolean not null default false,
  original_bill_number text,
  exchanged_to_bill_number text,
  exchange_credit numeric not null default 0,
  paid_amount numeric not null default 0,
  change_amount numeric not null default 0,
  is_refunded boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  unit_price numeric not null default 0,
  quantity integer not null default 1,
  discount_percent numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate numeric not null default 0,
  is_return boolean not null default false,
  is_foc boolean not null default false,
  promo_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null,
  supplier_name text,
  operator_name text,
  total_cost numeric not null default 0,
  total_items_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  barcode text,
  product_name text,
  cost_price numeric not null default 0,
  selling_price numeric not null default 0,
  quantity_received integer not null default 0,
  subtotal_cost numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  promo_type text not null,
  min_spend numeric not null default 0,
  discount_percent numeric not null default 0,
  discount_amount numeric not null default 0,
  foc_product_id uuid references public.products(id),
  points_per_dollar numeric not null default 1,
  tier_rates jsonb,
  is_active boolean not null default true,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.pos_settings (
  id integer primary key default 1,
  tax_percentage numeric not null default 0,
  enable_tax boolean not null default true,
  tax_mode text not null default 'exclusive',
  paper_size text not null default '80mm',
  header_text text,
  footer_text text,
  show_logo boolean not null default true,
  show_points boolean not null default true,
  show_barcode boolean not null default true,
  show_tax_details boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  action_category text not null,
  action_name text not null,
  target_module text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Profiles + role system (signed-in staff model).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

do $$ begin
  create type public.app_role as enum ('admin','manager','staff');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin','manager','staff')
  )
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that already exist.
insert into public.profiles (id, email)
select id, email from auth.users on conflict (id) do nothing;

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
drop policy if exists "Signed-in users can read profiles" on public.profiles;
create policy "Signed-in users can read profiles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists "Users read own roles" on public.user_roles;
create policy "Users read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
drop policy if exists "Admins manage roles" on public.user_roles;
create policy "Admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Grants + policies: signed-in users read, staff/manager/admin write.
do $$
declare t text;
begin
  foreach t in array array[
    'membership_tiers','products','members','sales','sale_items',
    'purchase_orders','purchase_order_items','promotions','pos_settings','audit_logs'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Public access" on public.%I', t);
    execute format('drop policy if exists "Signed-in staff can read" on public.%I', t);
    execute format('drop policy if exists "Staff can write" on public.%I', t);
    execute format(
      'create policy "Signed-in staff can read" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "Staff can write" on public.%I for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))', t);
  end loop;
end $$;

-- Bootstrap: make the first account an admin (run once, replace the email).
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users where email = 'you@example.com'
-- on conflict do nothing;

-- Baseline rows the app expects.
insert into public.membership_tiers (name, discount_percentage, points_multiplier)
values ('Bronze',0,1),('Silver',5,1.25),('Gold',10,1.5)
on conflict do nothing;

insert into public.pos_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- Terminal login: User ID + 4-digit PIN (bcrypt hashed)
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  user_code text not null unique,
  full_name text not null,
  role app_role not null default 'staff',
  store_id text,
  email text not null,
  pin_hash text not null,          -- bcrypt digest, never returned to clients
  auth_secret text not null,       -- backend sign-in secret, released only on a correct PIN
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No direct table access at all: every read/write goes through the
-- security-definer functions below, so pin_hash can never be selected.
revoke all on public.app_users from anon;
revoke all on public.app_users from authenticated;
grant all on public.app_users to service_role;
alter table public.app_users enable row level security;

-- Verify a terminal login. Hashing/compare happens inside the database.
create or replace function public.verify_terminal_pin(p_user_code text, p_pin text)
returns table (user_code text, full_name text, role app_role, store_id text, email text, auth_secret text)
language plpgsql security definer set search_path = public, extensions as $$
declare u public.app_users%rowtype;
begin
  select * into u from public.app_users
   where lower(app_users.user_code) = lower(trim(p_user_code)) and is_active;
  if not found then return; end if;
  if u.pin_hash <> crypt(p_pin, u.pin_hash) then return; end if;
  update public.app_users set last_login_at = now() where id = u.id;
  return query select u.user_code, u.full_name, u.role, u.store_id, u.email, u.auth_secret;
end $$;

revoke all on function public.verify_terminal_pin(text, text) from public;
grant execute on function public.verify_terminal_pin(text, text) to anon, authenticated;

-- Admin-only listing (never exposes pin_hash or auth_secret).
create or replace function public.list_terminal_users()
returns table (user_code text, full_name text, role app_role, store_id text, email text,
               is_active boolean, last_login_at timestamptz)
language sql security definer set search_path = public as $$
  select a.user_code, a.full_name, a.role, a.store_id, a.email, a.is_active, a.last_login_at
  from public.app_users a
  where public.has_role(auth.uid(),'admin')
  order by a.user_code
$$;

revoke all on function public.list_terminal_users() from public;
grant execute on function public.list_terminal_users() to authenticated;

-- Admin-only provisioning. The PIN arrives over TLS and is hashed here.
create or replace function public.upsert_terminal_user(
  p_user_code text, p_full_name text, p_role app_role, p_store_id text,
  p_email text, p_pin text, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only admins can manage terminal users';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;
  insert into public.app_users (user_code, full_name, role, store_id, email, pin_hash, auth_secret)
  values (trim(p_user_code), trim(p_full_name), p_role, nullif(trim(coalesce(p_store_id,'')),''),
          lower(trim(p_email)), crypt(p_pin, gen_salt('bf', 10)), p_password)
  on conflict (user_code) do update
    set full_name = excluded.full_name,
        role = excluded.role,
        store_id = excluded.store_id,
        email = excluded.email,
        pin_hash = excluded.pin_hash,
        auth_secret = excluded.auth_secret,
        updated_at = now();
end $$;

revoke all on function public.upsert_terminal_user(text, text, app_role, text, text, text, text) from public;
grant execute on function public.upsert_terminal_user(text, text, app_role, text, text, text, text) to authenticated;

create or replace function public.set_terminal_active(p_user_code text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only admins can manage terminal users';
  end if;
  update public.app_users set is_active = p_active, updated_at = now()
   where lower(user_code) = lower(trim(p_user_code));
end $$;

revoke all on function public.set_terminal_active(text, boolean) from public;
grant execute on function public.set_terminal_active(text, boolean) to authenticated;

create or replace function public.delete_terminal_user(p_user_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only admins can manage terminal users';
  end if;
  delete from public.app_users where lower(user_code) = lower(trim(p_user_code));
end $$;

revoke all on function public.delete_terminal_user(text) from public;
grant execute on function public.delete_terminal_user(text) to authenticated;

-- ============================================================================
-- App users: identity, role and per-cashier permission toggles
-- ============================================================================

-- Permission toggles consumed by the POS UI.
alter table public.app_users
  add column if not exists permissions jsonb not null default jsonb_build_object(
    'financials', false,
    'products', false,
    'ecommerce', false,
    'can_give_discount', false,
    'can_refund', false,
    'can_open_drawer_manual', false
  ),
  add column if not exists auth_user_id uuid;

create unique index if not exists app_users_auth_user_id_key
  on public.app_users (auth_user_id) where auth_user_id is not null;

-- Keep public.app_users in sync with Supabase Authentication accounts.
create or replace function public.sync_auth_user_to_public()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'user_id'), ''),
                          split_part(new.email, '@', 1));
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), v_code);
  v_meta_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', 'cashier'));
  v_role app_role := case v_meta_role
                       when 'admin' then 'admin'::app_role
                       when 'supervisor' then 'manager'::app_role
                       when 'manager' then 'manager'::app_role
                       else 'staff'::app_role
                     end;
  v_store text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_id', '')), '');
  v_perms jsonb := case when v_role in ('admin','manager')
    then jsonb_build_object('financials', true, 'products', true, 'ecommerce', true,
                            'can_give_discount', true, 'can_refund', true,
                            'can_open_drawer_manual', true)
    else jsonb_build_object('financials', false, 'products', false, 'ecommerce', false,
                            'can_give_discount', false, 'can_refund', false,
                            'can_open_drawer_manual', false)
  end;
begin
  insert into public.app_users
    (user_code, full_name, role, store_id, email, pin_hash, auth_secret, permissions, auth_user_id)
  values (v_code, v_name, v_role, v_store, lower(new.email), '', '', v_perms, new.id)
  on conflict (user_code) do update
    set full_name    = excluded.full_name,
        role         = excluded.role,
        store_id     = coalesce(excluded.store_id, public.app_users.store_id),
        email        = excluded.email,
        auth_user_id = excluded.auth_user_id,
        updated_at   = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_auth_user_to_public();

-- The signed-in account's own profile + permissions (no secrets exposed).
create or replace function public.current_app_user()
returns table (user_code text, full_name text, role app_role, store_id text,
               email text, permissions jsonb, is_active boolean)
language sql stable security definer set search_path = public as $$
  select a.user_code, a.full_name, a.role, a.store_id, a.email, a.permissions, a.is_active
  from public.app_users a
  where a.auth_user_id = auth.uid()
     or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

revoke all on function public.current_app_user() from public;
grant execute on function public.current_app_user() to authenticated;

-- Admin/manager listing including permission toggles.
create or replace function public.list_app_users()
returns table (user_code text, full_name text, role app_role, store_id text, email text,
               permissions jsonb, is_active boolean, last_login_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.user_code, a.full_name, a.role, a.store_id, a.email, a.permissions,
         a.is_active, a.last_login_at
  from public.app_users a
  where public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')
  order by a.user_code
$$;

revoke all on function public.list_app_users() from public;
grant execute on function public.list_app_users() to authenticated;

-- Supervisors toggle permissions for a cashier.
create or replace function public.set_app_user_permissions(p_user_code text, p_permissions jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can change permissions';
  end if;
  update public.app_users
     set permissions = coalesce(permissions, '{}'::jsonb) || p_permissions,
         updated_at = now()
   where lower(user_code) = lower(trim(p_user_code));
end $$;

revoke all on function public.set_app_user_permissions(text, jsonb) from public;
grant execute on function public.set_app_user_permissions(text, jsonb) to authenticated;
