-- Provider Forms and Form Fields
-- Structured forms system for intake forms, consent forms, and waivers

CREATE TABLE IF NOT EXISTS public.provider_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    form_type TEXT NOT NULL DEFAULT 'intake' CHECK (form_type IN ('intake', 'consent', 'waiver')),
    is_required BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_form_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id UUID NOT NULL REFERENCES provider_forms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'checkbox', 'signature', 'date')),
    is_required BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_forms_provider ON provider_forms(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_forms_active ON provider_forms(provider_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_provider_form_fields_form ON provider_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_provider_form_fields_order ON provider_form_fields(form_id, sort_order);

DROP TRIGGER IF EXISTS update_provider_forms_updated_at ON provider_forms;
CREATE TRIGGER update_provider_forms_updated_at BEFORE UPDATE ON provider_forms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_provider_form_fields_updated_at ON provider_form_fields;
CREATE TRIGGER update_provider_form_fields_updated_at BEFORE UPDATE ON provider_form_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE provider_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can manage own forms" ON provider_forms;
CREATE POLICY "Providers can manage own forms"
    ON provider_forms FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_forms.provider_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );

DROP POLICY IF EXISTS "Providers can manage own form fields" ON provider_form_fields;
CREATE POLICY "Providers can manage own form fields"
    ON provider_form_fields FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM provider_forms
            JOIN providers ON providers.id = provider_forms.provider_id
            WHERE provider_forms.id = provider_form_fields.form_id
            AND (providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                ))
        )
    );
