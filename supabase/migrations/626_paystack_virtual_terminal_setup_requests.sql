-- Paystack Virtual Terminal setup request queue.
--
-- Stores the provider-requested, admin-ready Paystack create payload so Ops can
-- create the terminal with prefilled name, WhatsApp destination, metadata,
-- currency, and custom fields instead of rebuilding context from Slack.

CREATE TABLE IF NOT EXISTS public.provider_paystack_virtual_terminal_setup_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.provider_locations(id) ON DELETE SET NULL,
    requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (
        status IN ('requested', 'in_progress', 'created', 'cancelled')
    ),
    requested_display_name TEXT NOT NULL,
    suggested_paystack_name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'ZAR',
    destination_target TEXT,
    destination_name TEXT,
    destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
    custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_notes TEXT,
    fulfilled_terminal_id UUID REFERENCES public.provider_paystack_virtual_terminals(id) ON DELETE SET NULL,
    fulfilled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_setup_requests_status
    ON public.provider_paystack_virtual_terminal_setup_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_setup_requests_provider
    ON public.provider_paystack_virtual_terminal_setup_requests(provider_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_paystack_vt_setup_open
    ON public.provider_paystack_virtual_terminal_setup_requests(
        provider_id,
        COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE status IN ('requested', 'in_progress');

DO $$
BEGIN
    DROP TRIGGER IF EXISTS update_provider_paystack_vt_setup_requests_updated_at
        ON public.provider_paystack_virtual_terminal_setup_requests;
    CREATE TRIGGER update_provider_paystack_vt_setup_requests_updated_at
        BEFORE UPDATE ON public.provider_paystack_virtual_terminal_setup_requests
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END $$;

ALTER TABLE public.provider_paystack_virtual_terminal_setup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can manage Paystack terminal setup requests"
    ON public.provider_paystack_virtual_terminal_setup_requests;
CREATE POLICY "Superadmins can manage Paystack terminal setup requests"
    ON public.provider_paystack_virtual_terminal_setup_requests FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS "Providers can view own Paystack terminal setup requests"
    ON public.provider_paystack_virtual_terminal_setup_requests;
CREATE POLICY "Providers can view own Paystack terminal setup requests"
    ON public.provider_paystack_virtual_terminal_setup_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_paystack_virtual_terminal_setup_requests.provider_id
              AND (
                p.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.provider_staff ps
                    WHERE ps.provider_id = p.id
                      AND ps.user_id = auth.uid()
                      AND ps.status = 'active'
                )
              )
        )
    );
