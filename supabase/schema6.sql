-- =====================================================================
-- schema6.sql — receipt branding columns for public.pos_settings
-- Safe to run multiple times. Run this in your project's SQL editor.
-- =====================================================================

alter table public.pos_settings add column if not exists company_name text;
alter table public.pos_settings add column if not exists tax_number   text;
alter table public.pos_settings add column if not exists reg_number   text;
alter table public.pos_settings add column if not exists phone        text;
alter table public.pos_settings add column if not exists website      text;
alter table public.pos_settings add column if not exists fonts        jsonb not null default '{}'::jsonb;
alter table public.pos_settings add column if not exists custom_lines jsonb not null default '[]'::jsonb;
alter table public.pos_settings add column if not exists qr           jsonb not null default '{}'::jsonb;

-- Backfill the singleton settings row with sane defaults.
update public.pos_settings
   set company_name = coalesce(nullif(company_name, ''), 'MY STORE'),
       tax_number   = coalesce(tax_number, ''),
       reg_number   = coalesce(reg_number, ''),
       phone        = coalesce(phone, ''),
       website      = coalesce(website, ''),
       fonts        = coalesce(fonts, '{}'::jsonb),
       custom_lines = coalesce(custom_lines, '[]'::jsonb),
       qr           = case
                        when qr is null or qr = '{}'::jsonb
                        then '{"enabled": false, "value": "", "size": 96, "placement": "footer"}'::jsonb
                        else qr
                      end
 where id = 1;

-- Re-assert staff-only access (unchanged rules, just made explicit).
alter table public.pos_settings enable row level security;

grant select, insert, update, delete on public.pos_settings to authenticated;
grant all on public.pos_settings to service_role;

drop policy if exists "Staff can read pos settings" on public.pos_settings;
drop policy if exists "Staff can insert" on public.pos_settings;
drop policy if exists "Staff can update" on public.pos_settings;
drop policy if exists "Staff can delete" on public.pos_settings;

create policy "Staff can read pos settings" on public.pos_settings
  for select to authenticated using (public.is_staff(auth.uid()));
create policy "Staff can insert" on public.pos_settings
  for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "Staff can update" on public.pos_settings
  for update to authenticated using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
create policy "Staff can delete" on public.pos_settings
  for delete to authenticated using (public.is_staff(auth.uid()));

-- Make the new columns visible to the API immediately.
notify pgrst, 'reload schema';