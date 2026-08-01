-- ============================================================================
-- Northwind POS — schema_final.sql
--
-- THIS IS THE ONLY SCRIPT YOU NEED TO RUN. It fully replaces schema.sql,
-- schema2.sql, schema3.sql, schema4.sql and schema5.sql (kept only for
-- history). Idempotent: safe to run as many times as you like.
--
-- PIN hashing happens here, inside the database, using pgcrypto. Every call
-- is schema-qualified as extensions.crypt(...) / extensions.gen_salt(...)
-- because pgcrypto is installed in the `extensions` schema on Supabase.
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Fail fast and loudly if hashing is unavailable, instead of failing later
-- with a confusing "function gen_salt(unknown) does not exist".
do $$
declare v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';
  if v_schema is null then
    raise exception 'pgcrypto is not installed - PIN hashing cannot work. Install it first.';
  end if;
  if v_schema <> 'extensions' then
    raise notice 'pgcrypto lives in schema %, expected extensions', v_schema;
  end if;
  perform extensions.crypt('probe'::text, extensions.gen_salt('bf'::text, 10));
end $$;

-- Supervisor guard (re-created here so this script can run standalone)
-- ---------------------------------------------------------------------------
create or replace function public.is_app_supervisor()
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare ok boolean := false;
begin
  begin
    select exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin','manager')
    ) into ok;
  exception when undefined_table then ok := false;
  end;
  if ok then return true; end if;
  begin
    select exists (
      select 1 from public.app_users a
      where a.auth_user_id = auth.uid()
        and a.role::text in ('admin','manager','supervisor')
    ) into ok;
  exception when undefined_table or undefined_column then ok := false;
  end;
  return coalesce(ok, false);
end;
$$;


do $$ begin
  create type public.app_role as enum ('admin','manager','staff');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Core POS tables
-- ============================================================================

create table if not exists public.membership_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
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
  tier_id uuid references public.membership_tiers(id) on delete set null,
  loyalty_points numeric not null default 0,
  total_spent numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  member_id uuid references public.members(id) on delete set null,
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
  product_id uuid references public.products(id) on delete set null,
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
  product_id uuid references public.products(id) on delete set null,
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
  foc_product_id uuid references public.products(id) on delete set null,
  points_per_dollar numeric not null default 1,
  tier_rates jsonb default '{}'::jsonb,
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
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes used by the register lookups.
create index if not exists products_barcode_idx      on public.products (barcode);
create index if not exists products_name_idx         on public.products (lower(name));
create index if not exists members_phone_idx         on public.members (phone);
create index if not exists members_name_idx          on public.members (lower(full_name));
create index if not exists sales_bill_number_idx     on public.sales (bill_number);
create index if not exists sales_created_at_idx      on public.sales (created_at desc);
create index if not exists sale_items_sale_id_idx    on public.sale_items (sale_id);
create index if not exists po_items_po_id_idx        on public.purchase_order_items (po_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- ============================================================================
-- Roles (RBAC) — roles live in their own table, never on a profile row.
-- ============================================================================

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin','manager','staff')
  )
$$;

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

-- Grants + policies for the POS tables: signed-in users read, staff write.
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

-- ============================================================================
-- public.app_users — identity, role and per-cashier permission toggles
-- ============================================================================

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  user_id varchar(64) not null unique,     -- login identifier typed at the terminal
  full_name varchar(160) not null,
  email varchar(255) not null,
  role app_role not null default 'staff',
  store_id varchar(64),
  is_active boolean not null default true,
  permissions jsonb not null default jsonb_build_object(
    'can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false,
    'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false,
    'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false,
    'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false,
    'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false,
    'can_apply_member_discount', true, 'can_view_sales_reports', false,
    'can_access_pos_settings', false, 'can_manage_staff', false
  ),
  pin_hash text not null default '',       -- bcrypt digest, never returned to clients
  auth_secret text not null default '',    -- backend sign-in secret, released only on a correct PIN
  auth_user_id uuid,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrate older installs that still use the `user_code` column name.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'app_users'
                and column_name = 'user_code')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'app_users'
                and column_name = 'user_id') then
    alter table public.app_users rename column user_code to user_id;
  elsif exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'app_users'
                and column_name = 'user_code') then
    update public.app_users set user_id = coalesce(user_id, user_code);
    alter table public.app_users drop column user_code;
  end if;
