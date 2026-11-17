-- The unique index is (source, staff, kind, COALESCE(booking_service_id, zero uuid)).
-- ON CONFLICT (source, staff, kind) does not match that index, so every insert
-- raised and the handler dropped the line. Commission, tips, and refund clawbacks
-- were never saved. The conflict target below matches the index.
-- Service commission is on the service pool only. Appointment retail is its own
-- product_commission line, using the same paid share as paidAppointmentProductAmount.

ALTER TABLE public.staff_earnings_lines
  DROP CONSTRAINT IF EXISTS staff_earnings_lines_source_finance_transaction_id_staff_id_kind_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_earnings_lines_source_staff_kind_svc
  ON public.staff_earnings_lines (
    source_finance_transaction_id,
    staff_id,
    kind,
    COALESCE(booking_service_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE OR REPLACE FUNCTION public.create_staff_earnings_lines_on_finance_tx()
RETURNS TRIGGER AS $$
DECLARE
  v_total_price NUMERIC(12, 2);
  v_bs RECORD;
  v_rate NUMERIC(8, 4);
  v_override NUMERIC(8, 4);
  v_comm_enabled BOOLEAN;
  v_line_amount NUMERIC(12, 2);
  v_staff_share NUMERIC(12, 2);
  v_service_pool NUMERIC(12, 2);
  v_subtotal NUMERIC(12, 2);
  v_discounts NUMERIC(12, 2);
  v_net NUMERIC(12, 2);
  v_product_list NUMERIC(12, 2);
  v_retail NUMERIC(12, 2);
  v_distribute_tips BOOLEAN;
  v_currency TEXT;
BEGIN
  IF NEW.booking_id IS NULL OR NEW.amount IS NULL OR NEW.amount = 0 THEN
    RETURN NEW;
  END IF;

  v_currency := COALESCE(NEW.currency, 'ZAR');

  IF NEW.transaction_type = 'tip' AND NEW.amount > 0 THEN
    SELECT COALESCE(pt.distribute_to_staff, false) INTO v_distribute_tips
    FROM public.provider_tip_settings pt
    WHERE pt.provider_id = NEW.provider_id;

    IF NOT COALESCE(v_distribute_tips, false) THEN
      RETURN NEW;
    END IF;

    FOR v_bs IN
      SELECT bta.staff_id, bta.amount AS tip_amount
      FROM public.booking_tip_allocations bta
      WHERE bta.booking_id = NEW.booking_id AND bta.amount > 0
    LOOP
      IF v_bs.tip_amount > 0 THEN
        INSERT INTO public.staff_earnings_lines (
          booking_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source, currency
        ) VALUES (
          NEW.booking_id, v_bs.staff_id,
          NEW.provider_id, NEW.tenant_id, NEW.id, 'tip',
          v_bs.tip_amount, 0, ROUND(v_bs.tip_amount, 2), 'staff', v_currency
        )
        ON CONFLICT (
          source_finance_transaction_id,
          staff_id,
          kind,
          (COALESCE(booking_service_id, '00000000-0000-0000-0000-000000000000'::uuid))
        ) DO NOTHING;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.transaction_type = 'provider_earnings' AND NEW.amount <> 0 THEN
    SELECT COALESCE(SUM(bs.price), 0) INTO v_total_price
    FROM public.booking_services bs
    WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0;

    IF v_total_price <= 0 THEN
      RETURN NEW;
    END IF;

    v_retail := 0;
    v_subtotal := 0;
    v_discounts := 0;
    v_product_list := 0;
    v_net := 0;
    SELECT
      COALESCE(b.subtotal, 0),
      COALESCE(b.discount_amount, 0)
        + COALESCE(b.promotion_discount_amount, 0)
        + COALESCE(b.membership_discount_amount, 0)
        + COALESCE(b.loyalty_discount_amount, 0),
      COALESCE((
        SELECT SUM(bp.total_price)
        FROM public.booking_products bp
        WHERE bp.booking_id = b.id AND bp.total_price > 0
      ), 0)
    INTO v_subtotal, v_discounts, v_product_list
    FROM public.bookings b
    WHERE b.id = NEW.booking_id;

    IF NEW.amount > 0 AND v_product_list > 0 THEN
      IF v_subtotal > 0 THEN
        v_net := GREATEST(0, v_subtotal - GREATEST(v_discounts, 0));
        IF v_net > 0 THEN
          v_retail := ROUND(LEAST(NEW.amount, v_net) * v_product_list / v_subtotal, 2);
        END IF;
      ELSE
        v_retail := v_product_list;
      END IF;
    END IF;

    v_service_pool := NEW.amount - COALESCE(v_retail, 0);
    IF NEW.amount > 0 AND v_service_pool < 0 THEN
      v_service_pool := 0;
    END IF;

    FOR v_bs IN
      SELECT
        bs.id AS booking_service_id,
        bs.staff_id,
        bs.price,
        bs.offering_id,
        ps.commission_enabled,
        COALESCE(ps.service_commission_rate, ps.commission_rate, ps.commission_percentage, 0) AS staff_rate
      FROM public.booking_services bs
      JOIN public.provider_staff ps ON ps.id = bs.staff_id
      WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0
    LOOP
      IF v_bs.commission_enabled IS FALSE AND v_bs.staff_rate = 0 THEN
        CONTINUE;
      END IF;

      v_rate := v_bs.staff_rate;
      v_override := NULL;
      IF v_bs.offering_id IS NOT NULL THEN
        SELECT o.team_member_commission_enabled, o.commission_rate_override
          INTO v_comm_enabled, v_override
        FROM public.offerings o
        WHERE o.id = v_bs.offering_id;
        IF v_comm_enabled IS FALSE THEN
          CONTINUE;
        END IF;
        IF v_override IS NOT NULL THEN
          v_rate := v_override;
        END IF;
      END IF;

      v_staff_share := v_service_pool * v_bs.price / v_total_price;
      v_line_amount := ROUND(v_staff_share * v_rate / 100.0, 2);
      IF v_line_amount <> 0 THEN
        INSERT INTO public.staff_earnings_lines (
          booking_id, booking_service_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source, currency
        ) VALUES (
          NEW.booking_id, v_bs.booking_service_id, v_bs.staff_id,
          NEW.provider_id, NEW.tenant_id, NEW.id, 'commission',
          v_staff_share, v_rate, v_line_amount,
          CASE WHEN v_override IS NOT NULL THEN 'offering_override' ELSE 'staff' END,
          v_currency
        )
        ON CONFLICT (
          source_finance_transaction_id,
          staff_id,
          kind,
          (COALESCE(booking_service_id, '00000000-0000-0000-0000-000000000000'::uuid))
        ) DO NOTHING;
      END IF;
    END LOOP;

    IF NEW.amount > 0 THEN
      FOR v_bs IN
        SELECT
          attributed.staff_id,
          SUM(attributed.base_amount) AS base_amount,
          SUM(attributed.line_amount) AS line_amount
        FROM (
          SELECT
            stylist.staff_id,
            ROUND(product_paid.base_amount * stylist.share, 2) AS base_amount,
            CASE
              WHEN COALESCE(p.team_member_commission_enabled, true) IS FALSE THEN 0
              WHEN ps.commission_enabled IS FALSE THEN 0
              WHEN product_paid.base_amount <= 0 THEN 0
              ELSE ROUND(
                product_paid.base_amount
                * stylist.share
                * COALESCE(p.commission_rate_override, ps.product_commission_rate, ps.commission_rate, ps.commission_percentage, 0)
                / 100.0
              , 2)
            END AS line_amount
          FROM public.booking_products bp
          LEFT JOIN public.products p ON p.id = bp.product_id
          JOIN LATERAL (
            SELECT bs.staff_id, bs.price / SUM(bs.price) OVER () AS share
            FROM public.booking_services bs
            WHERE bp.staff_id IS NULL
              AND bs.booking_id = NEW.booking_id
              AND bs.staff_id IS NOT NULL
              AND bs.price > 0
            UNION ALL
            SELECT bp.staff_id, 1::numeric
            WHERE bp.staff_id IS NOT NULL
          ) stylist ON stylist.staff_id IS NOT NULL
          LEFT JOIN public.provider_staff ps ON ps.id = stylist.staff_id
          CROSS JOIN LATERAL (
            SELECT CASE
              WHEN v_subtotal > 0 AND v_net <= 0 THEN 0
              WHEN v_subtotal > 0 AND v_net > 0 THEN ROUND(bp.total_price * LEAST(NEW.amount, v_net) / v_subtotal, 2)
              ELSE ROUND(bp.total_price, 2)
            END AS base_amount
          ) product_paid
          WHERE bp.booking_id = NEW.booking_id AND bp.total_price > 0
        ) attributed
        WHERE attributed.staff_id IS NOT NULL
        GROUP BY attributed.staff_id
      LOOP
        IF v_bs.line_amount IS NULL OR v_bs.line_amount = 0 THEN
          CONTINUE;
        END IF;
        INSERT INTO public.staff_earnings_lines (
          booking_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source, currency
        ) VALUES (
          NEW.booking_id, v_bs.staff_id,
          NEW.provider_id, NEW.tenant_id, NEW.id, 'product_commission',
          v_bs.base_amount, 0, v_bs.line_amount, 'staff', v_currency
        )
        ON CONFLICT (
          source_finance_transaction_id,
          staff_id,
          kind,
          (COALESCE(booking_service_id, '00000000-0000-0000-0000-000000000000'::uuid))
        ) DO NOTHING;
      END LOOP;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.transaction_type = 'refund'
     AND NEW.refund_component IN ('provider_earnings', 'tip')
     AND NEW.source_refund_id IS NOT NULL THEN
    FOR v_bs IN
      SELECT sel.staff_id, sel.kind, SUM(sel.amount) AS orig_amount
      FROM public.staff_earnings_lines sel
      JOIN public.finance_transactions orig ON orig.id = sel.source_finance_transaction_id
      WHERE orig.booking_id = NEW.booking_id
        AND (
          (NEW.refund_component = 'provider_earnings' AND sel.kind IN ('commission', 'product_commission'))
          OR (NEW.refund_component = 'tip' AND sel.kind = 'tip')
        )
        AND sel.amount > 0
      GROUP BY sel.staff_id, sel.kind
    LOOP
      v_line_amount := ROUND(-ABS(v_bs.orig_amount) * ABS(NEW.amount) /
        NULLIF((
          SELECT ABS(SUM(ft.amount))
          FROM public.finance_transactions ft
          WHERE ft.booking_id = NEW.booking_id
            AND ft.transaction_type = CASE
              WHEN NEW.refund_component = 'tip' THEN 'tip'
              ELSE 'provider_earnings'
            END
        ), 0), 2);
      IF v_line_amount <> 0 THEN
        INSERT INTO public.staff_earnings_lines (
          booking_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source, currency
        ) VALUES (
          NEW.booking_id, v_bs.staff_id, NEW.provider_id, NEW.tenant_id,
          NEW.id, v_bs.kind, 0, 0, v_line_amount, 'staff', v_currency
        )
        ON CONFLICT (
          source_finance_transaction_id,
          staff_id,
          kind,
          (COALESCE(booking_service_id, '00000000-0000-0000-0000-000000000000'::uuid))
        ) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'create_staff_earnings_lines_on_finance_tx: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.create_staff_earnings_lines_on_finance_tx IS
  '10174: conflict target matches the earnings unique index. Service commission excludes appointment retail. Product commission is its own line. Refunds claw back one summed line per person.';
