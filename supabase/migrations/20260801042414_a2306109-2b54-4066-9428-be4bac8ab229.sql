do $$
declare t text;
begin
  foreach t in array array[
    'products','members','membership_tiers','sales','sale_items',
    'promotions','pos_settings','purchase_orders','purchase_order_items','audit_logs'
  ] loop
    execute format('drop policy if exists "Public access" on public.%I', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;

  foreach t in array array[
    'products','members','membership_tiers','sales','sale_items',
    'promotions','pos_settings','purchase_orders','purchase_order_items'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Staff full access" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- Audit logs: append-only for signed-in staff, no updates or deletes.
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
CREATE POLICY "Staff can read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can append audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);