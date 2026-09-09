-- Additive continuation: legacy authority_limits remains an absolute ceiling.
-- New entries opt into direct-limit + extra-authority semantics explicitly.
ALTER TABLE public.authorization_actions
  ADD COLUMN IF NOT EXISTS extra_authority jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS absolute_ceilings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS requester_direct_limit numeric,
  ADD COLUMN IF NOT EXISTS value_unit text NOT NULL DEFAULT 'number';

ALTER TABLE public.authorization_actions DROP CONSTRAINT IF EXISTS authorization_actions_extra_authority_object;
ALTER TABLE public.authorization_actions ADD CONSTRAINT authorization_actions_extra_authority_object CHECK (jsonb_typeof(extra_authority) = 'object');
ALTER TABLE public.authorization_actions DROP CONSTRAINT IF EXISTS authorization_actions_absolute_ceilings_object;
ALTER TABLE public.authorization_actions ADD CONSTRAINT authorization_actions_absolute_ceilings_object CHECK (jsonb_typeof(absolute_ceilings) = 'object');
ALTER TABLE public.authorization_requests DROP CONSTRAINT IF EXISTS authorization_requests_value_unit_check;
ALTER TABLE public.authorization_requests ADD CONSTRAINT authorization_requests_value_unit_check CHECK (value_unit IN ('percent','currency','quantity','number'));
