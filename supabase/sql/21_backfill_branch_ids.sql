-- ---------------------------------------------------------------------------
-- 21_backfill_branch_ids.sql
--
-- Fills in blank branch ids (store_id) on operational rows written before the
-- terminal binding existed. Safe to run more than once: every statement only
-- touches rows that still have no branch.
--
-- Order matters: shifts are repaired first, because sales and sessions borrow
-- their branch from the shift they belong to.
-- ---------------------------------------------------------------------------

begin;

-- A single-branch business: everything blank belongs to that branch.
create temporary table _only_branch on commit drop as
select id from public.stores limit 2;

-- 1. Shifts: from the terminal they were opened on, else the only branch.
update public.shifts s
   set store_id = t.location_id
  from public.terminal_tokens t
 where coalesce(btrim(s.store_id), '') = ''
   and t.id::text = s.terminal_id
   and coalesce(btrim(t.location_id), '') <> '';

update public.shifts s
   set store_id = (select id from _only_branch)
 where coalesce(btrim(s.store_id), '') = ''
   and (select count(*) from _only_branch) = 1;

-- 2. Sales: from their shift, then the only branch.
update public.sales x
   set store_id = s.store_id
  from public.shifts s
 where coalesce(btrim(x.store_id), '') = ''
   and s.id::text = x.shift_id
   and coalesce(btrim(s.store_id), '') <> '';

update public.sales x
   set store_id = (select id from _only_branch)
 where coalesce(btrim(x.store_id), '') = ''
   and (select count(*) from _only_branch) = 1;

-- 3. Shift sign-ins: always from their shift.
update public.shift_sessions ss
   set store_id = s.store_id
  from public.shifts s
 where coalesce(btrim(ss.store_id), '') = ''
   and s.id::text = ss.shift_id
   and coalesce(btrim(s.store_id), '') <> '';

-- 4. Drawer events: from their shift, then the only branch.
update public.drawer_events d
   set store_id = s.store_id
  from public.shifts s
 where coalesce(btrim(d.store_id), '') = ''
   and s.id::text = d.shift_id
   and coalesce(btrim(s.store_id), '') <> '';

update public.drawer_events d
   set store_id = (select id from _only_branch)
 where coalesce(btrim(d.store_id), '') = ''
   and (select count(*) from _only_branch) = 1;

-- 5. Held bills, bookings, stock adjustments, SKU changes, issued vouchers:
--    nothing to derive from, so only the single-branch case is safe.
update public.held_orders      set store_id = (select id from _only_branch)
 where coalesce(btrim(store_id), '') = '' and (select count(*) from _only_branch) = 1;

update public.bookings         set store_id = (select id from _only_branch)
 where coalesce(btrim(store_id), '') = '' and (select count(*) from _only_branch) = 1;

update public.stock_adjustments set store_id = (select id from _only_branch)
 where coalesce(btrim(store_id), '') = '' and (select count(*) from _only_branch) = 1;

update public.sku_audit        set store_id = (select id from _only_branch)
 where coalesce(btrim(store_id), '') = '' and (select count(*) from _only_branch) = 1;

update public.issued_vouchers  set store_id = (select id from _only_branch)
 where coalesce(btrim(store_id), '') = '' and (select count(*) from _only_branch) = 1;

commit;

-- What is left over (should be zero on a single-branch database):
select 'sales' as table_name, count(*) as still_blank from public.sales where coalesce(btrim(store_id),'') = ''
union all select 'shifts',           count(*) from public.shifts            where coalesce(btrim(store_id),'') = ''
union all select 'shift_sessions',   count(*) from public.shift_sessions    where coalesce(btrim(store_id),'') = ''
union all select 'held_orders',      count(*) from public.held_orders       where coalesce(btrim(store_id),'') = ''
union all select 'bookings',         count(*) from public.bookings          where coalesce(btrim(store_id),'') = ''
union all select 'drawer_events',    count(*) from public.drawer_events     where coalesce(btrim(store_id),'') = ''
union all select 'stock_adjustments',count(*) from public.stock_adjustments where coalesce(btrim(store_id),'') = ''
union all select 'sku_audit',        count(*) from public.sku_audit         where coalesce(btrim(store_id),'') = ''
union all select 'issued_vouchers',  count(*) from public.issued_vouchers   where coalesce(btrim(store_id),'') = '';