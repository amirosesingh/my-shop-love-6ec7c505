ALTER TABLE public.members ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.members SET updated_at = created_at WHERE updated_at < created_at OR updated_at IS NULL;
UPDATE public.membership_tiers SET updated_at = created_at WHERE updated_at < created_at OR updated_at IS NULL;
UPDATE public.promotions SET updated_at = created_at WHERE updated_at < created_at OR updated_at IS NULL;

DROP TRIGGER IF EXISTS set_members_updated_at ON public.members;
CREATE TRIGGER set_members_updated_at BEFORE UPDATE ON public.members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_membership_tiers_updated_at ON public.membership_tiers;
CREATE TRIGGER set_membership_tiers_updated_at BEFORE UPDATE ON public.membership_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_promotions_updated_at ON public.promotions;
CREATE TRIGGER set_promotions_updated_at BEFORE UPDATE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();