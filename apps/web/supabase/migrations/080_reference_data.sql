-- Beautonomi Database Migration
-- 080_reference_data.sql
-- Creates reference_data table for dynamic dropdown options across the provider portal

-- Create reference_data table
CREATE TABLE IF NOT EXISTS reference_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,           -- Category of reference data (e.g., 'service_type', 'duration', 'price_type')
    value VARCHAR(100) NOT NULL,         -- The stored value (e.g., 'basic', '30', 'fixed')
    label VARCHAR(255) NOT NULL,         -- Display label (e.g., 'Basic Service', '30 minutes', 'Fixed price')
    description TEXT,                     -- Optional description/help text
    display_order INT DEFAULT 0,          -- Sort order within the type
    is_active BOOLEAN DEFAULT true,       -- Whether this option is currently available
    metadata JSONB DEFAULT '{}'::jsonb,   -- Additional metadata (e.g., for duration: { "minutes": 30 })
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint on type + value
CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_data_type_value ON reference_data(type, value);

-- Create index for efficient lookups by type
CREATE INDEX IF NOT EXISTS idx_reference_data_type ON reference_data(type);
CREATE INDEX IF NOT EXISTS idx_reference_data_type_active ON reference_data(type, is_active);

-- Add comments
COMMENT ON TABLE reference_data IS 'Stores reference/lookup data for dropdowns and selections across the provider portal';
COMMENT ON COLUMN reference_data.type IS 'Category of reference data: service_type, duration, price_type, availability, tax_rate, team_role, reminder_unit, extra_time_duration';
COMMENT ON COLUMN reference_data.value IS 'The value stored in the database when this option is selected';
COMMENT ON COLUMN reference_data.label IS 'Human-readable label displayed in the UI';
COMMENT ON COLUMN reference_data.metadata IS 'Additional data like numeric values, icons, colors, etc.';

