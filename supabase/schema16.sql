-- Schema 16 — shift tracking with sign-in sessions.
-- Safe to run more than once.

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  terminal_id text,
  terminal_name text,
  opened_by_name text not null default 'Cashier',
  opened_by_staff_id text,
  opened_by_role text,
  closed_by_name text,
  closed_by_staff_id text,
  closed_by_role text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_float numeric not null default 0,
  closing_float numeric,
  counted_cash numeric,
  expected_cash numeric,
  note text not null default '',
  overdue boolean not null default false,
  status text not null default 'OPEN',
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_sessions (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null,
  store_id text not null,
  terminal_id text,
  terminal_name text,
  staff_id text,
  staff_name text not null,
  role text,
  signed_in_at timestamptz not null default now(),
  signed_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shift_sessions_shift_idx on public.shift_sessions (shift_id);
create index if not exists shift_sessions_store_idx on public.shift_sessions (store_id, signed_in_at desc);

grant select, insert, update on public.shifts to authenticated;
grant all on public.shifts to service_role;
grant select, insert, update on public.shift_sessions to authenticated;
grant all on public.shift_sessions to service_role;

alter table public.shifts enable row level security;
alter table public.shift_sessions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'shift_sessions' and policyname = 'Staff can read shift sessions') then
    create policy "Staff can read shift sessions" on public.shift_sessions
      for select to authenticated using (public.is_staff(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shift_sessions' and policyname = 'Staff can start shift sessions') then
    create policy "Staff can start shift sessions" on public.shift_sessions
      for insert to authenticated with check (public.is_staff(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'shift_sessions' and policyname = 'Staff can end shift sessions') then
    create policy "Staff can end shift sessions" on public.shift_sessions
      for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
  end if;
end $$;

drop trigger if exists shift_sessions_set_updated_at on public.shift_sessions;
create trigger shift_sessions_set_updated_at
  before update on public.shift_sessions
  for each row execute function public.update_updated_at_column();
