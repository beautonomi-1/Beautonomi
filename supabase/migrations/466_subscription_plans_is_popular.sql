ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT false;
