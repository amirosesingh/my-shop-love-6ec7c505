-- Schema 17 — fix "row-level security policy for table shifts" on push sync.
--
-- Earlier schemas protected public.shifts with an owner rule
-- (user_id = auth.uid()). The till pushes shifts that belong to a terminal,
-- not to a single cloud account, so every push was rejected. Shifts are now
-- readable and writable by any staff account, exactly like shift_sessions.
--
-- Safe to run more than once.

alter table public.shifts add column if not exists user_id uuid;
alter table public.shifts add column if not exists status text not null default 'OPEN';

alter table public.shifts enable row level security;

-- Remove every existing rule on shifts so no stale owner rule survives.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'shifts'
  loop
    execute format('drop policy %I on public.shifts', p.policyname);
  end loop;
end $$;

create policy "Staff can read shifts" on public.shifts
  for select to authenticated using (public.is_staff(auth.uid()));

create policy "Staff can open shifts" on public.shifts
  for insert to authenticated with check (public.is_staff(auth.uid()));

create policy "Staff can update shifts" on public.shifts
  for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

grant select, insert, update on public.shifts to authenticated;
grant all on public.shifts to service_role;
