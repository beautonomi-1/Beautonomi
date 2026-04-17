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
-- BLOCK 3: Provider tax rates AND fee config overrides
--           Shows BOTH the tax rate (null vs 0 matters!) and whether the
--           provider has a customer_fee_config_id that overrides platform fees.
--           After the validate-booking.ts fix: NULL → platform default,
--           0 → no tax (explicit). Both are now handled correctly.
-- ============================================================================
SELECT
  p.id                                                                           AS provider_id,
  p.business_name,
  p.slug,
  p.status,
  p.tax_rate_percent,
  CASE
    WHEN p.tax_rate_percent IS NULL
      THEN '⚠ NULL — server falls back to platform default tax (check Block 1 taxes.default_tax_rate)'
    WHEN p.tax_rate_percent = 0
      THEN '✓ Explicit 0% — no tax charged (fixed by null-check in validate-booking)'
    ELSE format('%.2f%% — adds R%.2f on R500', p.tax_rate_percent, ROUND(500 * p.tax_rate_percent / 100, 2))
  END                                                                            AS tax_note,
  p.customer_fee_config_id,
  CASE
    WHEN p.customer_fee_config_id IS NOT NULL
      THEN '⚠ Provider has fee config override — platform_settings.payouts is IGNORED for this provider'
    ELSE '✓ Uses platform_settings.payouts (Block 1/2)'
  END                                                                            AS fee_source,
  -- Show the actual fee config row if one is assigned
  -- NOTE: platform_fee_config has no show_fee_to_customer column;
  --       visibility is determined by applies_to ('customer'|'provider'|'both')
  pfc.name                                                                       AS fee_config_name,
  pfc.fee_type                                                                   AS fee_config_type,
  pfc.fee_percentage                                                             AS fee_config_pct,
  pfc.fee_fixed_amount                                                           AS fee_config_fixed,
  pfc.min_booking_amount                                                         AS fee_config_min_booking,
  pfc.max_fee_amount                                                             AS fee_config_max_fee,
  pfc.applies_to                                                                 AS fee_config_applies_to,
  pfc.is_active                                                                  AS fee_config_active,
  p.tips_enabled
