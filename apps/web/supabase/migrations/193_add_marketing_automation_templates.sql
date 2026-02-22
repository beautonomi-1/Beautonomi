-- ============================================================================
-- Migration 193: Add Marketing Automation Templates
-- ============================================================================
-- This migration adds default automation templates focused on building
-- relationships with clients, retention, and business growth.
-- Templates are provider-agnostic and can be activated by any provider.
-- ============================================================================

-- Add description and is_template columns if they don't exist
DO $$ 
BEGIN
    -- Add description column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'marketing_automations' 
        AND column_name = 'description'
    ) THEN
        ALTER TABLE public.marketing_automations 
        ADD COLUMN description TEXT;
    END IF;

    -- Add is_template column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'marketing_automations' 
        AND column_name = 'is_template'
    ) THEN
        ALTER TABLE public.marketing_automations 
        ADD COLUMN is_template BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Create a function to seed default templates for a provider
CREATE OR REPLACE FUNCTION seed_provider_automation_templates(p_provider_id UUID)
RETURNS void AS $$
BEGIN
    -- Only insert if provider doesn't have any templates yet
    IF NOT EXISTS (
        SELECT 1 FROM marketing_automations 
        WHERE provider_id = p_provider_id AND is_template = true
    ) THEN
        -- ========== REMINDERS TAB - Relationship Building ==========
        INSERT INTO public.marketing_automations (
            provider_id, name, description, trigger_type, trigger_config,
            action_type, action_config, delay_minutes, is_active, is_template
        ) VALUES
        -- 48h reminder with personal touch
        (
            p_provider_id,
            '48h Appointment Reminder',
            'Send friendly reminder 48 hours before appointment with preparation tips to show you care',
            'appointment_reminder',
            '{"hours_before": 48}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- 24h reminder with value-add
        (
            p_provider_id,
            '24h Upcoming Reminder',
            'Send reminder 24 hours before with personalized preparation tips and what to expect',
            'appointment_reminder',
            '{"hours_before": 24}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- 1h final reminder
        (
            p_provider_id,
            '1h Final Reminder',
            'Send final reminder 1 hour before appointment to ensure they arrive on time',
            'appointment_reminder',
            '{"hours_before": 1}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        );

        -- ========== APPOINTMENT UPDATES TAB - Communication ==========
        INSERT INTO public.marketing_automations (
            provider_id, name, description, trigger_type, trigger_config,
            action_type, action_config, delay_minutes, is_active, is_template
        ) VALUES
        -- Rescheduled with empathy
        (
            p_provider_id,
            'Appointment Rescheduled',
            'Notify client when appointment is rescheduled with understanding and new details',
            'appointment_rescheduled',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- No-show recovery with care
        (
            p_provider_id,
            'No-Show Follow-up',
            'Reach out after no-show with understanding and offer to reschedule - shows you care',
            'appointment_no_show',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            30,
            false,
            true
        );

        -- ========== INCREASE BOOKINGS TAB - Retention & Growth ==========
        INSERT INTO public.marketing_automations (
            provider_id, name, description, trigger_type, trigger_config,
            action_type, action_config, delay_minutes, is_active, is_template
        ) VALUES
        -- Thank you immediately
        (
            p_provider_id,
            'Thank You After Service',
            'Send personalized thank you message 15 minutes after service to show appreciation',
            'booking_completed',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            15,
            false,
            true
        ),
        -- Review request with timing
        (
            p_provider_id,
            'Review Request',
            'Request review 2 hours after service when experience is fresh in their mind',
            'booking_completed',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            120,
            false,
            true
        ),
        -- Re-book for maintenance services
        (
            p_provider_id,
            'Re-book Reminder (3 Days)',
            'Remind clients to re-book 3 days after service for regular maintenance - builds routine',
            'booking_completed',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            4320,
            false,
            true
        ),
        -- Re-book for longer intervals
        (
            p_provider_id,
            'Re-book Reminder (2 Weeks)',
            'Follow-up reminder 2 weeks after service for repeat bookings and loyalty',
            'booking_completed',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            20160,
            false,
            true
        ),
        -- Win-back inactive clients
        (
            p_provider_id,
            'Win-Back: 30 Days Inactive',
            'Re-engage clients who haven''t booked in 30 days with personalized message and special offer',
            'client_inactive',
            '{"days": 30}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- Win-back long-term inactive
        (
            p_provider_id,
            'Win-Back: 90 Days Inactive',
            'Re-engage long-term inactive clients with exclusive promotion and show you miss them',
            'client_inactive',
            '{"days": 90}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- New lead welcome
        (
            p_provider_id,
            'New Lead Welcome',
            'Welcome new leads who inquired within 1 hour with personalized introduction and next steps',
            'new_lead',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            60,
            false,
            true
        ),
        -- New lead follow-up
        (
            p_provider_id,
            'New Lead Follow-up',
            'Follow up with new leads after 24 hours if they haven''t booked - convert inquiries to bookings',
            'new_lead',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            1440,
            false,
            true
        ),
        -- Package expiration reminder
        (
            p_provider_id,
            'Package Expiring Soon',
            'Remind clients when their service package is about to expire with renewal incentive',
            'package_expiring',
            '{"days_before": 7}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- Seasonal engagement
        (
            p_provider_id,
            'Seasonal Promotion',
            'Send seasonal offers and promotions to active clients to maintain engagement',
            'seasonal_promotion',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        );

        -- ========== CELEBRATE MILESTONES TAB - Relationship Building ==========
        INSERT INTO public.marketing_automations (
            provider_id, name, description, trigger_type, trigger_config,
            action_type, action_config, delay_minutes, is_active, is_template
        ) VALUES
        -- Birthday with special offer
        (
            p_provider_id,
            'Client Birthday',
            'Send birthday wishes with special birthday offer - makes clients feel valued',
            'client_birthday',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- 1 year anniversary
        (
            p_provider_id,
            '1 Year Anniversary',
            'Celebrate 1 year anniversary with your business - strengthens long-term relationship',
            'client_anniversary',
            '{"years": 1}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- Visit milestones
        (
            p_provider_id,
            '10th Visit Milestone',
            'Celebrate client''s 10th visit with loyalty reward - recognizes their commitment',
            'visit_milestone',
            '{"visit_count": 10}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- VIP milestone
        (
            p_provider_id,
            '25th Visit Milestone',
            'Celebrate VIP client''s 25th visit with exclusive reward - shows appreciation for loyalty',
            'visit_milestone',
            '{"visit_count": 25}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- Referral appreciation
        (
            p_provider_id,
            'Referral Thank You',
            'Thank clients who refer new customers with reward - encourages more referrals',
            'referral_received',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        ),
        -- Holiday connection
        (
            p_provider_id,
            'Holiday Greeting',
            'Send holiday greetings with seasonal offers - maintains connection during holidays',
            'holiday',
            '{}'::jsonb,
            'sms',
            '{}'::jsonb,
            0,
            false,
            true
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Seed templates for all existing providers
DO $$
DECLARE
    provider_record RECORD;
BEGIN
    FOR provider_record IN SELECT id FROM providers LOOP
        PERFORM seed_provider_automation_templates(provider_record.id);
    END LOOP;
END $$;

-- Create trigger to auto-seed templates for new providers
CREATE OR REPLACE FUNCTION auto_seed_automation_templates()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM seed_provider_automation_templates(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_seed_automation_templates ON providers;
CREATE TRIGGER trigger_auto_seed_automation_templates
    AFTER INSERT ON providers
    FOR EACH ROW
    EXECUTE FUNCTION auto_seed_automation_templates();

-- Add index for template queries
CREATE INDEX IF NOT EXISTS idx_marketing_automations_template 
    ON marketing_automations(provider_id, is_template) 
    WHERE is_template = true;

COMMENT ON COLUMN marketing_automations.description IS 'Description of what the automation does and how it helps build client relationships';
COMMENT ON COLUMN marketing_automations.is_template IS 'Whether this is a default template that can be activated by providers';

-- Create automation_executions table to track executions and prevent duplicates
CREATE TABLE IF NOT EXISTS public.automation_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    automation_id UUID NOT NULL REFERENCES marketing_automations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id TEXT,
    action_type TEXT NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_automation_executions_automation 
    ON automation_executions(automation_id, customer_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_automation_executions_customer 
    ON automation_executions(customer_id, executed_at);

-- Create function to get inactive clients (for win-back automations)
CREATE OR REPLACE FUNCTION get_inactive_clients(
    p_provider_id UUID,
    p_days INTEGER
)
RETURNS TABLE (
    id UUID,
    last_booking_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        b.customer_id as id,
        MAX(b.scheduled_at) as last_booking_date
    FROM bookings b
    WHERE b.provider_id = p_provider_id
        AND b.status IN ('completed', 'confirmed')
        AND b.scheduled_at < NOW() - (p_days || ' days')::INTERVAL
    GROUP BY b.customer_id
    HAVING MAX(b.scheduled_at) < NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;
