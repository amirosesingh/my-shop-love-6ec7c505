-- ---------------------------------------------------------------------------
-- Schema 18 · trading-hours columns, screen visibility and the supplier book
--
-- Safe to run more than once. Run this on the central database if saving
-- settings reports a missing 'day_end_time' (or similar) column.
-- ---------------------------------------------------------------------------

-- 1 · Settings columns some installs are still missing -----------------------
alter table public.pos_settings add column if not exists day_start_time text not null default '09:00';
alter table public.pos_settings add column if not exists day_end_time text not null default '21:00';
alter table public.pos_settings add column if not exists max_shift_hours numeric not null default 12;
alter table public.pos_settings add column if not exists shift_reminder_minutes integer not null default 30;
-- Admin-controlled screen visibility: { "hidden": { "<element>": ["cashier"] } }
alter table public.pos_settings add column if not exists ui_visibility jsonb not null default '{"hidden":{}}'::jsonb;

-- 2 · Supplier directory -----------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_number text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.suppliers to anon;
grant all on public.suppliers to service_role;

alter table public.suppliers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suppliers' and policyname = 'suppliers_read') then
    create policy "suppliers_read" on public.suppliers for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suppliers' and policyname = 'suppliers_write') then
    create policy "suppliers_write" on public.suppliers for all using (true) with check (true);
  end if;
end $$;

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.update_updated_at_column();

-- 3 · Link received invoices to a supplier row where the table exists --------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'purchase_orders') then
    execute 'alter table public.purchase_orders add column if not exists supplier_id uuid references public.suppliers(id)';
  end if;
end $$;
