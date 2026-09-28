-- Allow multiple commission lines per finance tx (one per booking_service).
ALTER TABLE public.staff_earnings_lines
  DROP CONSTRAINT IF EXISTS staff_earnings_lines_source_finance_transaction_id_staff_id_kind_key;

DROP INDEX IF EXISTS ux_staff_earnings_lines_source_staff_kind_svc;
CREATE UNIQUE INDEX ux_staff_earnings_lines_source_staff_kind_svc
  ON public.staff_earnings_lines (
    source_finance_transaction_id,
    staff_id,
    kind,
    COALESCE(booking_service_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Rewrite staff earnings lines trigger: per booking_service, tip distribution setting,
-- 0% overrides, commission_enabled gate, product_commission kind.

ALTER TABLE public.staff_earnings_lines DROP CONSTRAINT IF EXISTS staff_earnings_lines_kind_check;
ALTER TABLE public.staff_earnings_lines
  ADD CONSTRAINT staff_earnings_lines_kind_check
  CHECK (kind IN (
    'commission', 'product_commission', 'tip', 'cancellation_fee_share',
    'reversal', 'adjustment'
  ));

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
        ON CONFLICT (source_finance_transaction_id, staff_id, kind) DO NOTHING;
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

      v_staff_share := NEW.amount * v_bs.price / v_total_price;
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
        ON CONFLICT (source_finance_transaction_id, staff_id, kind) DO NOTHING;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.transaction_type = 'refund'
     AND NEW.refund_component IN ('provider_earnings', 'tip')
     AND NEW.source_refund_id IS NOT NULL THEN
    FOR v_bs IN
      SELECT sel.staff_id, sel.kind, sel.rate, sel.rate_source,
             SUM(sel.amount) AS orig_amount
      FROM public.staff_earnings_lines sel
      JOIN public.finance_transactions orig ON orig.id = sel.source_finance_transaction_id
      WHERE orig.booking_id = NEW.booking_id
        AND (
          (NEW.refund_component = 'provider_earnings' AND sel.kind IN ('commission', 'product_commission'))
          OR (NEW.refund_component = 'tip' AND sel.kind = 'tip')
        )
        AND sel.amount > 0
      GROUP BY sel.staff_id, sel.kind, sel.rate, sel.rate_source
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
          NEW.id, v_bs.kind, 0, v_bs.rate, v_line_amount, v_bs.rate_source, v_currency
        )
        ON CONFLICT (source_finance_transaction_id, staff_id, kind) DO NOTHING;
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
  '939: per booking_service commission lines; tips from booking_tip_allocations when distribute_to_staff; 0%% override honored.';
