-- ============================================================================
-- Diagnose: Platform Service Fee Settings & Provider Tax Configuration
-- ============================================================================
-- Run each block separately in Supabase SQL editor (service role connection)
-- ============================================================================


-- ============================================================================
-- BLOCK 1: Raw platform_settings rows — see what's stored
-- ============================================================================
SELECT
  COALESCE(tenant_id::TEXT, '[GLOBAL]')                                          AS tenant_scope,
  is_active,
  created_at,
  updated_at,
  -- Payouts / fee config
  settings->'payouts'->>'platform_service_fee_type'                              AS fee_type,
  settings->'payouts'->>'platform_service_fee_percentage'                        AS fee_percentage,
  settings->'payouts'->>'platform_service_fee_fixed'                             AS fee_fixed,
  settings->'payouts'->>'show_service_fee_to_customer'                           AS show_service_fee,
  settings->'payouts'->>'provider_payout_percentage'                             AS payout_pct,
  -- Payment types
  settings->'payment_types'->>'cash'                                             AS cash_enabled,
  settings->'payment_types'->>'card'                                             AS card_enabled,
  settings->'payment_types'->>'gift_card'                                        AS gift_card_enabled,
  -- Sanity notes
  CASE
    WHEN NOT (settings ? 'payouts')
      THEN '⚠ NO payouts key — API returns hardcoded defaults (5% percentage, show=true)'
    WHEN settings->'payouts'->>'platform_service_fee_type' IS NULL
      THEN '⚠ fee_type missing — falls back to percentage in API'
    WHEN settings->'payouts'->>'platform_service_fee_type' = 'fixed'
      AND COALESCE((settings->'payouts'->>'platform_service_fee_fixed')::NUMERIC, 0) = 0
      THEN '⚠ fee_type=fixed but fee_fixed=0 — all customers see R0 service fee'
    ELSE 'OK'
  END                                                                            AS note
FROM platform_settings
WHERE is_active = TRUE
ORDER BY tenant_id NULLS FIRST, updated_at DESC;


-- ============================================================================
-- BLOCK 2: Effective fees the booking API actually returns
--           (mirrors /api/public/platform-fees logic exactly)
-- ============================================================================
WITH latest_settings AS (
  SELECT DISTINCT ON (COALESCE(tenant_id::TEXT, '__global__'))
    tenant_id,
    settings
  FROM platform_settings
  WHERE is_active = TRUE
  ORDER BY COALESCE(tenant_id::TEXT, '__global__'), updated_at DESC
)
SELECT
  COALESCE(tenant_id::TEXT, '[GLOBAL]')                                              AS tenant_scope,
  -- What the API returns
  COALESCE(settings->'payouts'->>'platform_service_fee_type', 'percentage')          AS api_fee_type,
  COALESCE((settings->'payouts'->>'platform_service_fee_percentage')::NUMERIC, 5)    AS api_fee_percentage,
  COALESCE((settings->'payouts'->>'platform_service_fee_fixed')::NUMERIC, 0)         AS api_fee_fixed,
  COALESCE(settings->'payouts'->>'show_service_fee_to_customer', 'true')             AS api_show_to_customer,
  -- What amount a R500 booking would charge
  CASE
    WHEN COALESCE(settings->'payouts'->>'platform_service_fee_type', 'percentage') = 'fixed'
      THEN COALESCE((settings->'payouts'->>'platform_service_fee_fixed')::NUMERIC, 0)
    WHEN COALESCE(settings->'payouts'->>'show_service_fee_to_customer', 'true')::BOOLEAN = TRUE
      THEN ROUND(500 * COALESCE((settings->'payouts'->>'platform_service_fee_percentage')::NUMERIC, 5) / 100, 2)
    ELSE 0
  END                                                                                AS fee_on_r500_booking,
  -- Source
  CASE
    WHEN settings IS NULL OR NOT (settings ? 'payouts')
      THEN 'HARDCODED DEFAULTS — no payouts section in DB'
    ELSE 'FROM DATABASE'
  END                                                                                AS data_source
FROM latest_settings;


-- ============================================================================
-- BLOCK 3: Provider tax rates
--           (feeds bookingState.taxRate in the customer booking flow)
-- ============================================================================
SELECT
  p.id                                                                           AS provider_id,
  p.business_name,
  p.slug,
  p.status,
  p.tax_rate_percent,
  p.tips_enabled,
  CASE
    WHEN p.tax_rate_percent IS NULL OR p.tax_rate_percent = 0
      THEN 'No tax — tax line will NOT appear in booking flow'
    ELSE format(
      '%.2f%% tax — adds R%.2f on a R500 booking',
      p.tax_rate_percent,
      ROUND(500 * p.tax_rate_percent / 100, 2)
    )
  END                                                                            AS tax_note