end $$;

alter table public.app_users
  add column if not exists auth_user_id uuid,
  add column if not exists store_id varchar(64),
  add column if not exists last_login_at timestamptz,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists full_name varchar(160),
  add column if not exists email varchar(255),
  add column if not exists role app_role not null default 'staff',
  add column if not exists pin_hash text not null default '',
  add column if not exists auth_secret text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Older installs stored `role` as varchar; convert it to the app_role enum so
-- the security-definer functions can return it (idempotent).
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'app_users'
                and column_name = 'role' and udt_name <> 'app_role') then
    update public.app_users
       set role = case lower(coalesce(role::text, ''))
                    when 'admin' then 'admin'
                    when 'manager' then 'manager'
                    when 'supervisor' then 'manager'
                    when 'staff' then 'staff'
                    else 'staff'
                  end;
    alter table public.app_users alter column role drop default;
    alter table public.app_users
      alter column role type public.app_role using role::text::public.app_role;
    alter table public.app_users alter column role set default 'staff'::public.app_role;
    alter table public.app_users alter column role set not null;
  end if;
end $$;

-- Merge legacy coarse permission flags into the granular matrix (idempotent).
update public.app_users a
   set permissions = (
     case when a.role in ('admin','manager') then
       jsonb_build_object(
         'can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', true,
         'can_process_sale', true, 'can_give_discount', true, 'can_void_item', true,
         'can_hold_cart', true, 'can_process_refund', true, 'can_process_exchange', true,
         'can_view_inventory', true, 'can_edit_product_price', true, 'can_add_new_product', true,
         'can_receive_purchase_order', true, 'can_add_member', true, 'can_edit_member_points', true,
         'can_apply_member_discount', true, 'can_view_sales_reports', true,
         'can_access_pos_settings', true, 'can_manage_staff', true)
     else
       jsonb_build_object(
         'can_open_drawer', coalesce((a.permissions ->> 'can_open_drawer_manual')::boolean, true),
         'can_close_drawer', true,
         'can_view_drawer_balance', coalesce((a.permissions ->> 'financials')::boolean, false),
         'can_process_sale', true,
         'can_give_discount', coalesce((a.permissions ->> 'can_give_discount')::boolean, false),
         'can_void_item', false,
         'can_hold_cart', true,
         'can_process_refund', coalesce((a.permissions ->> 'can_refund')::boolean, false),
         'can_process_exchange', coalesce((a.permissions ->> 'can_refund')::boolean, false),
         'can_view_inventory', true,
         'can_edit_product_price', coalesce((a.permissions ->> 'ecommerce')::boolean, false),
         'can_add_new_product', coalesce((a.permissions ->> 'products')::boolean, false),
         'can_receive_purchase_order', coalesce((a.permissions ->> 'products')::boolean, false),
         'can_add_member', true,
         'can_edit_member_points', false,
         'can_apply_member_discount', true,
         'can_view_sales_reports', coalesce((a.permissions ->> 'financials')::boolean, false),
         'can_access_pos_settings', false,
         'can_manage_staff', false)
     end
   ) || (coalesce(a.permissions, '{}'::jsonb) - array['financials','products','ecommerce','can_refund','can_open_drawer_manual'])
 where a.permissions ?| array['financials','products','ecommerce','can_refund','can_open_drawer_manual']
    or not (a.permissions ? 'can_process_sale');

create unique index if not exists app_users_user_id_key
  on public.app_users (lower(user_id));
create unique index if not exists app_users_auth_user_id_key
  on public.app_users (auth_user_id) where auth_user_id is not null;

-- No direct table access: pin_hash / auth_secret must never be selectable.
-- Every read and write goes through the security-definer functions below.
revoke all on public.app_users from anon;
revoke all on public.app_users from authenticated;
grant all on public.app_users to service_role;
alter table public.app_users enable row level security;

