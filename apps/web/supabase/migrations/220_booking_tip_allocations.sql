-- ============================================================================
-- Migration 220: Booking Tip Allocations
-- ============================================================================
-- Creates provider_tip_settings (if missing), booking_tip_allocations, and
-- trigger to allocate tips to staff when distribute_to_staff is true.
-- ============================================================================

-- 0. Create provider_tip_settings (required by tips distribution API and this migration)
CREATE TABLE IF NOT EXISTS provider_tip_settings (
    provider_id UUID PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
    keep_all_tips BOOLEAN NOT NULL DEFAULT true,
    distribute_to_staff BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE provider_tip_settings IS 'Provider settings for tip distribution. When distribute_to_staff is true, tips are allocated to staff proportionally.';

-- 1. Create booking_tip_allocations table
CREATE TABLE IF NOT EXISTS booking_tip_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(booking_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_tip_allocations_booking ON booking_tip_allocations(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_tip_allocations_staff ON booking_tip_allocations(staff_id);

COMMENT ON TABLE booking_tip_allocations IS 'Tip amounts allocated to staff for a booking. Used when distribute_to_staff is true.';

-- 2. RLS
ALTER TABLE booking_tip_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can view tip allocations" ON booking_tip_allocations;
CREATE POLICY "Providers can view tip allocations"
    ON booking_tip_allocations FOR SELECT
    USING (
        booking_id IN (
            SELECT id FROM bookings
            WHERE provider_id IN (
                SELECT id FROM providers WHERE user_id = auth.uid()
                UNION
                SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage tip allocations" ON booking_tip_allocations;
CREATE POLICY "Provider owners can manage tip allocations"
    ON booking_tip_allocations FOR ALL
    USING (
        booking_id IN (
            SELECT id FROM bookings
            WHERE provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
        )
    );

-- 3. Trigger: when a tip finance_transaction is inserted, create allocations if distribute_to_staff
CREATE OR REPLACE FUNCTION create_tip_allocations_on_tip_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_distribute boolean;
    v_total_price numeric := 0;
    v_staff_price numeric;
    v_staff_record record;
BEGIN
    IF NEW.transaction_type != 'tip' OR NEW.amount IS NULL OR NEW.amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Check if provider distributes tips to staff
    SELECT COALESCE(pt.distribute_to_staff, false) INTO v_distribute
    FROM provider_tip_settings pt
    WHERE pt.provider_id = NEW.provider_id;

    IF NOT v_distribute THEN
        RETURN NEW;
    END IF;

    -- Avoid duplicates: skip if allocations already exist for this booking
    IF EXISTS (SELECT 1 FROM booking_tip_allocations WHERE booking_id = NEW.booking_id) THEN
        RETURN NEW;
    END IF;

    -- Sum total service price per staff
    SELECT COALESCE(SUM(bs.price), 0) INTO v_total_price
    FROM booking_services bs
    WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0;

    IF v_total_price <= 0 THEN
        -- No services with staff: tip stays unallocated (provider-level)
        RETURN NEW;
    END IF;

    -- Insert allocation per staff (proportional to service price)
    FOR v_staff_record IN
        SELECT bs.staff_id, SUM(bs.price) AS staff_total
        FROM booking_services bs
        WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0
        GROUP BY bs.staff_id
    LOOP
        v_staff_price := (NEW.amount * v_staff_record.staff_total / v_total_price);
        IF v_staff_price > 0 THEN
            INSERT INTO booking_tip_allocations (booking_id, staff_id, amount)
            VALUES (NEW.booking_id, v_staff_record.staff_id, v_staff_price)
            ON CONFLICT (booking_id, staff_id) DO UPDATE SET amount = EXCLUDED.amount;
        END IF;
    END LOOP;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error creating tip allocations for booking %: %', NEW.booking_id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_tip_allocations_on_tip ON finance_transactions;
CREATE TRIGGER create_tip_allocations_on_tip
    AFTER INSERT ON finance_transactions
    FOR EACH ROW
    WHEN (NEW.transaction_type = 'tip')
    EXECUTE FUNCTION create_tip_allocations_on_tip_transaction();

-- 4. Backfill: create allocations for existing tip transactions (where distribute_to_staff)
DO $$
DECLARE
    ft_rec record;
    total_price numeric;
BEGIN
    FOR ft_rec IN
        SELECT ft.booking_id, ft.provider_id, ft.amount
        FROM finance_transactions ft
        WHERE ft.transaction_type = 'tip' AND ft.amount > 0 AND ft.booking_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM booking_tip_allocations WHERE booking_id = ft.booking_id)
          AND EXISTS (SELECT 1 FROM provider_tip_settings WHERE provider_id = ft.provider_id AND distribute_to_staff = true)
    LOOP
        SELECT COALESCE(SUM(price), 0) INTO total_price
        FROM booking_services
        WHERE booking_id = ft_rec.booking_id AND staff_id IS NOT NULL AND price > 0;

        IF total_price > 0 THEN
            INSERT INTO booking_tip_allocations (booking_id, staff_id, amount)
            SELECT ft_rec.booking_id, staff_id, (ft_rec.amount * staff_total / total_price)
            FROM (
                SELECT staff_id, SUM(price) AS staff_total
                FROM booking_services
                WHERE booking_id = ft_rec.booking_id AND staff_id IS NOT NULL AND price > 0
                GROUP BY staff_id
            ) sub
            ON CONFLICT (booking_id, staff_id) DO NOTHING;
        END IF;
    END LOOP;
END $$;
