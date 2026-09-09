-- Separate the right to request escalation from the right (and monetary/percentage
-- authority) to approve it. Existing installations retain their current behaviour.
ALTER TABLE public.authorization_actions
  ADD COLUMN IF NOT EXISTS requester_roles text[] NOT NULL DEFAULT ARRAY['cashier','staff','manager','admin']::text[],
  ADD COLUMN IF NOT EXISTS requester_user_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS authority_limits jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.authorization_actions
  DROP CONSTRAINT IF EXISTS authorization_actions_authority_limits_object;
ALTER TABLE public.authorization_actions
  ADD CONSTRAINT authorization_actions_authority_limits_object
  CHECK (jsonb_typeof(authority_limits) = 'object');