-- ---------------------------------------------------------------------------
-- Terminal login: User ID + 4-digit PIN (bcrypt hashed inside the database)
-- ---------------------------------------------------------------------------
drop function if exists public.verify_terminal_pin(text, text);
create or replace function public.verify_terminal_pin(p_user_id text, p_pin text)
returns table (user_id text, full_name text, role app_role, store_id text,
               email text, auth_secret text)
language plpgsql security definer set search_path = public, extensions as $$
declare u public.app_users%rowtype;
begin
  select * into u from public.app_users a
   where lower(a.user_id) = lower(trim(p_user_id)) and a.is_active;
  if not found then return; end if;
  if u.pin_hash = '' or u.pin_hash <> extensions.crypt(p_pin::text, u.pin_hash::text) then return; end if;
  update public.app_users set last_login_at = now() where id = u.id;
  return query select u.user_id::text, u.full_name::text, u.role, u.store_id::text,
                      u.email::text, u.auth_secret;
end $$;

revoke all on function public.verify_terminal_pin(text, text) from public;
grant execute on function public.verify_terminal_pin(text, text) to anon, authenticated, service_role;

-- The signed-in account's own profile + permissions (no secrets exposed).
drop function if exists public.current_app_user();
create or replace function public.current_app_user()
returns table (id uuid, user_id text, full_name text, role app_role, store_id text,
               email text, permissions jsonb, is_active boolean)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.user_id::text, a.full_name::text, a.role, a.store_id::text,
         a.email::text, a.permissions, a.is_active
  from public.app_users a
  where a.auth_user_id = auth.uid()
     or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

revoke all on function public.current_app_user() from public;
grant execute on function public.current_app_user() to anon, authenticated, service_role;

