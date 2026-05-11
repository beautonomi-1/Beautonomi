-- §Finance-truth 2026-05: lines-only subtotal heuristic + walk-in discount/membership split + audit trail
--
-- Idempotency: each pass uses a heuristic that becomes false the moment the row
-- has been normalized, so re-running the migration is a no-op for already-fixed
-- rows.
--   Pass A: matches when stored subtotal == lines_sum + travel_fee (off by >=0.02).
--   Pass B: matches when stored discount_amount >= membership_discount_amount AND
--           stored row is a walk-in. After we strip membership from discount, the
--           heuristic fails next run.
--   Pass C: matches when stored subtotal + discount_amount ≈ raw_lines AND a
--           package_id is set (legacy public path bug). After rewrite, subtotal
--           equals raw_lines and the heuristic stops matching.
--
-- Safety: in every pass we recompute a candidate `total_amount` from the new
-- decomposed columns. If that drifts more than 1 cent from the stored
-- total_amount we INSERT into `pricing_normalization_audit` with `*_skipped_drift`
-- and DO NOT touch the row. This guarantees we never silently change financials
-- on bookings that don't reconcile, leaving them for manual investigation.
--
-- The audit table is append-only and ON DELETE CASCADE so removing a booking
-- removes its audit history. Re-running this migration may insert duplicate
-- audit rows for skipped/unfixable bookings — that is intentional (each run is
-- a snapshot).

CREATE TABLE IF NOT EXISTS public.pricing_normalization_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  migration_version TEXT NOT NULL DEFAULT '583',
  change_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  old_subtotal NUMERIC(14, 2),
  new_subtotal NUMERIC(14, 2),
  old_discount_amount NUMERIC(14, 2),
  new_discount_amount NUMERIC(14, 2),
  old_total_amount NUMERIC(14, 2),
  new_total_amount NUMERIC(14, 2),
  drift_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_normalization_audit_booking_id
  ON public.pricing_normalization_audit (booking_id);

CREATE INDEX IF NOT EXISTS idx_pricing_normalization_audit_change_type
  ON public.pricing_normalization_audit (change_type);

DO $$
DECLARE
  r RECORD;
  v_lines NUMERIC;
  v_travel NUMERIC;
  v_old_sub NUMERIC;
  v_new_sub NUMERIC;
  v_old_disc NUMERIC;
  v_new_disc NUMERIC;
  v_pf NUMERIC;
  v_recon NUMERIC;
  v_old_total NUMERIC;
  v_drift_cents INTEGER;
