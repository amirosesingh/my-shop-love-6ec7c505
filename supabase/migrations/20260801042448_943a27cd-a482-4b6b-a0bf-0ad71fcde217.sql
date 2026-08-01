create type public.app_role as enum ('admin', 'manager', 'staff');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin', 'manager', 'staff')
  )
$$;

create policy "Users can read their own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "Admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

do $$
declare t text;
begin
  foreach t in array array[
    'products','members','membership_tiers','sales','sale_items',
    'promotions','pos_settings','purchase_orders','purchase_order_items'
  ] loop
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format(
      'create policy "Signed-in staff can read" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "Staff can insert" on public.%I for insert to authenticated with check (public.is_staff(auth.uid()))', t);
    execute format(
      'create policy "Staff can update" on public.%I for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))', t);
    execute format(
      'create policy "Staff can delete" on public.%I for delete to authenticated using (public.is_staff(auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "Staff can append audit logs" on public.audit_logs;
create policy "Staff can append audit logs" on public.audit_logs
  for insert to authenticated with check (public.is_staff(auth.uid()));