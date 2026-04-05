-- Migration 412: Convert pricing_options JSON → child variant offerings
-- =============================================================================
-- Background
-- ----------
-- The provider portal stores service pricing variants in a JSONB column
-- `pricing_options` on the parent offering row, e.g.:
--   [{"id":"1","price":100,"duration":90,"priceType":"fixed","pricingName":"Long Nails"},
--    {"id":"1775111918507","price":0,"duration":60,"priceType":"fixed","pricingName":"Short Nails"}]
--
-- The booking flow and `services_with_variants` view only discover variants by
-- looking for child `offerings` rows with:
--   parent_service_id = parent.id  AND  service_type = 'variant'
--
-- Because nothing ever created those child rows, variants never appear in the
-- customer booking flow.  This migration bridges the gap.
--
-- What it does
-- ------------
-- For every active service (service_type != 'variant', parent_service_id IS NULL)
-- that has a non-empty pricing_options array with at least one entry carrying a
-- non-blank pricingName, one child offering row is inserted per option — unless a
-- child with the same variant_name already exists (idempotent).
--
-- Price rule: if the option price is 0, fall back to the parent service price
-- (providers often omit the price when adding extra options).
-- =============================================================================

DO $$
DECLARE
  r   RECORD;
  opt JSONB;
  v_price     NUMERIC;
  v_duration  INT;
  v_name      TEXT;
BEGIN
  FOR r IN
    SELECT *
    FROM offerings
    WHERE (service_type = 'basic' OR service_type IS NULL)
      AND parent_service_id IS NULL
      AND is_active = TRUE
      AND pricing_options IS NOT NULL
      AND pricing_options::text NOT IN ('[]', 'null', '')
  LOOP
    FOR opt IN
      SELECT value
      FROM   jsonb_array_elements(
               CASE jsonb_typeof(r.pricing_options::jsonb)
                 WHEN 'array' THEN r.pricing_options::jsonb
                 ELSE '[]'::jsonb
               END
             )
    LOOP
      v_name := NULLIF(TRIM(opt->>'pricingName'), '');
      CONTINUE WHEN v_name IS NULL;

      -- Skip if child already exists
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM offerings
        WHERE parent_service_id = r.id
          AND service_type = 'variant'
          AND variant_name = v_name
      );

      v_price    := COALESCE(NULLIF((opt->>'price')::numeric, 0), r.price);
      v_duration := COALESCE(NULLIF((opt->>'duration')::int,  0), r.duration_minutes);

      INSERT INTO offerings (
        provider_id,
        parent_service_id,
        service_type,
        title,
        variant_name,
        description,
        duration_minutes,
        buffer_minutes,
        price,
        currency,
        supports_at_home,
        supports_at_salon,
        at_home_radius_km,
        at_home_price_adjustment,
        thumbnail_url,
        images,
        is_active,
        online_booking_enabled,
        aftercare_description,
        tax_rate,
        provider_category_id,
        team_member_commission_enabled,
        service_available_for,
        team_member_ids,
        display_order,
        created_at,
        updated_at
      )
      VALUES (
        r.provider_id,
        r.id,
        'variant',
        r.title || ' - ' || v_name,
        v_name,
        r.description,
        v_duration,
        r.buffer_minutes,
        v_price,
        r.currency,
        r.supports_at_home,
        r.supports_at_salon,
        r.at_home_radius_km,
        r.at_home_price_adjustment,
        r.thumbnail_url,
        r.images,
        r.is_active,
        r.online_booking_enabled,
        r.aftercare_description,
        r.tax_rate,
        r.provider_category_id,
        r.team_member_commission_enabled,
        r.service_available_for,
        r.team_member_ids,
        0,
        NOW(),
        NOW()
      );

    END LOOP;
  END LOOP;
END $$;

-- Update variant_sort_order so variants appear in their pricing_options order
-- (optional clean-up — keeps display consistent with provider portal ordering)
UPDATE offerings
SET    variant_sort_order = src.sort_ord
FROM (
  SELECT
    v.id           AS variant_id,
    (opt.ord - 1)  AS sort_ord
  FROM   offerings o
  JOIN   offerings v
         ON  v.parent_service_id = o.id
         AND v.service_type      = 'variant'
  CROSS JOIN LATERAL jsonb_array_elements(
         CASE jsonb_typeof(o.pricing_options::jsonb)
           WHEN 'array' THEN o.pricing_options::jsonb
           ELSE '[]'::jsonb
         END
       ) WITH ORDINALITY AS opt(val, ord)
  WHERE  o.service_type != 'variant'
    AND  o.parent_service_id IS NULL
    AND  o.pricing_options IS NOT NULL
    AND  NULLIF(TRIM(opt.val->>'pricingName'), '') IS NOT NULL
    AND  v.variant_name = NULLIF(TRIM(opt.val->>'pricingName'), '')
) src
WHERE  offerings.id = src.variant_id;
