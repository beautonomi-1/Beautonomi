-- Beautonomi Database Migration
-- 070_note_templates_waitlist_resources.sql
-- Creates tables for note templates, waitlist, and resources

-- Drop tables if they exist (to handle partial migrations)
DROP TABLE IF EXISTS public.marketing_automations CASCADE;
DROP TABLE IF EXISTS public.recurring_appointments CASCADE;
DROP TABLE IF EXISTS public.express_booking_links CASCADE;
DROP TABLE IF EXISTS public.resources CASCADE;
DROP TABLE IF EXISTS public.resource_groups CASCADE;
DROP TABLE IF EXISTS public.waitlist_entries CASCADE;
DROP TABLE IF EXISTS public.note_templates CASCADE;

-- Note Templates table
CREATE TABLE public.note_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT, -- 'booking', 'client', 'general'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waitlist Entries table
CREATE TABLE public.waitlist_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT,
    service_id UUID REFERENCES offerings(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL,
    preferred_date DATE,
    preferred_time_start TIME,
    preferred_time_end TIME,
    notes TEXT,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'contacted', 'booked', 'cancelled')),
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resource Groups table (for grouping resources like "Treatment Rooms", "Equipment")
CREATE TABLE public.resource_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#FF0077',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resources table (rooms, equipment, etc.)
CREATE TABLE public.resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    group_id UUID REFERENCES resource_groups(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    capacity INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Express Booking Links table
CREATE TABLE public.express_booking_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    service_ids UUID[] DEFAULT '{}',
    staff_ids UUID[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    use_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, slug)
);

-- Recurring Appointments table
CREATE TABLE public.recurring_appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    service_id UUID REFERENCES offerings(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL,
    recurrence_rule TEXT NOT NULL, -- RRULE format
    start_date DATE NOT NULL,
    end_date DATE,
    start_time TIME NOT NULL,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Marketing Automations table
CREATE TABLE public.marketing_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- 'booking_completed', 'no_show', 'birthday', etc.
    trigger_config JSONB DEFAULT '{}',
    action_type TEXT NOT NULL, -- 'email', 'sms', 'notification'
    action_config JSONB DEFAULT '{}',
    delay_minutes INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_note_templates_provider ON note_templates(provider_id);
CREATE INDEX IF NOT EXISTS idx_note_templates_active ON note_templates(provider_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_provider ON waitlist_entries(provider_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_status ON waitlist_entries(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_date ON waitlist_entries(provider_id, preferred_date);

CREATE INDEX IF NOT EXISTS idx_resource_groups_provider ON resource_groups(provider_id);
CREATE INDEX IF NOT EXISTS idx_resources_provider ON resources(provider_id);
CREATE INDEX IF NOT EXISTS idx_resources_group ON resources(group_id);

CREATE INDEX IF NOT EXISTS idx_express_booking_links_provider ON express_booking_links(provider_id);
CREATE INDEX IF NOT EXISTS idx_express_booking_links_slug ON express_booking_links(provider_id, slug);

CREATE INDEX IF NOT EXISTS idx_recurring_appointments_provider ON recurring_appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_recurring_appointments_active ON recurring_appointments(provider_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_marketing_automations_provider ON marketing_automations(provider_id);
CREATE INDEX IF NOT EXISTS idx_marketing_automations_active ON marketing_automations(provider_id, is_active) WHERE is_active = true;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_note_templates_updated_at ON note_templates;
CREATE TRIGGER update_note_templates_updated_at BEFORE UPDATE ON note_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_waitlist_entries_updated_at ON waitlist_entries;
CREATE TRIGGER update_waitlist_entries_updated_at BEFORE UPDATE ON waitlist_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resource_groups_updated_at ON resource_groups;
CREATE TRIGGER update_resource_groups_updated_at BEFORE UPDATE ON resource_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resources_updated_at ON resources;
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_express_booking_links_updated_at ON express_booking_links;
CREATE TRIGGER update_express_booking_links_updated_at BEFORE UPDATE ON express_booking_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recurring_appointments_updated_at ON recurring_appointments;
CREATE TRIGGER update_recurring_appointments_updated_at BEFORE UPDATE ON recurring_appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_marketing_automations_updated_at ON marketing_automations;
CREATE TRIGGER update_marketing_automations_updated_at BEFORE UPDATE ON marketing_automations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_automations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for note_templates
DROP POLICY IF EXISTS "Providers can manage own note templates" ON note_templates;
CREATE POLICY "Providers can manage own note templates"
    ON note_templates FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = note_templates.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

-- RLS Policies for waitlist_entries
DROP POLICY IF EXISTS "Providers can manage own waitlist entries" ON waitlist_entries;
CREATE POLICY "Providers can manage own waitlist entries"
    ON waitlist_entries FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = waitlist_entries.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

-- RLS Policies for resource_groups
DROP POLICY IF EXISTS "Providers can manage own resource groups" ON resource_groups;
CREATE POLICY "Providers can manage own resource groups"
    ON resource_groups FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = resource_groups.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

-- RLS Policies for resources
DROP POLICY IF EXISTS "Providers can manage own resources" ON resources;
CREATE POLICY "Providers can manage own resources"
    ON resources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = resources.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

-- RLS Policies for express_booking_links
DROP POLICY IF EXISTS "Providers can manage own express booking links" ON express_booking_links;
CREATE POLICY "Providers can manage own express booking links"
    ON express_booking_links FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = express_booking_links.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for recurring_appointments
DROP POLICY IF EXISTS "Providers can manage own recurring appointments" ON recurring_appointments;
CREATE POLICY "Providers can manage own recurring appointments"
    ON recurring_appointments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = recurring_appointments.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

-- RLS Policies for marketing_automations
DROP POLICY IF EXISTS "Provider owners can manage automations" ON marketing_automations;
CREATE POLICY "Provider owners can manage automations"
    ON marketing_automations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = marketing_automations.provider_id
            AND providers.user_id = auth.uid()
        )
    );
