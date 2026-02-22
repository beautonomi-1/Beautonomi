-- 055_coupons_and_user_coupons.sql
-- Create coupons and user_coupons tables for coupon management

-- Coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  currency TEXT,
  min_purchase_amount NUMERIC(10, 2) DEFAULT 0,
  max_discount_amount NUMERIC(10, 2),
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_until TIMESTAMP WITH TIME ZONE,
  max_uses INTEGER,
  max_uses_per_user INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User coupons (redemptions)
CREATE TABLE IF NOT EXISTS public.user_coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, coupon_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_coupons_user_id ON public.user_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_coupon_id ON public.user_coupons(coupon_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_active ON public.user_coupons(is_active) WHERE is_active = true;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_coupons_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_coupons_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop triggers if they exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_public_coupons_updated_at') THEN
    DROP TRIGGER set_public_coupons_updated_at ON public.coupons;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_public_user_coupons_updated_at') THEN
    DROP TRIGGER set_public_user_coupons_updated_at ON public.user_coupons;
  END IF;
END $$;

-- Create triggers
CREATE TRIGGER set_public_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_coupons_updated_at();

CREATE TRIGGER set_public_user_coupons_updated_at
  BEFORE UPDATE ON public.user_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_coupons_updated_at();

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coupons
CREATE POLICY "Public can view active coupons"
  ON public.coupons FOR SELECT
  USING (is_active = true);

CREATE POLICY "Superadmins can manage coupons"
  ON public.coupons FOR ALL
  USING (auth.role() = 'superadmin')
  WITH CHECK (auth.role() = 'superadmin');

-- RLS Policies for user_coupons
CREATE POLICY "Users can view own coupons"
  ON public.user_coupons FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own coupons"
  ON public.user_coupons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Superadmins can manage user coupons"
  ON public.user_coupons FOR ALL
  USING (auth.role() = 'superadmin')
  WITH CHECK (auth.role() = 'superadmin');

-- Comments
COMMENT ON TABLE public.coupons IS 'Available coupons/promotional codes';
COMMENT ON TABLE public.user_coupons IS 'User coupon redemptions';