BEGIN
  -- Pass A: subtotal stored as (lines + travel) while travel_fee is also set
  FOR r IN
    SELECT b.*
    FROM public.bookings b
    WHERE COALESCE(b.travel_fee, 0) > 0.005
  LOOP
    SELECT
      COALESCE(
        (SELECT SUM(bs.price::NUMERIC) FROM public.booking_services bs WHERE bs.booking_id = r.id),
        0
      )
      + COALESCE(
        (SELECT SUM(ba.price::NUMERIC * COALESCE(ba.quantity, 1)::NUMERIC) FROM public.booking_addons ba WHERE ba.booking_id = r.id),
        0
      )
      + COALESCE(
        (SELECT SUM(bp.total_price::NUMERIC) FROM public.booking_products bp WHERE bp.booking_id = r.id),
        0
      )
    INTO v_lines;

    v_old_sub := r.subtotal::NUMERIC;
    v_travel := COALESCE(r.travel_fee, 0)::NUMERIC;

    IF v_lines IS NULL OR v_lines < 0 THEN
      CONTINUE;
    END IF;

    IF ABS(v_old_sub - v_lines - v_travel) >= 0.02 THEN
      CONTINUE;
    END IF;

    v_new_sub := v_lines;

    v_pf := COALESCE(NULLIF(r.platform_fee_amount, 0), r.service_fee_amount, 0)::NUMERIC;

    v_recon :=
      v_new_sub + v_travel
      + COALESCE(r.tax_amount, 0)::NUMERIC
      + v_pf
      + COALESCE(r.tip_amount, 0)::NUMERIC
      - COALESCE(r.discount_amount, 0)::NUMERIC
      - COALESCE(r.promotion_discount_amount, 0)::NUMERIC
      - COALESCE(r.membership_discount_amount, 0)::NUMERIC
      - COALESCE(r.loyalty_discount_amount, 0)::NUMERIC
      - COALESCE(r.cancellation_fee, 0)::NUMERIC;

    v_old_total := r.total_amount::NUMERIC;
    v_drift_cents := ROUND(ABS(v_recon - v_old_total) * 100)::INTEGER;

    IF v_drift_cents > 1 THEN
      INSERT INTO public.pricing_normalization_audit (
        booking_id, change_type, details,
        old_subtotal, new_subtotal, old_total_amount, new_total_amount, drift_cents
      ) VALUES (
        r.id,
        'subtotal_travel_skipped_drift',
        jsonb_build_object(
          'reason', 'reconstructed_total_does_not_match_stored_total',
          'lines_sum', v_lines,
          'travel_fee', v_travel
        ),
        v_old_sub, v_new_sub, v_old_total, v_recon, v_drift_cents
      );
      CONTINUE;
    END IF;

    INSERT INTO public.pricing_normalization_audit (
      booking_id, change_type, details,
      old_subtotal, new_subtotal, old_total_amount, new_total_amount, drift_cents
    ) VALUES (
      r.id,
      'subtotal_lines_only_minus_travel',
      jsonb_build_object('lines_sum', v_lines, 'travel_fee', v_travel),
      v_old_sub, v_new_sub, v_old_total, v_recon, v_drift_cents
    );

    UPDATE public.bookings
    SET
      subtotal = v_new_sub,
      total_amount = v_recon,
      updated_at = NOW()
    WHERE id = r.id;
  END LOOP;

  -- Pass B: walk-in rows where discount_amount likely still includes membership (legacy mobile)
  FOR r IN
    SELECT b.*
    FROM public.bookings b
    WHERE COALESCE(b.booking_source, 'online') = 'walk_in'
      AND COALESCE(b.membership_discount_amount, 0) > 0.005
      AND COALESCE(b.discount_amount, 0) + 0.005 >= COALESCE(b.membership_discount_amount, 0)
  LOOP
    v_old_disc := COALESCE(r.discount_amount, 0)::NUMERIC;
    v_new_disc := GREATEST(0, v_old_disc - COALESCE(r.membership_discount_amount, 0)::NUMERIC);

    IF ABS(v_new_disc - v_old_disc) < 0.005 THEN
      CONTINUE;
    END IF;

    v_pf := COALESCE(NULLIF(r.platform_fee_amount, 0), r.service_fee_amount, 0)::NUMERIC;

    v_recon :=
      COALESCE(r.subtotal, 0)::NUMERIC
      + COALESCE(r.travel_fee, 0)::NUMERIC
      + COALESCE(r.tax_amount, 0)::NUMERIC
      + v_pf
      + COALESCE(r.tip_amount, 0)::NUMERIC
      - v_new_disc
      - COALESCE(r.promotion_discount_amount, 0)::NUMERIC
      - COALESCE(r.membership_discount_amount, 0)::NUMERIC
      - COALESCE(r.loyalty_discount_amount, 0)::NUMERIC
      - COALESCE(r.cancellation_fee, 0)::NUMERIC;

    v_old_total := r.total_amount::NUMERIC;
    v_drift_cents := ROUND(ABS(v_recon - v_old_total) * 100)::INTEGER;

    IF v_drift_cents > 1 THEN
      INSERT INTO public.pricing_normalization_audit (
        booking_id, change_type, details,
        old_discount_amount, new_discount_amount, old_total_amount, new_total_amount, drift_cents
      ) VALUES (
        r.id,
        'discount_membership_skipped_drift',
        jsonb_build_object(
          'reason', 'reconstructed_total_does_not_match_stored_total_after_discount_fix'
        ),
        v_old_disc, v_new_disc, v_old_total, v_recon, v_drift_cents
      );
      CONTINUE;
    END IF;

    INSERT INTO public.pricing_normalization_audit (
      booking_id, change_type, details,
      old_discount_amount, new_discount_amount, old_total_amount, new_total_amount, drift_cents
    ) VALUES (
      r.id,
      'discount_strip_walk_in_membership_fold',
      jsonb_build_object(
        'membership_discount_amount', r.membership_discount_amount
      ),
      v_old_disc, v_new_disc, v_old_total, v_recon, v_drift_cents
    );

    UPDATE public.bookings
    SET
      discount_amount = v_new_disc,
      total_amount = v_recon,
      updated_at = NOW()
    WHERE id = r.id;
  END LOOP;

  -- Pass C: legacy public bookings where `subtotal` was stored lines-AFTER-package
  -- AND `discount_amount` ALSO carried the package amount (double-subtract).
  -- Detection heuristic: stored subtotal + discount ≈ raw_lines (services+addons+products).
  -- Fix: rewrite subtotal to raw_lines so the canonical invariant holds:
  --   subtotal + travel + tax + platform_fee + tip - all_discounts ≈ total_amount
  FOR r IN
    SELECT b.*
    FROM public.bookings b
    WHERE COALESCE(b.booking_source, 'online') <> 'walk_in'
      AND COALESCE(b.discount_amount, 0) > 0.005
      AND b.package_id IS NOT NULL
  LOOP
    SELECT
      COALESCE(
        (SELECT SUM(bs.price::NUMERIC) FROM public.booking_services bs WHERE bs.booking_id = r.id),
        0
      )
      + COALESCE(
        (SELECT SUM(ba.price::NUMERIC * COALESCE(ba.quantity, 1)::NUMERIC) FROM public.booking_addons ba WHERE ba.booking_id = r.id),
        0
      )
      + COALESCE(
        (SELECT SUM(bp.total_price::NUMERIC) FROM public.booking_products bp WHERE bp.booking_id = r.id),
        0
      )
    INTO v_lines;

    v_old_sub := COALESCE(r.subtotal, 0)::NUMERIC;
    v_old_disc := COALESCE(r.discount_amount, 0)::NUMERIC;

    IF v_lines IS NULL OR v_lines <= 0 THEN
      CONTINUE;
    END IF;

    -- Already correct (subtotal already pre-discount): skip.
    IF ABS(v_old_sub - v_lines) < 0.02 THEN
      CONTINUE;
    END IF;

    -- Heuristic: stored subtotal + discount ≈ raw lines → bug present, fix by rewriting subtotal.
    IF ABS((v_old_sub + v_old_disc) - v_lines) >= 0.02 THEN
      CONTINUE;
    END IF;

    v_new_sub := v_lines;

    v_pf := COALESCE(NULLIF(r.platform_fee_amount, 0), r.service_fee_amount, 0)::NUMERIC;

    v_recon :=
      v_new_sub
      + COALESCE(r.travel_fee, 0)::NUMERIC
      + COALESCE(r.tax_amount, 0)::NUMERIC
      + v_pf
      + COALESCE(r.tip_amount, 0)::NUMERIC
      - v_old_disc
      - COALESCE(r.promotion_discount_amount, 0)::NUMERIC
      - COALESCE(r.membership_discount_amount, 0)::NUMERIC
      - COALESCE(r.loyalty_discount_amount, 0)::NUMERIC
      - COALESCE(r.cancellation_fee, 0)::NUMERIC;

    v_old_total := r.total_amount::NUMERIC;
    v_drift_cents := ROUND(ABS(v_recon - v_old_total) * 100)::INTEGER;

    -- Original total is correct; subtotal was the bug. Reconstructed total should match within 1c.
    IF v_drift_cents > 1 THEN
      INSERT INTO public.pricing_normalization_audit (
        booking_id, change_type, details,
        old_subtotal, new_subtotal, old_total_amount, new_total_amount, drift_cents
      ) VALUES (
        r.id,
        'subtotal_pre_package_skipped_drift',
        jsonb_build_object(
          'reason', 'reconstructed_total_does_not_match_stored_total_after_subtotal_fix',
          'lines_sum', v_lines,
          'package_id', r.package_id
        ),
        v_old_sub, v_new_sub, v_old_total, v_recon, v_drift_cents
      );
      CONTINUE;
    END IF;

    INSERT INTO public.pricing_normalization_audit (
      booking_id, change_type, details,
      old_subtotal, new_subtotal, old_total_amount, new_total_amount, drift_cents
    ) VALUES (
      r.id,
      'subtotal_rewrite_pre_package',
      jsonb_build_object(
        'lines_sum', v_lines,
        'package_id', r.package_id,
        'discount_amount_kept', v_old_disc
      ),
      v_old_sub, v_new_sub, v_old_total, v_recon, v_drift_cents
    );

    UPDATE public.bookings
    SET
      subtotal = v_new_sub,
      total_amount = v_recon,
      updated_at = NOW()
    WHERE id = r.id;
  END LOOP;
END $$;
