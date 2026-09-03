-- ============================================================================
-- Backfill staff_earnings_lines for historical finance_transactions
-- (Part F4 — run once after migration 872 is applied; safe to re-run).
--
-- The 866 trigger only fires on INSERT, so provider_earnings / tip rows that
-- existed before 866 have no staff_earnings_lines. This script recomputes
-- them with the same allocation rules as the trigger and marks the rows
-- `backfilled = true`, `rate_source = 'backfill'`.
--
-- Idempotency: UNIQUE (source_finance_transaction_id, staff_id, kind) +
-- ON CONFLICT DO NOTHING. Re-running produces zero new rows.
--
-- Usage (psql / Supabase SQL editor):
--   \set from_date '2024-01-01'
--   \i scripts/backfill-staff-earnings-lines.sql
-- or edit v_from below. Wrap in a transaction if you want a dry run:
--   BEGIN; \i scripts/backfill-staff-earnings-lines.sql; ROLLBACK;
-- ============================================================================

DO $$
DECLARE
  v_from TIMESTAMPTZ := COALESCE(NULLIF(current_setting('backfill.from_date', true), '')::timestamptz, '2020-01-01'::timestamptz);
  v_ft RECORD;
  v_staff_rec RECORD;
  v_total_price NUMERIC(12, 2);
  v_rate NUMERIC(8, 4);
  v_override NUMERIC(8, 4);
  v_comm_enabled BOOLEAN;
  v_line_amount NUMERIC(12, 2);
  v_staff_share NUMERIC(12, 2);
  v_inserted INT := 0;
  v_scanned INT := 0;