-- Admin/manager listing including permission toggles (no secrets exposed).
drop function if exists public.list_app_users();
create or replace function public.list_app_users()
returns table (id uuid, auth_user_id uuid, user_id text, full_name text, email text,
               role app_role, store_id text, is_active boolean, permissions jsonb,
               last_login_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.auth_user_id, a.user_id::text, a.full_name::text, a.email::text,
         a.role, a.store_id::text, a.is_active, a.permissions, a.last_login_at, a.created_at
  from public.app_users a
  where public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')
  order by a.user_id
$$;

revoke all on function public.list_app_users() from public;
grant execute on function public.list_app_users() to anon, authenticated, service_role;

-- Supervisors toggle permissions for a cashier.
drop function if exists public.set_app_user_permissions(text, jsonb);
create or replace function public.set_app_user_permissions(p_user_id text, p_permissions jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can change permissions';
  end if;
  update public.app_users a
     set permissions = coalesce(a.permissions, '{}'::jsonb) || p_permissions,
         updated_at = now()
   where lower(a.user_id) = lower(trim(p_user_id));
end $$;

revoke all on function public.set_app_user_permissions(text, jsonb) from public;
grant execute on function public.set_app_user_permissions(text, jsonb) to authenticated, service_role;

-- Admin provisioning. The PIN arrives over TLS and is hashed here.
drop function if exists public.upsert_terminal_user(text, text, app_role, text, text, text, text);
create or replace function public.upsert_terminal_user(
  p_user_id text, p_full_name text, p_role app_role, p_store_id text,
  p_email text, p_pin text, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can manage terminal users';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;
  insert into public.app_users (user_id, full_name, role, store_id, email, pin_hash, auth_secret)
  values (trim(p_user_id), trim(p_full_name), p_role, nullif(trim(coalesce(p_store_id,'')),''),
          lower(trim(p_email)), extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)), p_password)
  on conflict (user_id) do update
    set full_name   = excluded.full_name,
        role        = excluded.role,
        store_id    = excluded.store_id,
        email       = excluded.email,
        pin_hash    = excluded.pin_hash,
        auth_secret = excluded.auth_secret,
        updated_at  = now();
end $$;

revoke all on function public.upsert_terminal_user(text, text, app_role, text, text, text, text) from public;
grant execute on function public.upsert_terminal_user(text, text, app_role, text, text, text, text) to authenticated, service_role;

drop function if exists public.set_terminal_active(text, boolean);
create or replace function public.set_terminal_active(p_user_id text, p_active boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can manage terminal users';
  end if;
  update public.app_users a set is_active = p_active, updated_at = now()
   where lower(a.user_id) = lower(trim(p_user_id));
end $$;

revoke all on function public.set_terminal_active(text, boolean) from public;
grant execute on function public.set_terminal_active(text, boolean) to authenticated, service_role;

drop function if exists public.delete_terminal_user(text);
create or replace function public.delete_terminal_user(p_user_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only admins can delete terminal users';
  end if;
  delete from public.app_users a where lower(a.user_id) = lower(trim(p_user_id));
end $$;

revoke all on function public.delete_terminal_user(text) from public;
grant execute on function public.delete_terminal_user(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Supabase Auth auto-sync: creating an account seeds public.app_users
-- ---------------------------------------------------------------------------
create or replace function public.sync_auth_user_to_public()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
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
    then jsonb_build_object(
      'can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', true,
      'can_process_sale', true, 'can_give_discount', true, 'can_void_item', true,
      'can_hold_cart', true, 'can_process_refund', true, 'can_process_exchange', true,
      'can_view_inventory', true, 'can_edit_product_price', true, 'can_add_new_product', true,
      'can_receive_purchase_order', true, 'can_add_member', true, 'can_edit_member_points', true,
      'can_apply_member_discount', true, 'can_view_sales_reports', true,
      'can_access_pos_settings', true, 'can_manage_staff', true
    )
    else jsonb_build_object(
      'can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false,
      'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false,
      'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false,
      'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false,
      'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false,
      'can_apply_member_discount', true, 'can_view_sales_reports', false,
      'can_access_pos_settings', false, 'can_manage_staff', false
    )
  end;
begin
  insert into public.app_users
    (user_id, full_name, role, store_id, email, permissions, auth_user_id)
  values (v_code, v_name, v_role, v_store, lower(new.email), v_perms, new.id)
  on conflict (user_id) do update
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


-- Supervisors edit a staff profile (name, role, store, active flag).
drop function if exists public.set_app_user_profile(text, text, app_role, text, boolean);
create or replace function public.set_app_user_profile(
  p_user_id text, p_full_name text, p_role app_role, p_store_id text, p_is_active boolean)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')) then
    raise exception 'Only supervisors can edit staff profiles';
  end if;
  update public.app_users a
     set full_name  = coalesce(nullif(trim(p_full_name), ''), a.full_name),
         role       = coalesce(p_role, a.role),
         store_id   = nullif(trim(coalesce(p_store_id, '')), ''),
         is_active  = coalesce(p_is_active, a.is_active),
         updated_at = now()
   where lower(a.user_id) = lower(trim(p_user_id));
end $$;

revoke all on function public.set_app_user_profile(text, text, app_role, text, boolean) from public;
grant execute on function public.set_app_user_profile(text, text, app_role, text, boolean) to authenticated, service_role;

-- ============================================================================
-- Default seed data
-- ============================================================================

insert into public.membership_tiers (name, discount_percentage, points_multiplier)
values ('Bronze', 5, 1), ('Silver', 10, 1.25), ('Gold', 15, 1.5)
on conflict (name) do nothing;

insert into public.pos_settings (id, tax_percentage, enable_tax, tax_mode, paper_size,
                                 header_text, footer_text)
values (1, 0, true, 'exclusive', '80mm', 'Northwind POS', 'Thank you for shopping with us!')
on conflict (id) do nothing;

-- Default terminal accounts (User ID + PIN). Change these PINs after setup.
--   admin      / 1234   full access
--   supervisor / 2345   manager access
--   101        / 1111   cashier
insert into public.app_users (user_id, full_name, email, role, store_id, permissions,
                              pin_hash, auth_secret)
values
  ('admin', 'Administrator', 'admin@store.internal', 'admin', null,
   jsonb_build_object(
     'can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', true,
     'can_process_sale', true, 'can_give_discount', true, 'can_void_item', true,
     'can_hold_cart', true, 'can_process_refund', true, 'can_process_exchange', true,
     'can_view_inventory', true, 'can_edit_product_price', true, 'can_add_new_product', true,
     'can_receive_purchase_order', true, 'can_add_member', true, 'can_edit_member_points', true,
     'can_apply_member_discount', true, 'can_view_sales_reports', true,
     'can_access_pos_settings', true, 'can_manage_staff', true),
   extensions.crypt('1234'::text, extensions.gen_salt('bf'::text, 10)), 'pos-admin-1234'),
  ('supervisor', 'Store Supervisor', 'supervisor@store.internal', 'manager', null,
   jsonb_build_object(
     'can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', true,
     'can_process_sale', true, 'can_give_discount', true, 'can_void_item', true,
     'can_hold_cart', true, 'can_process_refund', true, 'can_process_exchange', true,
     'can_view_inventory', true, 'can_edit_product_price', true, 'can_add_new_product', true,
     'can_receive_purchase_order', true, 'can_add_member', true, 'can_edit_member_points', true,
     'can_apply_member_discount', true, 'can_view_sales_reports', true,
     'can_access_pos_settings', true, 'can_manage_staff', true),
   extensions.crypt('2345'::text, extensions.gen_salt('bf'::text, 10)), 'pos-supervisor-2345'),
  ('101', 'Cashier 101', '101@store.internal', 'staff', 's1',
   jsonb_build_object(
     'can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false,
     'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false,
     'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false,
     'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false,
     'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false,
     'can_apply_member_discount', true, 'can_view_sales_reports', false,
     'can_access_pos_settings', false, 'can_manage_staff', false),
   extensions.crypt('1111'::text, extensions.gen_salt('bf'::text, 10)), 'pos-101-1111')
on conflict (user_id) do nothing;

-- Bootstrap: grant the admin role to an existing Supabase Auth account.
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users where email = 'you@example.com'
-- on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Cashier table
-- ---------------------------------------------------------------------------
create table if not exists public.cashiers (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  full_name text not null default '',
  pin_hash text not null,
  store_id text,
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cashiers_username_key
  on public.cashiers (lower(username));

grant select, insert, update, delete on public.cashiers to authenticated;
grant all on public.cashiers to service_role;

alter table public.cashiers enable row level security;

drop policy if exists "Signed-in staff can read cashiers" on public.cashiers;
create policy "Signed-in staff can read cashiers"
  on public.cashiers for select to authenticated using (true);

drop policy if exists "Supervisors manage cashiers" on public.cashiers;
create policy "Supervisors manage cashiers"
  on public.cashiers for all to authenticated
  using (public.is_app_supervisor()) with check (public.is_app_supervisor());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists cashiers_touch_updated_at on public.cashiers;
create trigger cashiers_touch_updated_at
  before update on public.cashiers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
-- Drop any older stored versions first, so stale bodies containing
-- unqualified gen_salt(...) cannot survive a re-run.
drop function if exists public.list_cashiers();
drop function if exists public.upsert_cashier(uuid, text, text, text, text, boolean);
drop function if exists public.set_cashier_permissions(uuid, jsonb);
drop function if exists public.delete_cashier(uuid);
drop function if exists public.verify_cashier_pin(text, text);

create or replace function public.list_cashiers()
returns table (
  id uuid,
  username text,
  full_name text,
  store_id text,
  permissions jsonb,
  is_active boolean,
  last_login_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id, c.username, c.full_name, c.store_id, c.permissions,
         c.is_active, c.last_login_at, c.created_at
  from public.cashiers c
  where public.is_app_supervisor()
  order by c.username;
$$;

create or replace function public.upsert_cashier(
  p_id uuid,
  p_username text,
  p_full_name text,
  p_pin text,
  p_store_id text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors and admins can manage cashiers';
  end if;
  if coalesce(trim(p_username), '') = '' then
    raise exception 'Username is required';
  end if;
  if p_pin is not null and p_pin <> '' and p_pin !~ '^\d{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  if p_id is null then
    if p_pin is null or p_pin = '' then
      raise exception 'A PIN is required for a new cashier';
    end if;
    insert into public.cashiers (username, full_name, pin_hash, store_id, is_active)
    values (lower(trim(p_username)), coalesce(p_full_name, ''),
            extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)), p_store_id, coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.cashiers set
      username = lower(trim(p_username)),
      full_name = coalesce(p_full_name, full_name),
      store_id = p_store_id,
      is_active = coalesce(p_is_active, is_active),
      pin_hash = case when p_pin is null or p_pin = '' then pin_hash
                      else extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)) end
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.set_cashier_permissions(
  p_id uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors and admins can manage cashiers';
  end if;
  update public.cashiers
     set permissions = coalesce(permissions, '{}'::jsonb) || coalesce(p_permissions, '{}'::jsonb)
   where id = p_id;
end;
$$;

create or replace function public.delete_cashier(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_app_supervisor() then
    raise exception 'Only supervisors and admins can manage cashiers';
  end if;
  delete from public.cashiers where id = p_id;
end;
$$;

-- Terminal login: username + PIN, verified against the bcrypt digest.
create or replace function public.verify_cashier_pin(p_username text, p_pin text)
returns table (
  id uuid,
  username text,
  full_name text,
  store_id text,
  permissions jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_row public.cashiers;
begin
  select * into v_row from public.cashiers c
   where lower(c.username) = lower(trim(p_username)) and c.is_active
   limit 1;
  if v_row.id is null then return; end if;
  if v_row.pin_hash <> extensions.crypt(p_pin::text, v_row.pin_hash::text) then return; end if;

  update public.cashiers set last_login_at = now() where public.cashiers.id = v_row.id;

  id := v_row.id;
  username := v_row.username;
  full_name := v_row.full_name;
  store_id := v_row.store_id;
  permissions := coalesce(v_row.permissions, '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.list_cashiers() from public;
revoke all on function public.upsert_cashier(uuid, text, text, text, text, boolean) from public;
revoke all on function public.set_cashier_permissions(uuid, jsonb) from public;
revoke all on function public.delete_cashier(uuid) from public;
revoke all on function public.verify_cashier_pin(text, text) from public;

grant execute on function public.list_cashiers() to authenticated, service_role;
grant execute on function public.upsert_cashier(uuid, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.set_cashier_permissions(uuid, jsonb) to authenticated, service_role;
grant execute on function public.delete_cashier(uuid) to authenticated, service_role;
-- The till has no session yet when a cashier signs in.
grant execute on function public.verify_cashier_pin(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Migrate existing cashiers out of app_users
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  if to_regclass('public.app_users') is null then return; end if;

  for r in execute
    $q$ select a.user_id, coalesce(a.full_name, '') as full_name,
               a.store_id::text as store_id,
               coalesce(a.permissions, '{}'::jsonb) as permissions,
               coalesce(a.is_active, true) as is_active,
               a.pin_hash
          from public.app_users a
         where a.role::text = 'cashier' $q$
  loop
    insert into public.cashiers (username, full_name, pin_hash, store_id, permissions, is_active)
    values (
      lower(r.user_id),
      r.full_name,
      -- keep the existing digest when present, otherwise a locked PIN that
      -- must be reset by a supervisor
      coalesce(nullif(r.pin_hash, ''), extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf'::text, 10))),
      r.store_id,
      r.permissions,
      r.is_active
    )
    on conflict (lower(username)) do update
      set full_name = excluded.full_name,
          store_id = excluded.store_id,
          permissions = excluded.permissions,
          is_active = excluded.is_active;
  end loop;

  delete from public.app_users where role::text = 'cashier';
exception when undefined_column then
  raise notice 'app_users cashier migration skipped: column mismatch';
end;
$$;

-- ============================================================================
-- Self-check: every function the app calls must exist
-- ============================================================================
do $$
declare
  wanted text[] := array[
    'list_app_users','current_app_user','verify_terminal_pin',
    'set_app_user_permissions','set_app_user_profile','upsert_terminal_user',
    'delete_terminal_user','set_terminal_active','list_cashiers','upsert_cashier',
    'set_cashier_permissions','delete_cashier','verify_cashier_pin'
  ];
  missing text[];
begin
  select array_agg(w) into missing
    from unnest(wanted) w
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = w
   );
  if missing is not null then
    raise exception 'Missing database functions: %', array_to_string(missing, ', ');
  end if;
  raise notice 'schema_final.sql OK - all POS functions installed.';
end $$;

notify pgrst, 'reload schema';
