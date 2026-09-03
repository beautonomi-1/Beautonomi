-- ============================================================================
-- Migration 866: Staff permissions scope, scheduling guards, earnings lines
-- Parts F2–F4: calendar_scope, receptionist preset, staff_earnings_lines
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. staff_earnings_lines — persistent commission/tip allocations at ledger time
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_earnings_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  booking_service_id UUID REFERENCES public.booking_services(id) ON DELETE SET NULL,
  staff_id UUID NOT NULL REFERENCES public.provider_staff(id) ON DELETE RESTRICT,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  tenant_id UUID,
  source_finance_transaction_id UUID NOT NULL REFERENCES public.finance_transactions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('commission', 'tip', 'cancellation_fee_share')),
  base_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  rate NUMERIC(8, 4) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  rate_source TEXT NOT NULL DEFAULT 'staff'
    CHECK (rate_source IN ('staff', 'offering_override', 'tier', 'backfill')),
  backfilled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_finance_transaction_id, staff_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_staff_earnings_lines_staff_created
  ON public.staff_earnings_lines(staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_earnings_lines_provider_created
  ON public.staff_earnings_lines(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_earnings_lines_booking
  ON public.staff_earnings_lines(booking_id);

COMMENT ON TABLE public.staff_earnings_lines IS
  'Staff commission/tip lines posted at finance_transactions ledger time; pay runs sum by created_at.';

ALTER TABLE public.staff_earnings_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_earnings_lines_provider_read ON public.staff_earnings_lines;
CREATE POLICY staff_earnings_lines_provider_read ON public.staff_earnings_lines
  FOR SELECT USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Post staff lines when provider_earnings or tip finance_transactions insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_staff_earnings_lines_on_finance_tx()
RETURNS TRIGGER AS $$
DECLARE
  v_total_price NUMERIC(12, 2);
  v_staff_rec RECORD;
  v_rate NUMERIC(8, 4);
  v_enabled BOOLEAN;
  v_override NUMERIC(8, 4);
  v_comm_enabled BOOLEAN;
  v_line_amount NUMERIC(12, 2);
  v_staff_share NUMERIC(12, 2);
BEGIN
  IF NEW.booking_id IS NULL OR NEW.amount IS NULL OR NEW.amount = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.transaction_type = 'tip' AND NEW.amount > 0 THEN
    SELECT COALESCE(SUM(bs.price), 0) INTO v_total_price
    FROM public.booking_services bs
    WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0;

    IF v_total_price <= 0 THEN
      RETURN NEW;
    END IF;

    FOR v_staff_rec IN
      SELECT bs.staff_id, SUM(bs.price) AS staff_total
      FROM public.booking_services bs
      WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0
      GROUP BY bs.staff_id
    LOOP
      v_staff_share := NEW.amount * v_staff_rec.staff_total / v_total_price;
      IF v_staff_share > 0 THEN
        INSERT INTO public.staff_earnings_lines (
          booking_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source
        ) VALUES (
          NEW.booking_id, v_staff_rec.staff_id,
          NEW.provider_id, NEW.tenant_id, NEW.id, 'tip',
          v_staff_rec.staff_total, 0, ROUND(v_staff_share, 2), 'staff'
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

    FOR v_staff_rec IN
      SELECT
        bs.staff_id,
        SUM(bs.price) AS staff_price,
        MAX(bs.offering_id::text)::uuid AS offering_id,
        BOOL_AND(ps.commission_enabled IS NOT FALSE) AS commission_enabled,
        MAX(COALESCE(ps.service_commission_rate, ps.commission_rate, 0)) AS staff_rate
      FROM public.booking_services bs
      JOIN public.provider_staff ps ON ps.id = bs.staff_id
      WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0
      GROUP BY bs.staff_id
    LOOP
      IF v_staff_rec.commission_enabled IS FALSE AND v_staff_rec.staff_rate = 0 THEN
        CONTINUE;
      END IF;

      v_rate := v_staff_rec.staff_rate;
      v_override := NULL;
      IF v_staff_rec.offering_id IS NOT NULL THEN
        SELECT o.team_member_commission_enabled, o.commission_rate_override
          INTO v_comm_enabled, v_override
        FROM public.offerings o
        WHERE o.id = v_staff_rec.offering_id;
        IF v_comm_enabled IS FALSE THEN
          CONTINUE;
        END IF;
        IF v_override IS NOT NULL AND v_override > 0 THEN
          v_rate := v_override;
        END IF;
      END IF;

      v_staff_share := NEW.amount * v_staff_rec.staff_price / v_total_price;
      v_line_amount := ROUND(v_staff_share * v_rate / 100.0, 2);
      IF v_line_amount <> 0 THEN
        INSERT INTO public.staff_earnings_lines (
          booking_id, staff_id, provider_id, tenant_id,
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source
        ) VALUES (
          NEW.booking_id, v_staff_rec.staff_id,
          NEW.provider_id, NEW.tenant_id, NEW.id, 'commission',
          v_staff_share, v_rate, v_line_amount,
          CASE WHEN v_override IS NOT NULL AND v_override > 0 THEN 'offering_override' ELSE 'staff' END
        )
        ON CONFLICT (source_finance_transaction_id, staff_id, kind) DO NOTHING;
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Refund clawback: negative lines proportional to original positive lines
  IF NEW.transaction_type = 'refund'
     AND NEW.refund_component IN ('provider_earnings', 'tip')
     AND NEW.source_refund_id IS NOT NULL THEN
    FOR v_staff_rec IN
      SELECT sel.staff_id, sel.kind, sel.rate, sel.rate_source,
             SUM(sel.amount) AS orig_amount,
             SUM(sel.base_amount) AS orig_base
      FROM public.staff_earnings_lines sel
      JOIN public.finance_transactions orig ON orig.id = sel.source_finance_transaction_id
      WHERE orig.booking_id = NEW.booking_id
        AND (
          (NEW.refund_component = 'provider_earnings' AND sel.kind = 'commission')
          OR (NEW.refund_component = 'tip' AND sel.kind = 'tip')
        )
        AND sel.amount > 0
      GROUP BY sel.staff_id, sel.kind, sel.rate, sel.rate_source
    LOOP
      v_line_amount := ROUND(-ABS(v_staff_rec.orig_amount) * ABS(NEW.amount) /
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
          source_finance_transaction_id, kind, base_amount, rate, amount, rate_source
        ) VALUES (
          NEW.booking_id, v_staff_rec.staff_id, NEW.provider_id, NEW.tenant_id,
          NEW.id, v_staff_rec.kind, 0, v_staff_rec.rate, v_line_amount, v_staff_rec.rate_source
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

DROP TRIGGER IF EXISTS create_staff_earnings_lines_on_finance_tx ON public.finance_transactions;
CREATE TRIGGER create_staff_earnings_lines_on_finance_tx
  AFTER INSERT ON public.finance_transactions
  FOR EACH ROW
  WHEN (
    NEW.transaction_type IN ('provider_earnings', 'tip')
    OR (NEW.transaction_type = 'refund' AND NEW.refund_component IN ('provider_earnings', 'tip'))
  )
  EXECUTE FUNCTION public.create_staff_earnings_lines_on_finance_tx();

-- Realtime for staff "My earnings"
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_earnings_lines;

-- ---------------------------------------------------------------------------
-- 3. Tightened employee defaults + calendar_scope; receptionist preset
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_default_permissions_for_role(p_role TEXT)
RETURNS JSONB AS $$
BEGIN
    CASE p_role
        WHEN 'owner' THEN
            RETURN '{
                "view_calendar": true,
                "calendar_scope": "all",
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": true,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "view_reports": true,
                "manage_finance": true,
                "manage_marketing": true,
                "view_services": true,
                "edit_services": true,
                "view_products": true,
                "edit_products": true,
                "view_team": true,
                "manage_team": true,
                "view_settings": true,
                "edit_settings": true,
                "view_clients": true,
                "edit_clients": true,
                "view_reviews": true,
                "edit_reviews": true,
                "view_messages": true,
                "send_messages": true,
                "create_explore_posts": true,
                "rate_clients": true,
                "view_client_ratings": true,
                "view_own_earnings": true
            }'::jsonb;
        WHEN 'manager' THEN
            RETURN '{
                "view_calendar": true,
                "calendar_scope": "all",
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": false,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "view_reports": true,
                "manage_finance": true,
                "manage_marketing": true,
                "view_services": true,
                "edit_services": true,
                "view_products": true,
                "edit_products": true,
                "view_team": true,
                "manage_team": true,
                "view_settings": true,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": true,
                "view_reviews": true,
                "edit_reviews": false,
                "view_messages": true,
                "send_messages": true,
                "create_explore_posts": true,
                "rate_clients": true,
                "view_client_ratings": true,
                "view_own_earnings": true
            }'::jsonb;
        WHEN 'employee' THEN
            RETURN '{
                "view_calendar": true,
                "calendar_scope": "own",
                "create_appointments": false,
                "edit_appointments": true,
                "cancel_appointments": false,
                "delete_appointments": false,
                "view_sales": false,
                "create_sales": false,
                "process_payments": false,
                "view_reports": false,
                "manage_finance": false,
                "manage_marketing": false,
                "view_services": true,
                "edit_services": false,
                "view_products": true,
                "edit_products": false,
                "view_team": false,
                "manage_team": false,
                "view_settings": false,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": true,
                "view_reviews": false,
                "edit_reviews": false,
                "view_messages": true,
                "send_messages": true,
                "create_explore_posts": false,
                "rate_clients": false,
                "view_client_ratings": false,
                "view_own_earnings": true
            }'::jsonb;
        ELSE
            RETURN '{}'::jsonb;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_default_permissions_for_role IS
  'Default permission packs including calendar_scope (own|all) and view_own_earnings.';

-- Receptionist preset (provider_roles template — owners can assign per staff)
CREATE OR REPLACE FUNCTION public.get_receptionist_role_permissions()
RETURNS JSONB AS $$
  SELECT '{
    "view_calendar": true,
    "calendar_scope": "all",
    "create_appointments": true,
    "edit_appointments": true,
    "cancel_appointments": true,
    "delete_appointments": false,
    "view_sales": false,
    "create_sales": true,
    "process_payments": true,
    "view_reports": false,
    "manage_finance": false,
    "manage_marketing": false,
    "view_services": true,
    "edit_services": false,
    "view_products": true,
    "edit_products": false,
    "view_team": true,
    "manage_team": false,
    "view_settings": false,
    "edit_settings": false,
    "view_clients": true,
    "edit_clients": true,
    "view_reviews": true,
    "edit_reviews": false,
    "view_messages": true,
    "send_messages": true,
    "create_explore_posts": false,
    "rate_clients": false,
    "view_client_ratings": false,
    "view_own_earnings": false
  }'::jsonb;
$$ LANGUAGE sql IMMUTABLE;

-- Seed receptionist role for providers that don't have one yet
INSERT INTO public.provider_roles (provider_id, name, description, permissions, is_active, is_system_role)
SELECT p.id, 'Receptionist', 'Front desk: bookings and POS, no finance access',
       public.get_receptionist_role_permissions(), true, true
FROM public.providers p
WHERE NOT EXISTS (
  SELECT 1 FROM public.provider_roles pr
  WHERE pr.provider_id = p.id AND lower(pr.name) = 'receptionist'
);
