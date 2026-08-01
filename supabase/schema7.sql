-- =============================================================
-- schema7.sql — Bookings / pay-later + bank transfer details
-- Idempotent. Safe to re-run.
-- =============================================================

-- 1. Bank transfer details on POS settings ---------------------
alter table public.pos_settings
  add column if not exists payment_details jsonb not null default '{}'::jsonb;

-- 2. Bookings --------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  store_id text,
  member_id uuid references public.members(id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  cashier_name text,
  status text not null default 'active',
  subtotal_amount numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  due_date date not null,
  note text,
  sale_receipt_no text,
  collected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric not null default 0,
  quantity integer not null default 1,
  discount_percent numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric not null default 0,
  method text not null default 'cash',
  cashier_name text,
  created_at timestamptz not null default now()
);

create index if not exists bookings_store_status_idx on public.bookings (store_id, status);
create index if not exists booking_items_booking_idx on public.booking_items (booking_id);
create index if not exists booking_payments_booking_idx on public.booking_payments (booking_id);

-- 3. Grants ----------------------------------------------------
grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert, update, delete on public.booking_items to authenticated;
grant select, insert, update, delete on public.booking_payments to authenticated;
grant all on public.bookings to service_role;
grant all on public.booking_items to service_role;
grant all on public.booking_payments to service_role;

-- 4. RLS: staff only ------------------------------------------
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bookings', 'booking_items', 'booking_payments'] loop
    execute format('drop policy if exists "Staff can read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Staff can insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Staff can update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Staff can delete %1$s" on public.%1$I', t);

    execute format(
      'create policy "Staff can read %1$s" on public.%1$I for select to authenticated using (public.is_staff(auth.uid()))', t);
    execute format(
      'create policy "Staff can insert %1$s" on public.%1$I for insert to authenticated with check (public.is_staff(auth.uid()))', t);
    execute format(
      'create policy "Staff can update %1$s" on public.%1$I for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))', t);
    execute format(
      'create policy "Staff can delete %1$s" on public.%1$I for delete to authenticated using (public.is_staff(auth.uid()))', t);
  end loop;
end $$;

-- 5. updated_at trigger ---------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.touch_updated_at();

-- 6. Reload PostgREST schema cache ----------------------------
notify pgrst, 'reload schema';