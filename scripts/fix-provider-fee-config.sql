-- =============================================================================
-- FIX: Provider fee config override alignment
-- =============================================================================
-- Migration 123 (123_add_service_fees.sql) set customer_fee_config_id = the
-- 'customer_default' fee config (10% percentage) on ALL existing providers.
-- This overrides platform_settings.payouts (R15 fixed) for every provider.
--
-- Run Block A to see the current state, then Block B to clear the override for
-- all providers (or Block C to clear for a specific provider only).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Block A — Diagnose: which providers are overridden vs. using platform default
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.id                                  AS provider_id,
  p.business_name,
  p.slug,
  p.customer_fee_config_id,
  pfc.name                              AS override_config_name,
  pfc.fee_type                          AS override_fee_type,
  pfc.fee_percentage                    AS override_pct,
  pfc.fee_fixed_amount                  AS override_fixed,
  pfc.applies_to                        AS override_applies_to,
  pfc.is_active                         AS override_is_active,
  CASE
    WHEN p.customer_fee_config_id IS NOT NULL
      THEN '⚠ Uses fee config override — platform_settings.payouts IGNORED'
    ELSE '✓ Uses platform_settings.payouts (R15 fixed or whatever is configured there)'
  END                                   AS fee_source
FROM providers p
LEFT JOIN platform_fee_config pfc ON pfc.id = p.customer_fee_config_id
WHERE p.status = 'active'
ORDER BY p.business_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Block B — FIX: Clear the override for ALL providers
--           (they will fall back to platform_settings.payouts = R15 fixed)
-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORTANT: Review Block A first. Only run this if you want ALL providers to
--            use the platform-wide default fee (no per-provider override).
-- ─────────────────────────────────────────────────────────────────────────────

-- Uncomment and run to apply:
/*
UPDATE providers
SET customer_fee_config_id = NULL
WHERE customer_fee_config_id IS NOT NULL
  AND status = 'active';
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Block C — FIX: Clear the override for a SPECIFIC provider by slug
-- ─────────────────────────────────────────────────────────────────────────────

-- Uncomment and replace 'bantu' with the target slug:
/*
UPDATE providers
SET customer_fee_config_id = NULL
WHERE slug = 'bantu';
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Block D — Verify: after running B or C, re-run the diagnose to confirm
-- ─────────────────────────────────────────────────────────────────────────────
-- Re-run Block A above, or run scripts/diagnose-fees-and-tax.sql Block 5
-- to see what a customer will now actually be charged.

-- ─────────────────────────────────────────────────────────────────────────────
-- Block E — Check & update platform_settings.payouts to R15 fixed fee
-- ─────────────────────────────────────────────────────────────────────────────
-- platform_settings has columns: id, settings (JSONB), is_active, tenant_id,
-- created_at, updated_at. There is NO key/value column.
-- The payouts config lives inside settings->>'payouts' JSON object.
-- ─────────────────────────────────────────────────────────────────────────────

-- E1: Check current payouts config in platform_settings:
SELECT
  id,
  tenant_id,
  is_active,
  updated_at,
  settings -> 'payouts'                                          AS payouts_config,
  settings -> 'payouts' -> 'platform_service_fee_type'          AS fee_type,
  settings -> 'payouts' -> 'platform_service_fee_fixed'         AS fee_fixed,
  settings -> 'payouts' -> 'platform_service_fee_percentage'    AS fee_pct,
  settings -> 'payouts' -> 'show_service_fee_to_customer'       AS show_fee
FROM platform_settings
WHERE is_active = true
ORDER BY tenant_id NULLS FIRST, updated_at DESC
LIMIT 5;

-- E2: Set payouts to R15 fixed fee (uncomment to apply).
--     This applies to the GLOBAL row (tenant_id IS NULL).
--     Run E1 first to verify the current state.
/*
UPDATE platform_settings
SET settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(settings, '{}'::jsonb),
          '{payouts,platform_service_fee_type}',       '"fixed"'::jsonb
        ),
        '{payouts,platform_service_fee_fixed}',        '15'::jsonb
      ),
      '{payouts,platform_service_fee_percentage}',     '0'::jsonb
    ),
    '{payouts,show_service_fee_to_customer}',          'true'::jsonb
  ),
  '{payouts,cash_enabled_on_platform}',                'false'::jsonb
)
WHERE is_active = true
  AND tenant_id IS NULL;   -- global platform config only (no tenant override)
*/

