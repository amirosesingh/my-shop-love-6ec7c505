-- Session verification support: permission helpers callable by signed-in
-- accounts, and one routine that revokes a branch's terminals.
-- Additions and grants only. Nothing is dropped and no data is seeded.

-- 1 · permission helpers run with definer rights and stay callable ------------
alter function public.is_staff(uuid) security definer;
alter function public.is_staff_now() security definer;
alter function public.is_supervisor_now() security definer;
alter function public.is_app_supervisor() security definer;
alter function public.has_role(uuid, public.app_role) security definer;
alter function public.has_perm(text) security definer;

grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.is_staff_now() to authenticated;
grant execute on function public.is_supervisor_now() to authenticated;
grant execute on function public.is_app_supervisor() to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_perm(text) to authenticated;

-- 2 · revoke every terminal token and open session for a branch ---------------
create or replace function public.terminal_sessions_revoke_for_branch(_branch_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.terminal_tokens
     set status = 'revoked',
         revoked_at = now()
   where location_id = _branch_id
     and revoked_at is null;
  get diagnostics affected = row_count;

  update public.shift_sessions
     set signed_out_at = now()
   where store_id = _branch_id
     and signed_out_at is null;

  return affected;
end;
$$;

grant execute on function public.terminal_sessions_revoke_for_branch(text) to authenticated;
grant execute on function public.terminal_sessions_revoke_for_branch(text) to service_role;

-- 3 · when a branch row is deleted, its tills lose their proof immediately ----
create or replace function public.revoke_terminals_on_branch_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.terminal_sessions_revoke_for_branch(old.id);
  return old;
end;
$$;

drop trigger if exists stores_revoke_terminals on public.stores;
create trigger stores_revoke_terminals
  before delete on public.stores
  for each row execute function public.revoke_terminals_on_branch_delete();
