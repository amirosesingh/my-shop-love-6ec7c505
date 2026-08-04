alter table public.pos_settings add column if not exists day_start_time text not null default '09:00';
alter table public.pos_settings add column if not exists day_end_time text not null default '21:00';
alter table public.pos_settings add column if not exists max_shift_hours numeric not null default 12;
alter table public.pos_settings add column if not exists shift_reminder_minutes integer not null default 30;
alter table public.pos_settings add column if not exists ui_visibility jsonb not null default '{"hidden":{}}'::jsonb;

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

alter table public.purchase_orders add column if not exists supplier_id uuid references public.suppliers(id);