BEGIN
  RAISE NOTICE 'backfill-staff-earnings-lines: from % ', v_from;

  -- ----------------------------------------------------------------------
  -- 1. Tips → kind = 'tip' (proportional to each staff member's line total)
  -- ----------------------------------------------------------------------
  FOR v_ft IN
    SELECT ft.id, ft.booking_id, ft.provider_id, ft.tenant_id, ft.amount, ft.created_at
    FROM public.finance_transactions ft
    WHERE ft.transaction_type = 'tip'
      AND ft.amount > 0
      AND ft.booking_id IS NOT NULL
      AND ft.created_at >= v_from
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_earnings_lines sel
        WHERE sel.source_finance_transaction_id = ft.id AND sel.kind = 'tip'
      )
  LOOP
    v_scanned := v_scanned + 1;
    SELECT COALESCE(SUM(bs.price), 0) INTO v_total_price
    FROM public.booking_services bs
    WHERE bs.booking_id = v_ft.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0;
    IF v_total_price <= 0 THEN CONTINUE; END IF;

    FOR v_staff_rec IN
      SELECT bs.staff_id, SUM(bs.price) AS staff_total
      FROM public.booking_services bs
      WHERE bs.booking_id = v_ft.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0
      GROUP BY bs.staff_id
    LOOP
      v_staff_share := v_ft.amount * v_staff_rec.staff_total / v_total_price;
      IF v_staff_share > 0 THEN
        INSERT INTO public.staff_earnings_lines (
          booking_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source, backfilled, created_at
        ) VALUES (
          v_ft.booking_id, v_staff_rec.staff_id, v_ft.provider_id, v_ft.tenant_id,
          v_ft.id, 'tip', v_staff_rec.staff_total, 0, ROUND(v_staff_share, 2), 'backfill', true, v_ft.created_at
        )
        ON CONFLICT (source_finance_transaction_id, staff_id, kind) DO NOTHING;
        IF FOUND THEN v_inserted := v_inserted + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- ----------------------------------------------------------------------
  -- 2. provider_earnings → kind = 'commission'
  --    (staff rate, offering override; skips commission-disabled staff/offerings)
  -- ----------------------------------------------------------------------
  FOR v_ft IN
    SELECT ft.id, ft.booking_id, ft.provider_id, ft.tenant_id, ft.amount, ft.created_at
    FROM public.finance_transactions ft
    WHERE ft.transaction_type = 'provider_earnings'
      AND ft.amount <> 0
      AND ft.booking_id IS NOT NULL
      AND ft.created_at >= v_from
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_earnings_lines sel
        WHERE sel.source_finance_transaction_id = ft.id AND sel.kind = 'commission'
      )
  LOOP
    v_scanned := v_scanned + 1;
    SELECT COALESCE(SUM(bs.price), 0) INTO v_total_price
    FROM public.booking_services bs
    WHERE bs.booking_id = v_ft.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0;
    IF v_total_price <= 0 THEN CONTINUE; END IF;

    FOR v_staff_rec IN
      SELECT
        bs.staff_id,
        SUM(bs.price) AS staff_price,
        MAX(bs.offering_id::text)::uuid AS offering_id,
        BOOL_AND(ps.commission_enabled IS NOT FALSE) AS commission_enabled,
        MAX(COALESCE(ps.service_commission_rate, ps.commission_rate, 0)) AS staff_rate
      FROM public.booking_services bs
      JOIN public.provider_staff ps ON ps.id = bs.staff_id
      WHERE bs.booking_id = v_ft.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0
      GROUP BY bs.staff_id
    LOOP
      IF v_staff_rec.commission_enabled IS FALSE AND v_staff_rec.staff_rate = 0 THEN CONTINUE; END IF;

      v_rate := v_staff_rec.staff_rate;
      v_override := NULL;
      IF v_staff_rec.offering_id IS NOT NULL THEN
        SELECT o.team_member_commission_enabled, o.commission_rate_override
          INTO v_comm_enabled, v_override
        FROM public.offerings o WHERE o.id = v_staff_rec.offering_id;
        IF v_comm_enabled IS FALSE THEN CONTINUE; END IF;
        IF v_override IS NOT NULL AND v_override > 0 THEN v_rate := v_override; END IF;
      END IF;

      v_staff_share := v_ft.amount * v_staff_rec.staff_price / v_total_price;
      v_line_amount := ROUND(v_staff_share * v_rate / 100.0, 2);
      IF v_line_amount <> 0 THEN
        INSERT INTO public.staff_earnings_lines (
          booking_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source, backfilled, created_at
        ) VALUES (
          v_ft.booking_id, v_staff_rec.staff_id, v_ft.provider_id, v_ft.tenant_id,
          v_ft.id, 'commission', v_staff_share, v_rate, v_line_amount, 'backfill', true, v_ft.created_at
        )
        ON CONFLICT (source_finance_transaction_id, staff_id, kind) DO NOTHING;
        IF FOUND THEN v_inserted := v_inserted + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- ----------------------------------------------------------------------
  -- 3. Refund clawbacks → negative lines of the original kind
  -- ----------------------------------------------------------------------
  FOR v_ft IN
    SELECT ft.id, ft.booking_id, ft.provider_id, ft.tenant_id, ft.amount, ft.refund_component, ft.created_at
    FROM public.finance_transactions ft
    WHERE ft.transaction_type = 'refund'
      AND ft.refund_component IN ('provider_earnings', 'tip')
      AND ft.source_refund_id IS NOT NULL
      AND ft.booking_id IS NOT NULL
      AND ft.created_at >= v_from
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_earnings_lines sel
        WHERE sel.source_finance_transaction_id = ft.id
      )
  LOOP
    v_scanned := v_scanned + 1;
    FOR v_staff_rec IN
      SELECT sel.staff_id, sel.kind, sel.rate,
             SUM(sel.amount) AS orig_amount
      FROM public.staff_earnings_lines sel
      JOIN public.finance_transactions orig ON orig.id = sel.source_finance_transaction_id
      WHERE orig.booking_id = v_ft.booking_id
        AND orig.created_at <= v_ft.created_at
        AND (
          (v_ft.refund_component = 'provider_earnings' AND sel.kind = 'commission')
          OR (v_ft.refund_component = 'tip' AND sel.kind = 'tip')
        )
        AND sel.amount > 0
      GROUP BY sel.staff_id, sel.kind, sel.rate
    LOOP
      v_line_amount := ROUND(-ABS(v_staff_rec.orig_amount) * ABS(v_ft.amount) /
        NULLIF((
          SELECT ABS(SUM(ft2.amount))
          FROM public.finance_transactions ft2
          WHERE ft2.booking_id = v_ft.booking_id
            AND ft2.transaction_type = CASE WHEN v_ft.refund_component = 'tip' THEN 'tip' ELSE 'provider_earnings' END
        ), 0), 2);
      IF v_line_amount <> 0 THEN
        INSERT INTO public.staff_earnings_lines (
          booking_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source, backfilled, reason, created_at
        ) VALUES (
          v_ft.booking_id, v_staff_rec.staff_id, v_ft.provider_id, v_ft.tenant_id,
          v_ft.id, v_staff_rec.kind, 0, v_staff_rec.rate, v_line_amount, 'backfill', true, 'Refund clawback', v_ft.created_at
        )
        ON CONFLICT (source_finance_transaction_id, staff_id, kind) DO NOTHING;
        IF FOUND THEN v_inserted := v_inserted + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'backfill-staff-earnings-lines: scanned % finance_transactions, inserted % lines', v_scanned, v_inserted;
END $$;

-- Verification
SELECT
  COUNT(*) FILTER (WHERE backfilled) AS backfilled_lines,
  COUNT(*) FILTER (WHERE NOT backfilled) AS live_lines,
  COALESCE(SUM(amount) FILTER (WHERE backfilled), 0) AS backfilled_total
FROM public.staff_earnings_lines;