FROM providers p
LEFT JOIN platform_fee_config pfc ON pfc.id = p.customer_fee_config_id
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
-- BLOCK 5: What will a customer ACTUALLY be charged for a R500 booking?
--           Mirrors validate-booking.ts priority exactly:
--             1. provider.customer_fee_config_id → platform_fee_config row
--             2. platform_settings.payouts fallback
--           Tax: 0 if provider explicitly set 0% (NULL falls to platform default)
-- ============================================================================
-- NOTE: platform_fee_config has no show_fee_to_customer column.
--       Visibility is based on applies_to: 'customer'|'both' = shown, 'provider' = hidden.
--       Migration 123 assigned customer_default (10%) to ALL providers by default.
--       Run Block 3 to see which providers are affected and clear customer_fee_config_id if needed:
--         UPDATE providers SET customer_fee_config_id = NULL WHERE slug = 'your-slug';
WITH platform_fee AS (
  SELECT
    COALESCE(settings->'payouts'->>'platform_service_fee_type', 'percentage')          AS fee_type,
    COALESCE((settings->'payouts'->>'platform_service_fee_percentage')::NUMERIC, 0)    AS fee_pct,
    COALESCE((settings->'payouts'->>'platform_service_fee_fixed')::NUMERIC, 0)         AS fee_fixed,
    COALESCE((settings->'payouts'->>'show_service_fee_to_customer')::BOOLEAN, TRUE)    AS show_fee,
    COALESCE((settings->'taxes'->>'default_tax_rate')::NUMERIC, 0)                     AS platform_tax_rate
  FROM platform_settings
  WHERE is_active = TRUE
  ORDER BY tenant_id NULLS FIRST, updated_at DESC
  LIMIT 1
),
effective AS (
  SELECT
    p.id,
    p.business_name,
    p.slug,
    -- Tax: NULL → use platform default, 0 → no tax (explicit), N → N%
    CASE
      WHEN p.tax_rate_percent IS NULL THEN pf.platform_tax_rate
      ELSE p.tax_rate_percent
    END                                                                          AS effective_tax_rate,
    CASE
      WHEN p.tax_rate_percent IS NULL THEN 'platform default'
      ELSE 'provider explicit'
    END                                                                          AS tax_source,
    -- Fee: use fee config if assigned AND active, else platform settings
    CASE
      WHEN p.customer_fee_config_id IS NOT NULL AND pfc.is_active = TRUE THEN pfc.fee_type
      ELSE pf.fee_type
    END                                                                          AS effective_fee_type,
    CASE
      WHEN p.customer_fee_config_id IS NOT NULL AND pfc.is_active = TRUE THEN COALESCE(pfc.fee_percentage, 0)
      ELSE pf.fee_pct
    END                                                                          AS effective_fee_pct,
    CASE
      WHEN p.customer_fee_config_id IS NOT NULL AND pfc.is_active = TRUE THEN COALESCE(pfc.fee_fixed_amount, 0)
      ELSE pf.fee_fixed
    END                                                                          AS effective_fee_fixed,
    -- applies_to 'customer'|'both' → show; 'provider' → hidden (no show_fee_to_customer column)
    CASE
      WHEN p.customer_fee_config_id IS NOT NULL AND pfc.is_active = TRUE
        THEN pfc.applies_to IN ('customer', 'both')
      ELSE pf.show_fee
    END                                                                          AS effective_show_fee,
    CASE
      WHEN p.customer_fee_config_id IS NOT NULL AND pfc.is_active = TRUE
        THEN '⚠ fee config: ' || COALESCE(pfc.name, pfc.id::TEXT) || ' (' || pfc.fee_type || ')'
      ELSE 'platform_settings.payouts'
    END                                                                          AS fee_source
  FROM providers p
  CROSS JOIN platform_fee pf
  LEFT JOIN platform_fee_config pfc ON pfc.id = p.customer_fee_config_id
  WHERE p.status = 'active'
)
SELECT
  e.business_name,
  e.slug,
  500.00                                                                         AS "Subtotal",
  COALESCE(e.effective_tax_rate, 0) || '%'                                       AS "Tax rate",
  e.tax_source                                                                   AS "Tax source",
  ROUND(500.00 * COALESCE(e.effective_tax_rate, 0) / 100, 2)                    AS "Tax amount",
  e.effective_fee_type                                                           AS "Fee type",
  CASE e.effective_fee_type
    WHEN 'fixed_amount' THEN 'R' || e.effective_fee_fixed
    WHEN 'fixed'        THEN 'R' || e.effective_fee_fixed
    ELSE e.effective_fee_pct || '%'
  END                                                                            AS "Fee config",
  e.fee_source                                                                   AS "Fee source",
  e.effective_show_fee                                                           AS "Show fee?",
  CASE
    WHEN NOT COALESCE(e.effective_show_fee, TRUE) THEN 0
    WHEN e.effective_fee_type IN ('fixed', 'fixed_amount')   THEN e.effective_fee_fixed
    ELSE ROUND(500.00 * e.effective_fee_pct / 100, 2)
  END                                                                            AS "Service fee (shown)",
  ROUND(
    500.00
    + ROUND(500.00 * COALESCE(e.effective_tax_rate, 0) / 100, 2)
    + CASE
        WHEN NOT COALESCE(e.effective_show_fee, TRUE) THEN 0
        WHEN e.effective_fee_type IN ('fixed', 'fixed_amount') THEN e.effective_fee_fixed
        ELSE ROUND(500.00 * e.effective_fee_pct / 100, 2)
      END,
    2
  )                                                                              AS "Total customer pays"
FROM effective e
ORDER BY e.business_name;
