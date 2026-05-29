-- Migration 632: Resync pricing_options → child variant offerings (multi-tier services)
-- =============================================================================
-- Ensures every active parent with 2+ pricing_options rows has a matching child
-- variant offering per tier, including rows without pricingName (auto-named).
-- Idempotent: skips insert when (parent_service_id, variant_name) already exists.
-- =============================================================================

DO $$
DECLARE
  r   RECORD;
  opt JSONB;
  opt_ord INT;
  v_price     NUMERIC;
  v_duration  INT;
  v_name      TEXT;
  v_pricing_name TEXT;
  tier_count  INT;
  used_names  TEXT[];
  base_name   TEXT;
  candidate   TEXT;
  suffix      INT;
BEGIN
  FOR r IN
    SELECT *
    FROM offerings
    WHERE (service_type = 'basic' OR service_type IS NULL)
      AND parent_service_id IS NULL
      AND is_active = TRUE
      AND pricing_options IS NOT NULL
      AND jsonb_typeof(pricing_options::jsonb) = 'array'
      AND jsonb_array_length(pricing_options::jsonb) > 1
  LOOP
    tier_count := jsonb_array_length(r.pricing_options::jsonb);
    used_names := ARRAY[]::TEXT[];
    v_pricing_name := NULLIF(TRIM(r.pricing_name), '');

    opt_ord := 0;
    FOR opt IN
      SELECT value
      FROM jsonb_array_elements(r.pricing_options::jsonb)
    LOOP
      base_name := NULLIF(TRIM(COALESCE(opt->>'pricingName', opt->>'pricing_name')), '');

      IF base_name IS NULL THEN
        IF opt_ord = 0 THEN
          base_name := COALESCE(v_pricing_name, 'Standard');
        ELSE
          base_name := 'Option ' || (opt_ord + 1)::TEXT;
        END IF;
      END IF;

      -- Dedupe variant names within this service
      candidate := base_name;
      IF candidate = ANY(used_names) THEN
        suffix := 2;
        LOOP
          candidate := base_name || ' (' || suffix::TEXT || ')';
          EXIT WHEN NOT (candidate = ANY(used_names));
          suffix := suffix + 1;
        END LOOP;
      END IF;
      used_names := array_append(used_names, candidate);
      v_name := candidate;

      v_price := COALESCE(NULLIF((opt->>'price')::numeric, 0), r.price);
      v_duration := COALESCE(NULLIF((opt->>'duration')::int, 0), r.duration_minutes);

      IF EXISTS (
        SELECT 1 FROM offerings
        WHERE parent_service_id = r.id
          AND service_type = 'variant'
          AND variant_name = v_name
      ) THEN
        UPDATE offerings
        SET
          title = r.title || ' - ' || v_name,
          duration_minutes = v_duration,
          price = v_price,
          variant_sort_order = opt_ord,
          is_active = r.is_active,
          online_booking_enabled = r.online_booking_enabled,
          updated_at = NOW()
        WHERE parent_service_id = r.id
          AND service_type = 'variant'
          AND variant_name = v_name;
      ELSE
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
          variant_sort_order,
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
          opt_ord,
          NOW(),
          NOW()
        );
      END IF;

      opt_ord := opt_ord + 1;
    END LOOP;

    -- Soft-delete variants whose names are no longer in pricing_options tiers
    UPDATE offerings
    SET is_active = FALSE, updated_at = NOW()
    WHERE parent_service_id = r.id
      AND service_type = 'variant'
      AND NOT (variant_name = ANY(used_names));
  END LOOP;
END $$;
