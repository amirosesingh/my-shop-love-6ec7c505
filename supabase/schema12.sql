-- Terminal token re-issue support.
-- Run once on the POS database, after schema10.sql / schema11.sql.

alter table public.terminal_tokens
  add column if not exists reissued_at timestamptz,
  add column if not exists replaced_by uuid;

comment on column public.terminal_tokens.reissued_at is
  'Set when this row replaced an earlier code for the same terminal.';
comment on column public.terminal_tokens.replaced_by is
  'Set on a retired row, pointing at the replacement token.';