-- E3: Verify after applying E2 — re-run E1 above.

-- ─────────────────────────────────────────────────────────────────────────────
-- Block F — Full accounting verification query
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this after all fixes to confirm every booking's stored amounts are sane.
-- Shows the last 20 bookings with their financial breakdown.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  b.id                                                              AS booking_id,
  b.booking_number,
  p.business_name,
  p.slug,
  b.booking_source,
  b.payment_status,
  b.subtotal,
  b.tax_rate,
  b.tax_amount,
  b.service_fee_percentage,
  b.service_fee_amount,
  b.tip_amount,
  b.travel_fee,
  b.discount_amount,
  b.total_amount,
  -- Verify: subtotal + tax + fee + tip + travel - discount = total_amount
  ROUND(
    b.subtotal
    + COALESCE(b.tax_amount, 0)
    + COALESCE(b.service_fee_amount, 0)
    + COALESCE(b.tip_amount, 0)
    + COALESCE(b.travel_fee, 0)
    - COALESCE(b.discount_amount, 0),
    2
  )                                                                 AS expected_total,
  ROUND(
    b.total_amount - (
      b.subtotal
      + COALESCE(b.tax_amount, 0)
      + COALESCE(b.service_fee_amount, 0)
      + COALESCE(b.tip_amount, 0)
      + COALESCE(b.travel_fee, 0)
      - COALESCE(b.discount_amount, 0)
    ),
    2
  )                                                                 AS variance,
  b.created_at
FROM bookings b
JOIN providers p ON p.id = b.provider_id
WHERE b.created_at > NOW() - INTERVAL '30 days'
ORDER BY b.created_at DESC
LIMIT 20;

-- ─────────────────────────────────────────────────────────────────────────────
-- Block G — Finance ledger reconciliation (last 30 days)
-- Shows sum of finance_transaction rows per booking, expected total, and variance.
-- variance ≈ 0.00 means the ledger is correct.
-- ledger_row_count > 6 for a booking with tip+tax+travel+fee → DUPLICATE ROWS.
-- ledger_row_count = 0 for a paid booking → MISSING LEDGER (needs backfill).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  b.booking_number,
  p.business_name,
  b.payment_status,
  b.total_amount                                                    AS booking_total,
  -- Expected total = subtotal + tax + service_fee + tip + travel - discounts
  ROUND(
    COALESCE(b.subtotal, 0)
    + COALESCE(b.tax_amount, 0)
    + COALESCE(b.service_fee_amount, 0)
    + COALESCE(b.tip_amount, 0)
    + COALESCE(b.travel_fee, 0)
    - COALESCE(b.discount_amount, 0),
    2
  )                                                                 AS expected_total,
  ROUND(b.total_amount - (
    COALESCE(b.subtotal, 0)
    + COALESCE(b.tax_amount, 0)
    + COALESCE(b.service_fee_amount, 0)
    + COALESCE(b.tip_amount, 0)
    + COALESCE(b.travel_fee, 0)
    - COALESCE(b.discount_amount, 0)
  ), 2)                                                             AS booking_variance,
  -- Ledger sums
  SUM(CASE WHEN ft.transaction_type = 'payment'
      THEN ft.amount ELSE 0 END)                                   AS ledger_commission_base,
  SUM(CASE WHEN ft.transaction_type = 'provider_earnings'
      THEN ft.amount ELSE 0 END)                                   AS ledger_provider_earnings,
  SUM(CASE WHEN ft.transaction_type = 'service_fee'
      THEN ft.amount ELSE 0 END)                                   AS ledger_service_fee,
  SUM(CASE WHEN ft.transaction_type = 'tax'
      THEN ft.amount ELSE 0 END)                                   AS ledger_tax,
  SUM(CASE WHEN ft.transaction_type = 'tip'
      THEN ft.amount ELSE 0 END)                                   AS ledger_tip,
  SUM(CASE WHEN ft.transaction_type = 'travel_fee'
      THEN ft.amount ELSE 0 END)                                   AS ledger_travel,
  COUNT(ft.id)                                                     AS ledger_row_count,
  CASE
    WHEN COUNT(ft.id) = 0 THEN '⚠ MISSING LEDGER — run Block H to backfill'
    WHEN COUNT(ft.id) > 8 THEN '⚠ DUPLICATE ROWS — run Block I to de-duplicate'
    ELSE '✓ OK'
  END                                                              AS ledger_status
