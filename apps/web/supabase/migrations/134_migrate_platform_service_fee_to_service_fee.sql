-- Beautonomi Database Migration
-- 134_migrate_platform_service_fee_to_service_fee.sql
-- Migrates platform_service_fee to service_fee_amount and removes legacy column

-- Step 1: Copy platform_service_fee values to service_fee_amount for existing bookings
-- Only update bookings where service_fee_amount is 0 or NULL (to avoid overwriting existing data)
UPDATE bookings
SET 
  service_fee_amount = COALESCE(platform_service_fee, 0),
  service_fee_paid_by = 'customer'
WHERE 
  (service_fee_amount IS NULL OR service_fee_amount = 0)
  AND platform_service_fee IS NOT NULL
  AND platform_service_fee > 0;

-- Step 2: Calculate service_fee_percentage for bookings where we can determine it
-- This attempts to backfill the percentage based on the fee amount and subtotal
UPDATE bookings
SET service_fee_percentage = 
  CASE 
    WHEN subtotal > 0 AND service_fee_amount > 0 THEN
      ROUND((service_fee_amount / subtotal) * 100, 2)
    ELSE 0
  END
WHERE 
  service_fee_amount > 0
  AND (service_fee_percentage IS NULL OR service_fee_percentage = 0)
  AND subtotal > 0;

-- Step 3: Update finance_transactions to use consistent naming
-- Change transaction_type from 'platform_service_fee' to 'service_fee'
UPDATE finance_transactions
SET transaction_type = 'service_fee'
WHERE transaction_type = 'platform_service_fee';

-- Step 4: Drop the platform_service_fee column
-- Note: This is done in a separate step after verification
-- Uncomment when ready to remove the column:
-- ALTER TABLE bookings DROP COLUMN IF EXISTS platform_service_fee;

-- Add comment explaining the migration
COMMENT ON COLUMN bookings.service_fee_amount IS 'Customer service fee (migrated from platform_service_fee). This is the fee charged to customers, separate from provider earnings.';
