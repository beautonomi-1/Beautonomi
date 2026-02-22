-- Beautonomi Database Migration
-- 160_update_cancellation_policies_schema.sql
-- Updates cancellation_policies table to support multiple named policies with fees

-- Add new columns to support the UI requirements
ALTER TABLE public.cancellation_policies
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS hours_before INTEGER,
ADD COLUMN IF NOT EXISTS refund_percentage INTEGER DEFAULT 100 CHECK (refund_percentage >= 0 AND refund_percentage <= 100),
ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_type TEXT DEFAULT 'fixed' CHECK (fee_type IN ('fixed', 'percentage')),
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Migrate existing data: map old fields to new fields
UPDATE public.cancellation_policies
SET 
  name = CASE 
    WHEN late_cancellation_type = 'full_refund' THEN 'Full Refund'
    WHEN late_cancellation_type = 'partial_refund' THEN 'Partial Refund'
    WHEN late_cancellation_type = 'no_refund' THEN 'No Refund'
    ELSE 'Standard Policy'
  END,
  hours_before = hours_before_cutoff,
  refund_percentage = CASE
    WHEN late_cancellation_type = 'full_refund' THEN 100
    WHEN late_cancellation_type = 'partial_refund' THEN 50
    WHEN late_cancellation_type = 'no_refund' THEN 0
    ELSE 0
  END,
  is_default = true
WHERE name IS NULL;

-- Remove the unique constraint on (provider_id, location_type) to allow multiple policies
-- Check if constraint exists before dropping
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'cancellation_policies_provider_id_location_type_key'
    ) THEN
        ALTER TABLE public.cancellation_policies
        DROP CONSTRAINT cancellation_policies_provider_id_location_type_key;
    END IF;
END $$;

-- Add unique constraint to ensure only one default per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_policies_default 
ON cancellation_policies(provider_id) 
WHERE is_default = true;

-- Add index for hours_before
CREATE INDEX IF NOT EXISTS idx_cancellation_policies_hours_before ON cancellation_policies(provider_id, hours_before);

-- Add comments
COMMENT ON COLUMN public.cancellation_policies.name IS 'Policy name (e.g., Flexible, Moderate, Strict)';
COMMENT ON COLUMN public.cancellation_policies.hours_before IS 'Minimum hours before appointment that this policy applies';
COMMENT ON COLUMN public.cancellation_policies.refund_percentage IS 'Percentage of booking amount to refund (0-100)';
COMMENT ON COLUMN public.cancellation_policies.fee_amount IS 'Cancellation fee amount';
COMMENT ON COLUMN public.cancellation_policies.fee_type IS 'Fee type: fixed (amount) or percentage';
COMMENT ON COLUMN public.cancellation_policies.is_default IS 'Whether this is the default policy for the provider';