FROM bookings b
JOIN providers p ON p.id = b.provider_id
LEFT JOIN finance_transactions ft ON ft.booking_id = b.id
WHERE b.payment_status IN ('paid', 'partially_paid')
  AND b.created_at > NOW() - INTERVAL '30 days'
GROUP BY b.id, b.booking_number, p.business_name, b.total_amount, b.payment_status,
         b.subtotal, b.tax_amount, b.service_fee_amount, b.tip_amount, b.travel_fee, b.discount_amount
ORDER BY b.created_at DESC
LIMIT 30;

-- ─────────────────────────────────────────────────────────────────────────────
-- Block H — Backfill missing ledger entries for paid bookings with 0 rows
-- Generates INSERT statements — review output before pasting into Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────
-- This query identifies paid bookings with no ledger and generates the INSERT
-- statements. The service_fee row only fires when service_fee_amount > 0.
-- ─────────────────────────────────────────────────────────────────────────────
WITH missing AS (
  SELECT
    b.id                            AS booking_id,
    b.booking_number,
    b.provider_id,
    b.tenant_id,
    b.total_amount,
    COALESCE(b.subtotal, 0)         AS subtotal,
    COALESCE(b.tax_amount, 0)       AS tax_amount,
    COALESCE(b.tax_rate, 0)         AS tax_rate,
    COALESCE(b.tip_amount, 0)       AS tip_amount,
    COALESCE(b.travel_fee, 0)       AS travel_fee,
    COALESCE(b.service_fee_amount, 0) AS service_fee_amount,
    COALESCE(b.discount_amount, 0)  AS discount_amount,
    -- commission_base = total - tip - travel - tax - service_fee
    GREATEST(0, b.total_amount
      - COALESCE(b.tip_amount, 0)
      - COALESCE(b.travel_fee, 0)
      - COALESCE(b.tax_amount, 0)
      - COALESCE(b.service_fee_amount, 0)
    )                               AS commission_base,
    NOW()                           AS now_ts
  FROM bookings b
  LEFT JOIN finance_transactions ft ON ft.booking_id = b.id AND ft.transaction_type = 'payment'
  WHERE b.payment_status IN ('paid', 'partially_paid')
    AND ft.id IS NULL   -- no payment ledger row exists
)
SELECT
  'INSERT INTO finance_transactions (booking_id, provider_id, tenant_id, transaction_type, amount, fees, commission, net, description, created_at) VALUES ('
  || quote_literal(booking_id) || ', '
  || quote_literal(provider_id) || ', '
  || COALESCE(quote_literal(tenant_id), 'NULL') || ', '
  || '''payment'', '
  || commission_base || ', 0, 0, 0, '
  || quote_literal('Payment for booking ' || booking_number) || ', '
  || quote_literal(now_ts) || ');'              AS sql_payment,
  'INSERT INTO finance_transactions (booking_id, provider_id, tenant_id, transaction_type, amount, fees, commission, net, description, created_at) VALUES ('
  || quote_literal(booking_id) || ', '
  || quote_literal(provider_id) || ', '
  || COALESCE(quote_literal(tenant_id), 'NULL') || ', '
  || '''provider_earnings'', '
  || (commission_base + travel_fee + tip_amount) || ', 0, 0, '
  || (commission_base + travel_fee + tip_amount) || ', '
  || quote_literal('Provider earnings for booking ' || booking_number) || ', '
  || quote_literal(now_ts) || ');'             AS sql_provider_earnings,
  booking_id,
  booking_number,
  commission_base,
  tip_amount,
  travel_fee,
  tax_amount,
  service_fee_amount
FROM missing
ORDER BY booking_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Block I — De-duplicate finance_transaction rows (keep the OLDEST per type per booking)
-- ROOT CAUSE: Paystack webhooks retried → charge-success.ts wrote rows twice.
-- Fixed in code (idempotency guard added). This SQL removes historical duplicates.
-- ─────────────────────────────────────────────────────────────────────────────

