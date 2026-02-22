-- Beautonomi Database Migration
-- 012_functions_and_triggers.sql
-- Creates additional database functions and triggers

-- Function to generate unique booking number
CREATE OR REPLACE FUNCTION generate_booking_number()
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT := 'BTN';
    v_timestamp TEXT;
    v_random TEXT;
    v_booking_number TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- Format: BTN-YYYYMMDD-HHMMSS-XXXX (where XXXX is random 4-digit number)
        v_timestamp := TO_CHAR(NOW(), 'YYYYMMDD-HHMMSS');
        v_random := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        v_booking_number := v_prefix || '-' || v_timestamp || '-' || v_random;
        
        -- Check if booking number already exists
        SELECT EXISTS(SELECT 1 FROM bookings WHERE booking_number = v_booking_number) INTO v_exists;
        
        EXIT WHEN NOT v_exists;
    END LOOP;
    
    RETURN v_booking_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique payment number
CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT := 'PAY';
    v_timestamp TEXT;
    v_random TEXT;
    v_payment_number TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        v_timestamp := TO_CHAR(NOW(), 'YYYYMMDD-HHMMSS');
        v_random := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        v_payment_number := v_prefix || '-' || v_timestamp || '-' || v_random;
        
        SELECT EXISTS(SELECT 1 FROM payments WHERE payment_number = v_payment_number) INTO v_exists;
        
        EXIT WHEN NOT v_exists;
    END LOOP;
    
    RETURN v_payment_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique payout number
CREATE OR REPLACE FUNCTION generate_payout_number()
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT := 'POUT';
    v_timestamp TEXT;
    v_random TEXT;
    v_payout_number TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        v_timestamp := TO_CHAR(NOW(), 'YYYYMMDD-HHMMSS');
        v_random := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        v_payout_number := v_prefix || '-' || v_timestamp || '-' || v_random;
        
        SELECT EXISTS(SELECT 1 FROM payouts WHERE payout_number = v_payout_number) INTO v_exists;
        
        EXIT WHEN NOT v_exists;
    END LOOP;
    
    RETURN v_payout_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
    v_user_email TEXT;
BEGIN
    -- Get first part of user email or use user ID
    SELECT SPLIT_PART(email, '@', 1) INTO v_user_email FROM users WHERE id = p_user_id;
    v_user_email := UPPER(REGEXP_REPLACE(v_user_email, '[^A-Z0-9]', '', 'g'));
    v_user_email := LEFT(v_user_email, 6);
    
    LOOP
        v_code := v_user_email || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 6));
        
        SELECT EXISTS(SELECT 1 FROM referrals WHERE referral_code = v_code) INTO v_exists;
        
        EXIT WHEN NOT v_exists;
    END LOOP;
    
    RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate booking number on insert
CREATE OR REPLACE FUNCTION set_booking_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.booking_number IS NULL OR NEW.booking_number = '' THEN
        NEW.booking_number := generate_booking_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_booking_created_set_number
    BEFORE INSERT ON bookings
    FOR EACH ROW
    WHEN (NEW.booking_number IS NULL OR NEW.booking_number = '')
    EXECUTE FUNCTION set_booking_number();

-- Trigger to auto-generate payment number on insert
CREATE OR REPLACE FUNCTION set_payment_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_number IS NULL OR NEW.payment_number = '' THEN
        NEW.payment_number := generate_payment_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payment_created_set_number
    BEFORE INSERT ON payments
    FOR EACH ROW
    WHEN (NEW.payment_number IS NULL OR NEW.payment_number = '')
    EXECUTE FUNCTION set_payment_number();

-- Trigger to auto-generate payout number on insert
CREATE OR REPLACE FUNCTION set_payout_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payout_number IS NULL OR NEW.payout_number = '' THEN
        NEW.payout_number := generate_payout_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payout_created_set_number
    BEFORE INSERT ON payouts
    FOR EACH ROW
    WHEN (NEW.payout_number IS NULL OR NEW.payout_number = '')
    EXECUTE FUNCTION set_payout_number();

-- Function to update provider total bookings count
CREATE OR REPLACE FUNCTION update_provider_booking_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE providers
        SET total_bookings = total_bookings + 1
        WHERE id = NEW.provider_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE providers
        SET total_bookings = GREATEST(total_bookings - 1, 0)
        WHERE id = OLD.provider_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_booking_created_update_stats
    AFTER INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_provider_booking_stats();

CREATE TRIGGER on_booking_deleted_update_stats
    AFTER DELETE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_provider_booking_stats();

-- Function to update provider total earnings
CREATE OR REPLACE FUNCTION update_provider_earnings()
RETURNS TRIGGER AS $$
DECLARE
    v_earnings NUMERIC(10, 2);
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'paid' THEN
        -- Calculate net earnings (after platform fee)
        SELECT COALESCE(SUM(net_amount), 0)
        INTO v_earnings
        FROM payouts
        WHERE provider_id = NEW.provider_id
        AND status = 'completed';
        
        UPDATE providers
        SET total_earnings = v_earnings
        WHERE id = NEW.provider_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- Recalculate when payout is completed
        SELECT COALESCE(SUM(net_amount), 0)
        INTO v_earnings
        FROM payouts
        WHERE provider_id = NEW.provider_id
        AND status = 'completed';
        
        UPDATE providers
        SET total_earnings = v_earnings
        WHERE id = NEW.provider_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payout_status_update_earnings
    AFTER INSERT OR UPDATE ON payouts
    FOR EACH ROW EXECUTE FUNCTION update_provider_earnings();

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type notification_type,
    p_title TEXT,
    p_message TEXT,
    p_data JSONB DEFAULT '{}'::jsonb,
    p_action_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, title, message, data, action_url)
    VALUES (p_user_id, p_type, p_title, p_message, p_data, p_action_url)
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check booking availability
CREATE OR REPLACE FUNCTION check_booking_availability(
    p_provider_id UUID,
    p_staff_id UUID,
    p_location_id UUID,
    p_start_at TIMESTAMP WITH TIME ZONE,
    p_end_at TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN AS $$
DECLARE
    v_conflict_count INTEGER;
BEGIN
    -- Check for conflicting bookings
    SELECT COUNT(*)
    INTO v_conflict_count
    FROM booking_services bs
    JOIN bookings b ON b.id = bs.booking_id
    WHERE b.provider_id = p_provider_id
    AND b.status NOT IN ('cancelled', 'no_show')
    AND (
        (p_staff_id IS NULL OR bs.staff_id = p_staff_id) OR
        (p_staff_id IS NOT NULL AND bs.staff_id IS NULL)
    )
    AND (
        (p_location_id IS NULL) OR
        (b.location_id = p_location_id)
    )
    AND (
        (bs.scheduled_start_at < p_end_at AND bs.scheduled_end_at > p_start_at)
    );
    
    -- Check for availability blocks
    SELECT COUNT(*)
    INTO v_conflict_count
    FROM availability_blocks
    WHERE provider_id = p_provider_id
    AND (
        (p_staff_id IS NULL OR staff_id = p_staff_id) OR
        (p_staff_id IS NOT NULL AND staff_id IS NULL)
    )
    AND (
        (p_location_id IS NULL OR location_id = p_location_id) OR
        location_id IS NULL
    )
    AND (
        (start_at < p_end_at AND end_at > p_start_at)
    );
    
    RETURN v_conflict_count = 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to update user last login
CREATE OR REPLACE FUNCTION update_user_last_login()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users
    SET last_login_at = NOW()
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: This trigger would be set up via Supabase Auth hooks
-- For now, we'll create a function that can be called manually or via API