FROM providers p
WHERE p.status = 'active'
ORDER BY p.business_name;


-- ============================================================================
-- BLOCK 4: Recent bookings — actual fee & tax values stored
--           Flags mismatches and walk-in bookings with unexpected fees
-- ============================================================================
SELECT
  b.booking_number,
  b.created_at::DATE                                                             AS booked_date,
  b.booking_source,
  b.status,
  b.payment_status,
  b.subtotal,
  b.discount_amount,
  b.tax_rate,
  b.tax_amount,
  b.service_fee_percentage,
  b.service_fee_amount,
  b.travel_fee,
  b.tip_amount,
  b.total_amount,
  -- What total_amount SHOULD be
  ROUND(
    COALESCE(b.subtotal, 0)
    - COALESCE(b.discount_amount, 0)
    + COALESCE(b.tax_amount, 0)
    + COALESCE(b.service_fee_amount, 0)
    + COALESCE(b.travel_fee, 0)
    + COALESCE(b.tip_amount, 0),
    2
  )                                                                              AS expected_total,
  CASE
    WHEN ABS(
      COALESCE(b.total_amount, 0) - (
        COALESCE(b.subtotal, 0)
        - COALESCE(b.discount_amount, 0)
        + COALESCE(b.tax_amount, 0)
        + COALESCE(b.service_fee_amount, 0)
        + COALESCE(b.travel_fee, 0)
        + COALESCE(b.tip_amount, 0)
      )
    ) > 0.05
      THEN '⚠ TOTAL MISMATCH'
    ELSE 'OK'
  END                                                                            AS total_check,
  p.tax_rate_percent                                                             AS provider_tax_rate_now,
  CASE
    WHEN COALESCE(b.tax_amount, 0) > 0
      AND COALESCE(p.tax_rate_percent, 0) = 0
      THEN '⚠ Tax stored but provider now has no tax rate'
    WHEN COALESCE(b.tax_amount, 0) = 0
      AND COALESCE(p.tax_rate_percent, 0) > 0
      THEN '⚠ No tax stored — tax may have been missed in booking flow'
    ELSE 'OK'
  END                                                                            AS tax_consistency,
  CASE
    WHEN b.booking_source = 'walk_in' AND COALESCE(b.service_fee_amount, 0) > 0
      THEN '⚠ Walk-in booking should have R0 service fee'
    ELSE 'OK'
  END                                                                            AS fee_source_check
FROM bookings b
JOIN providers p ON p.id = b.provider_id
ORDER BY b.created_at DESC
LIMIT 20;


-- ============================================================================
-- BLOCK 5: What should a customer see for a R500 booking?
--           Full calculation for each active provider using current DB config
-- ============================================================================
WITH fee_config AS (
  SELECT
    COALESCE(settings->'payouts'->>'platform_service_fee_type', 'percentage')          AS fee_type,
    COALESCE((settings->'payouts'->>'platform_service_fee_percentage')::NUMERIC, 5)    AS fee_pct,
    COALESCE((settings->'payouts'->>'platform_service_fee_fixed')::NUMERIC, 0)         AS fee_fixed,
    COALESCE((settings->'payouts'->>'show_service_fee_to_customer')::BOOLEAN, TRUE)    AS show_fee
  FROM platform_settings
  WHERE is_active = TRUE
  ORDER BY tenant_id NULLS FIRST, updated_at DESC
  LIMIT 1
)
SELECT
  p.business_name,
  p.slug,
  500.00                                                                         AS "Subtotal",
  COALESCE(p.tax_rate_percent, 0) || '%'                                        AS "Tax rate",
  ROUND(500.00 * COALESCE(p.tax_rate_percent, 0) / 100, 2)                      AS "Tax amount",
  fc.fee_type                                                                    AS "Fee type",
  CASE fc.fee_type
    WHEN 'fixed'      THEN 'R' || fc.fee_fixed
    WHEN 'percentage' THEN fc.fee_pct || '%'
  END                                                                            AS "Fee config",
  fc.show_fee                                                                    AS "Show fee?",
  CASE
    WHEN NOT fc.show_fee THEN 0
    WHEN fc.fee_type = 'fixed' THEN fc.fee_fixed
    ELSE ROUND(500.00 * fc.fee_pct / 100, 2)
  END                                                                            AS "Service fee (shown)",
  ROUND(
    500.00
    + ROUND(500.00 * COALESCE(p.tax_rate_percent, 0) / 100, 2)
    + CASE
        WHEN NOT fc.show_fee THEN 0
        WHEN fc.fee_type = 'fixed' THEN fc.fee_fixed
        ELSE ROUND(500.00 * fc.fee_pct / 100, 2)
      END,
    2
  )                                                                              AS "Total customer pays"
FROM providers p
CROSS JOIN fee_config fc
WHERE p.status = 'active'
ORDER BY p.business_name;