-- I1: Preview what will be de-duplicated (run this first):
--     Shows both booking-level rows (safe to delete rn>1) and per-charge rows
--     (only delete rn>1 if amount matches previous row — true retry).
WITH ranked AS (
  SELECT
    id,
    booking_id,
    transaction_type,
    amount,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY booking_id, transaction_type
      ORDER BY created_at ASC
    ) AS rn,
    LAG(amount) OVER (
      PARTITION BY booking_id, transaction_type
      ORDER BY created_at ASC
    ) AS prev_amount
  FROM finance_transactions
  WHERE booking_id IS NOT NULL
    AND transaction_type IN ('payment', 'provider_earnings', 'service_fee', 'tax', 'tip', 'travel_fee')
)
SELECT
  r.booking_id,
  b.booking_number,
  r.transaction_type,
  r.amount,
  r.prev_amount,
  r.created_at,
  r.rn,
  CASE
    WHEN r.rn = 1 THEN '✓ keep'
    WHEN r.transaction_type IN ('service_fee', 'tax', 'tip', 'travel_fee')
      THEN '✗ DELETE (booking-level duplicate — I2a)'
    WHEN r.amount = r.prev_amount
      THEN '✗ DELETE (same-amount retry — I2b)'
    ELSE '⚠ REVIEW (different amount — may be 2nd charge, keep unless confirmed retry)'
  END AS action
FROM ranked r
JOIN bookings b ON b.id = r.booking_id
WHERE r.rn > 1
ORDER BY r.booking_id, r.transaction_type;

-- I2: Execute de-duplication (uncomment after reviewing I1 output):
--
-- IMPORTANT — Two distinct ledger-row classes:
--
--   • BOOKING-LEVEL (record once per booking regardless of how many Paystack charges):
--       service_fee, tax, tip, travel_fee
--     → Delete any rn > 1 (true duplicates from webhook retry or 2nd charge).
--
--   • PER-CHARGE (one row per Paystack charge — legitimate to have multiple):
--       payment, provider_earnings
--     → Do NOT de-duplicate; each row represents a separate Paystack charge amount.
--
-- Only uncomment I2a (booking-level de-dup). Leave I2b commented unless you have
-- confirmed via audit that the duplicate payment/earnings rows are identical retries.

-- I2a: Remove duplicate booking-level rows (safe to run):
/*
DELETE FROM finance_transactions
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY booking_id, transaction_type
        ORDER BY created_at ASC  -- keep oldest
      ) AS rn
    FROM finance_transactions
    WHERE booking_id IS NOT NULL
      AND transaction_type IN ('service_fee', 'tax', 'tip', 'travel_fee')
  ) ranked
  WHERE rn > 1
);
*/

-- I2b: Remove duplicate payment/provider_earnings rows ONLY IF amounts are identical
--      (true retry of the same charge, not a second installment):
/*
DELETE FROM finance_transactions
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      amount,
      LAG(amount) OVER (
        PARTITION BY booking_id, transaction_type
        ORDER BY created_at ASC
      ) AS prev_amount,
      ROW_NUMBER() OVER (
        PARTITION BY booking_id, transaction_type
        ORDER BY created_at ASC
      ) AS rn
    FROM finance_transactions
    WHERE booking_id IS NOT NULL
      AND transaction_type IN ('payment', 'provider_earnings')
  ) ranked
  WHERE rn > 1 AND amount = prev_amount  -- only same-amount duplicates (retries)
);
*/

-- I3: After de-duplication, re-run Block G to verify ledger_row_count values:
--
--   Single Paystack charge  → expect ≤ 6 rows (payment, provider_earnings,
--                             and up to 4 non-zero booking-level rows)
--   Two Paystack charges    → expect ≤ 8 rows (2×payment + 2×provider_earnings
--                             + up to 4 booking-level rows each recorded once)
--
-- Also verify that ledger_status shows '✓ ok' for all paid bookings.
--
-- Summary of I1 output for the two affected bookings (2026-04-10):
--   BTN-20260410-100447-4739 → I2a deletes service_fee/tax/tip/travel_fee duplicates.
--                              payment rn=2 (R100 ≠ R119.14) and
--                              provider_earnings rn=2 (R210.54 ≠ R101.27) are KEPT
--                              as legitimate second-charge rows.
--   BTN-20260410-070433-6813 → I2a deletes service_fee/tax/tip duplicates.
--                              payment rn=2 (R350 ≠ R385) and
--                              provider_earnings rn=2 (R385 ≠ R327.25) are KEPT.