-- Insert Service Types
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('service_type', 'basic', 'Basic Service', 'A standalone service offering', 1, '{"icon": "scissors"}'),
('service_type', 'package', 'Package', 'Multiple services bundled together', 2, '{"icon": "package"}'),
('service_type', 'addon', 'Add-on', 'Optional extra service added to main service', 3, '{"icon": "plus-circle"}'),
('service_type', 'variant', 'Variant', 'Different option for the same base service', 4, '{"icon": "copy"}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

-- Insert Duration Options
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('duration', '5', '5 minutes', NULL, 1, '{"minutes": 5}'),
('duration', '10', '10 minutes', NULL, 2, '{"minutes": 10}'),
('duration', '15', '15 minutes', NULL, 3, '{"minutes": 15}'),
('duration', '20', '20 minutes', NULL, 4, '{"minutes": 20}'),
('duration', '30', '30 minutes', NULL, 5, '{"minutes": 30}'),
('duration', '45', '45 minutes', NULL, 6, '{"minutes": 45}'),
('duration', '60', '1 hour', NULL, 7, '{"minutes": 60}'),
('duration', '75', '1 hour 15 minutes', NULL, 8, '{"minutes": 75}'),
('duration', '90', '1 hour 30 minutes', NULL, 9, '{"minutes": 90}'),
('duration', '105', '1 hour 45 minutes', NULL, 10, '{"minutes": 105}'),
('duration', '120', '2 hours', NULL, 11, '{"minutes": 120}'),
('duration', '150', '2 hours 30 minutes', NULL, 12, '{"minutes": 150}'),
('duration', '180', '3 hours', NULL, 13, '{"minutes": 180}'),
('duration', '210', '3 hours 30 minutes', NULL, 14, '{"minutes": 210}'),
('duration', '240', '4 hours', NULL, 15, '{"minutes": 240}'),
('duration', '300', '5 hours', NULL, 16, '{"minutes": 300}'),
('duration', '360', '6 hours', NULL, 17, '{"minutes": 360}'),
('duration', '480', '8 hours', NULL, 18, '{"minutes": 480}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Price Types
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('price_type', 'fixed', 'Fixed price', 'Service has a set price', 1, '{}'),
('price_type', 'from', 'Starting from', 'Price starts from this amount and may vary', 2, '{}'),
('price_type', 'free', 'Free', 'No charge for this service', 3, '{}'),
('price_type', 'varies', 'Price varies', 'Price depends on consultation', 4, '{}'),
('price_type', 'hourly', 'Hourly rate', 'Charged per hour', 5, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

-- Insert Availability Options (who can book)
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('availability', 'everyone', 'Everyone', 'Available to all clients', 1, '{}'),
('availability', 'women', 'Women only', 'Available only to female clients', 2, '{}'),
('availability', 'men', 'Men only', 'Available only to male clients', 3, '{}'),
('availability', 'children', 'Children only', 'Available only for children', 4, '{}'),
('availability', 'members', 'Members only', 'Available only to membership holders', 5, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

-- Insert Tax Rates
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('tax_rate', '0', 'No Tax', 'No tax applied', 1, '{"rate": 0, "included": true}'),
('tax_rate', '15', 'Standard Tax (15%)', 'South African VAT', 2, '{"rate": 15, "included": true}'),
('tax_rate', '5', 'Reduced Tax (5%)', 'Reduced rate', 3, '{"rate": 5, "included": true}'),
('tax_rate', '10', 'Tax (10%)', '10% tax rate', 4, '{"rate": 10, "included": true}'),
('tax_rate', '20', 'Tax (20%)', '20% tax rate', 5, '{"rate": 20, "included": true}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Team Member Roles
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('team_role', 'staff', 'Staff', 'Regular staff member', 1, '{"permissions": ["view_calendar", "manage_own_appointments"]}'),
('team_role', 'senior_staff', 'Senior Staff', 'Experienced staff with additional privileges', 2, '{"permissions": ["view_calendar", "manage_own_appointments", "view_reports"]}'),
('team_role', 'manager', 'Manager', 'Team manager with elevated access', 3, '{"permissions": ["view_calendar", "manage_all_appointments", "view_reports", "manage_staff"]}'),
('team_role', 'owner', 'Owner', 'Business owner with full access', 4, '{"permissions": ["full_access"]}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

-- Insert Reminder Time Units
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('reminder_unit', 'days', 'Days after', 'Remind after X days', 1, '{}'),
('reminder_unit', 'weeks', 'Weeks after', 'Remind after X weeks', 2, '{}'),
('reminder_unit', 'months', 'Months after', 'Remind after X months', 3, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label;

-- Insert Extra Time Duration Options
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('extra_time', '5', '5 min', 'Buffer time', 1, '{"minutes": 5}'),
('extra_time', '10', '10 min', 'Buffer time', 2, '{"minutes": 10}'),
('extra_time', '15', '15 min', 'Buffer time', 3, '{"minutes": 15}'),
('extra_time', '20', '20 min', 'Buffer time', 4, '{"minutes": 20}'),
('extra_time', '30', '30 min', 'Buffer time', 5, '{"minutes": 30}'),
('extra_time', '45', '45 min', 'Buffer time', 6, '{"minutes": 45}'),
('extra_time', '60', '60 min', 'Buffer time', 7, '{"minutes": 60}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Payment Methods
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('payment_method', 'cash', 'Cash', 'Cash payment', 1, '{"icon": "banknote"}'),
('payment_method', 'card', 'Card', 'Credit/Debit card payment', 2, '{"icon": "credit-card"}'),
('payment_method', 'eft', 'EFT/Bank Transfer', 'Electronic funds transfer', 3, '{"icon": "building-2"}'),
('payment_method', 'mobile', 'Mobile Payment', 'Mobile wallet payment (SnapScan, Zapper)', 4, '{"icon": "smartphone"}'),
('payment_method', 'gift_card', 'Gift Card', 'Gift card redemption', 5, '{"icon": "gift"}'),
('payment_method', 'account', 'On Account', 'Charge to client account', 6, '{"icon": "user"}'),
('payment_method', 'split', 'Split Payment', 'Multiple payment methods', 7, '{"icon": "split"}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Booking Status Options
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('booking_status', 'pending', 'Pending', 'Awaiting confirmation', 1, '{"color": "#FFA500"}'),
('booking_status', 'confirmed', 'Confirmed', 'Booking confirmed', 2, '{"color": "#4CAF50"}'),
('booking_status', 'arrived', 'Arrived', 'Client has arrived', 3, '{"color": "#2196F3"}'),
('booking_status', 'started', 'In Progress', 'Service in progress', 4, '{"color": "#9C27B0"}'),
('booking_status', 'completed', 'Completed', 'Service completed', 5, '{"color": "#4CAF50"}'),
('booking_status', 'cancelled', 'Cancelled', 'Booking cancelled', 6, '{"color": "#F44336"}'),
('booking_status', 'no_show', 'No Show', 'Client did not arrive', 7, '{"color": "#795548"}'),
('booking_status', 'rescheduled', 'Rescheduled', 'Booking rescheduled', 8, '{"color": "#FF9800"}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Currency Options
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('currency', 'ZAR', 'ZAR - South African Rand', 'South African Rand', 1, '{"symbol": "R", "code": "ZAR"}'),
('currency', 'USD', 'USD - US Dollar', 'United States Dollar', 2, '{"symbol": "$", "code": "USD"}'),
('currency', 'EUR', 'EUR - Euro', 'Euro', 3, '{"symbol": "€", "code": "EUR"}'),
('currency', 'GBP', 'GBP - British Pound', 'British Pound Sterling', 4, '{"symbol": "£", "code": "GBP"}'),
('currency', 'AED', 'AED - UAE Dirham', 'United Arab Emirates Dirham', 5, '{"symbol": "د.إ", "code": "AED"}'),
('currency', 'NGN', 'NGN - Nigerian Naira', 'Nigerian Naira', 6, '{"symbol": "₦", "code": "NGN"}'),
('currency', 'KES', 'KES - Kenyan Shilling', 'Kenyan Shilling', 7, '{"symbol": "KSh", "code": "KES"}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Cancellation Reasons
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('cancellation_reason', 'client_request', 'Client Request', 'Client requested cancellation', 1, '{}'),
('cancellation_reason', 'no_show', 'No Show', 'Client did not arrive', 2, '{}'),
('cancellation_reason', 'staff_unavailable', 'Staff Unavailable', 'Staff member became unavailable', 3, '{}'),
('cancellation_reason', 'double_booking', 'Double Booking', 'Scheduling conflict', 4, '{}'),
('cancellation_reason', 'emergency', 'Emergency', 'Emergency situation', 5, '{}'),
('cancellation_reason', 'weather', 'Weather', 'Weather-related cancellation', 6, '{}'),
('cancellation_reason', 'other', 'Other', 'Other reason', 7, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label;

-- Insert Discount Types
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('discount_type', 'percentage', 'Percentage', 'Discount as a percentage', 1, '{}'),
('discount_type', 'fixed', 'Fixed Amount', 'Fixed amount discount', 2, '{}'),
('discount_type', 'free_service', 'Free Service', 'Service provided for free', 3, '{}'),
('discount_type', 'buy_x_get_y', 'Buy X Get Y', 'Buy X items get Y free', 4, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label;

-- Insert Notification Channels
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('notification_channel', 'sms', 'SMS', 'Text message notification', 1, '{"icon": "message-square"}'),
('notification_channel', 'email', 'Email', 'Email notification', 2, '{"icon": "mail"}'),
('notification_channel', 'whatsapp', 'WhatsApp', 'WhatsApp message', 3, '{"icon": "message-circle"}'),
('notification_channel', 'push', 'Push Notification', 'Mobile app push notification', 4, '{"icon": "bell"}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Product Categories
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('product_category', 'skincare', 'Skincare', 'Skincare products', 1, '{}'),
('product_category', 'haircare', 'Haircare', 'Hair care products', 2, '{}'),
('product_category', 'makeup', 'Makeup', 'Makeup and cosmetics', 3, '{}'),
('product_category', 'nails', 'Nails', 'Nail care products', 4, '{}'),
('product_category', 'bodycare', 'Body Care', 'Body care products', 5, '{}'),
('product_category', 'tools', 'Tools & Equipment', 'Professional tools', 6, '{}'),
('product_category', 'accessories', 'Accessories', 'Beauty accessories', 7, '{}'),
('product_category', 'wellness', 'Wellness', 'Wellness and spa products', 8, '{}'),
('product_category', 'fragrance', 'Fragrance', 'Perfumes and fragrances', 9, '{}'),
('product_category', 'other', 'Other', 'Other products', 10, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label;

-- Insert Product Units
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('product_unit', 'ml', 'Milliliters (ml)', 'Volume in milliliters', 1, '{"type": "volume"}'),
('product_unit', 'l', 'Liters (l)', 'Volume in liters', 2, '{"type": "volume"}'),
('product_unit', 'g', 'Grams (g)', 'Weight in grams', 3, '{"type": "weight"}'),
('product_unit', 'kg', 'Kilograms (kg)', 'Weight in kilograms', 4, '{"type": "weight"}'),
('product_unit', 'oz', 'Ounces (oz)', 'Weight in ounces', 5, '{"type": "weight"}'),
('product_unit', 'fl_oz', 'Fluid Ounces (fl oz)', 'Volume in fluid ounces', 6, '{"type": "volume"}'),
('product_unit', 'piece', 'Piece', 'Individual piece', 7, '{"type": "count"}'),
('product_unit', 'pack', 'Pack', 'Pack/package', 8, '{"type": "count"}'),
('product_unit', 'box', 'Box', 'Box', 9, '{"type": "count"}'),
('product_unit', 'set', 'Set', 'Set of items', 10, '{"type": "count"}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Date Range Options (for reports and filters)
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('date_range', 'today', 'Today', 'Current day', 1, '{}'),
('date_range', 'yesterday', 'Yesterday', 'Previous day', 2, '{}'),
('date_range', 'this_week', 'This Week', 'Current week', 3, '{}'),
('date_range', 'last_week', 'Last Week', 'Previous week', 4, '{}'),
('date_range', 'this_month', 'This Month', 'Current month', 5, '{}'),
('date_range', 'last_month', 'Last Month', 'Previous month', 6, '{}'),
('date_range', 'this_quarter', 'This Quarter', 'Current quarter', 7, '{}'),
('date_range', 'last_quarter', 'Last Quarter', 'Previous quarter', 8, '{}'),
('date_range', 'this_year', 'This Year', 'Current year', 9, '{}'),
('date_range', 'last_year', 'Last Year', 'Previous year', 10, '{}'),
('date_range', 'custom', 'Custom Range', 'Custom date range', 11, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label;

-- Insert Appointment Types
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('appointment_type', 'in_salon', 'In Salon', 'Service at salon location', 1, '{"icon": "store"}'),
('appointment_type', 'at_home', 'At Home (Housecall)', 'Service at client location', 2, '{"icon": "home"}'),
('appointment_type', 'virtual', 'Virtual Consultation', 'Online video consultation', 3, '{"icon": "video"}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Client Gender Options
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('client_gender', 'female', 'Female', NULL, 1, '{}'),
('client_gender', 'male', 'Male', NULL, 2, '{}'),
('client_gender', 'non_binary', 'Non-binary', NULL, 3, '{}'),
('client_gender', 'prefer_not_say', 'Prefer not to say', NULL, 4, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label;

-- Insert Time Slot Intervals
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('time_slot_interval', '5', '5 minutes', NULL, 1, '{"minutes": 5}'),
('time_slot_interval', '10', '10 minutes', NULL, 2, '{"minutes": 10}'),
('time_slot_interval', '15', '15 minutes', NULL, 3, '{"minutes": 15}'),
('time_slot_interval', '30', '30 minutes', NULL, 4, '{"minutes": 30}'),
('time_slot_interval', '60', '1 hour', NULL, 5, '{"minutes": 60}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Insert Commission Types
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('commission_type', 'percentage', 'Percentage', 'Commission as percentage of service price', 1, '{}'),
('commission_type', 'fixed', 'Fixed Amount', 'Fixed commission amount per service', 2, '{}'),
('commission_type', 'tiered', 'Tiered', 'Commission varies by revenue tier', 3, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label;

-- Insert Working Days
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('working_day', 'monday', 'Monday', NULL, 1, '{"dayIndex": 1}'),
('working_day', 'tuesday', 'Tuesday', NULL, 2, '{"dayIndex": 2}'),
('working_day', 'wednesday', 'Wednesday', NULL, 3, '{"dayIndex": 3}'),
('working_day', 'thursday', 'Thursday', NULL, 4, '{"dayIndex": 4}'),
('working_day', 'friday', 'Friday', NULL, 5, '{"dayIndex": 5}'),
('working_day', 'saturday', 'Saturday', NULL, 6, '{"dayIndex": 6}'),
('working_day', 'sunday', 'Sunday', NULL, 7, '{"dayIndex": 0}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_reference_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_reference_data_updated_at ON reference_data;
CREATE TRIGGER trigger_update_reference_data_updated_at
    BEFORE UPDATE ON reference_data
    FOR EACH ROW
    EXECUTE FUNCTION update_reference_data_updated_at();

-- Enable RLS
ALTER TABLE reference_data ENABLE ROW LEVEL SECURITY;

-- Create policy for reading (anyone can read reference data)
DROP POLICY IF EXISTS "Anyone can read reference data" ON reference_data;
CREATE POLICY "Anyone can read reference data" ON reference_data
    FOR SELECT USING (true);

-- Create policy for admin to manage reference data
DROP POLICY IF EXISTS "Admins can manage reference data" ON reference_data;
CREATE POLICY "Admins can manage reference data" ON reference_data
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'superadmin'
        )
    );
