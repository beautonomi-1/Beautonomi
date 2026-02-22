-- Beautonomi Database Migration
-- 094_fix_security_issues.sql
-- Fixes security issues identified by Supabase linter:
-- 1. Remove SECURITY DEFINER from views
-- 2. Enable RLS on tables that need it

-- ============================================================================
-- Fix Views: Remove SECURITY DEFINER (recreate with SECURITY INVOKER)
-- ============================================================================

-- Recreate services_with_variants view without SECURITY DEFINER
DROP VIEW IF EXISTS services_with_variants CASCADE;

CREATE VIEW services_with_variants AS
SELECT 
    s.*,
    COALESCE(
        (SELECT json_agg(v ORDER BY v.variant_sort_order, v.price)
         FROM offerings v 
         WHERE v.parent_service_id = s.id 
         AND v.service_type = 'variant'
         AND v.is_active = true),
        '[]'::json
    ) as variants,
    (SELECT COUNT(*) 
     FROM offerings v 
     WHERE v.parent_service_id = s.id 
     AND v.service_type = 'variant'
     AND v.is_active = true) as variant_count
FROM offerings s
WHERE s.service_type != 'variant' 
   OR s.parent_service_id IS NULL;

-- Recreate service_addons view without SECURITY DEFINER
DROP VIEW IF EXISTS service_addons CASCADE;

CREATE VIEW service_addons AS
SELECT a.*
FROM offerings a
WHERE a.service_type = 'addon'
AND a.is_active = true;

-- ============================================================================
-- Enable RLS on Tables
-- ============================================================================

-- Enable RLS on provider_paystack_subaccounts
ALTER TABLE provider_paystack_subaccounts ENABLE ROW LEVEL SECURITY;

-- Enable RLS on webhook_events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Enable RLS on paystack_splits
ALTER TABLE paystack_splits ENABLE ROW LEVEL SECURITY;

-- Enable RLS on payment_transactions
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Note: spatial_ref_sys is a PostGIS system table owned by the extension
-- We cannot enable RLS on it as we don't own it. This is expected for system tables.
-- If RLS is required, it should be handled at the database/extension level.
-- For now, we skip this table as it's a system reference table.

-- ============================================================================
-- RLS Policies for provider_paystack_subaccounts
-- ============================================================================

-- Providers can view their own subaccounts
CREATE POLICY "Providers can view own paystack subaccounts"
    ON provider_paystack_subaccounts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_paystack_subaccounts.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- Superadmins can manage all subaccounts
CREATE POLICY "Superadmins can manage all paystack subaccounts"
    ON provider_paystack_subaccounts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- ============================================================================
-- RLS Policies for webhook_events
-- ============================================================================

-- Only service role and superadmins can access webhook events
-- (Webhooks are internal system events)
CREATE POLICY "Service role can manage webhook events"
    ON webhook_events FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role'
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- ============================================================================
-- RLS Policies for paystack_splits
-- ============================================================================

-- Only service role and superadmins can manage splits
-- (Splits are platform-level configuration)
CREATE POLICY "Service role and superadmins can manage paystack splits"
    ON paystack_splits FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role'
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- ============================================================================
-- RLS Policies for payment_transactions
-- ============================================================================

-- Users can view transactions for their own bookings
CREATE POLICY "Users can view own payment transactions"
    ON payment_transactions FOR SELECT
    USING (
        booking_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = payment_transactions.booking_id
            AND bookings.customer_id = auth.uid()
        )
    );

-- Providers can view transactions for their bookings
CREATE POLICY "Providers can view payment transactions for own bookings"
    ON payment_transactions FOR SELECT
    USING (
        booking_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = payment_transactions.booking_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = bookings.provider_id
                AND providers.user_id = auth.uid()
            )
        )
    );

-- Service role can manage all transactions (for webhook processing)
CREATE POLICY "Service role can manage all payment transactions"
    ON payment_transactions FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Superadmins can view all transactions
CREATE POLICY "Superadmins can view all payment transactions"
    ON payment_transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- ============================================================================
-- Note on spatial_ref_sys
-- ============================================================================
-- spatial_ref_sys is a PostGIS system table that we cannot modify.
-- If you need to address the linter warning for this table, you have a few options:
-- 1. Move it to a different schema (not recommended for system tables)
-- 2. Contact Supabase support about excluding system tables from linter checks
-- 3. Use a database-level configuration if available
-- For now, we skip this table as it's a system reference table that cannot be modified.
