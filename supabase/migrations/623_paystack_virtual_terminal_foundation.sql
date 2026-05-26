-- Paystack Virtual Terminal foundation.
--
-- Adds the platform/tenant feature flag and provider-scoped tables required to
-- model Paystack Virtual Terminal collection as platform-held in-person money.
-- This migration intentionally does not backfill payments or change existing
-- Paystack/Yoco ledger behavior.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'payment_paystack_virtual_terminal',
    'Paystack Virtual Terminal',
    'Enable provider-side Paystack Virtual Terminal collection, including QR/link terminal payments, provider allocation review, and Superadmin reconciliation.',
    false,
    'payments'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'payment_paystack_virtual_terminal'
      AND tenant_id IS NULL
);

CREATE TABLE IF NOT EXISTS public.provider_paystack_virtual_terminals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.provider_locations(id) ON DELETE SET NULL,
    paystack_terminal_id BIGINT,
    terminal_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'sync_error')),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    active BOOLEAN NOT NULL DEFAULT true,
    destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
    custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    split_code TEXT,
    qr_url TEXT,
    terminal_url TEXT,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    last_payment_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(provider_id, location_id, name)
);

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_provider
    ON public.provider_paystack_virtual_terminals(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_location
    ON public.provider_paystack_virtual_terminals(provider_id, location_id);
CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_active
    ON public.provider_paystack_virtual_terminals(provider_id, active)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.provider_paystack_terminal_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    terminal_id UUID REFERENCES public.provider_paystack_virtual_terminals(id) ON DELETE SET NULL,
    terminal_code TEXT,
    paystack_transaction_id BIGINT,
    paystack_reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'received' CHECK (
        status IN (
            'expected',
            'received',
            'matched',
            'allocated',
            'accepted',
            'held',
            'payout_eligible',
            'reserved',
            'included_in_payout',
            'paid_out',
            'refunded',
            'disputed',
            'chargeback',
            'failed',
            'cancelled'
        )
    ),
    allocation_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (
        allocation_status IN (
            'unmatched',
            'suggested',
            'provider_confirmed',
            'provider_declined',
            'allocated',
            'split_allocated',
            'admin_review',
            'admin_resolved',
            'refunded',
            'disputed'
        )
    ),
    amount_match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (
        amount_match_status IN (
            'exact_match',
            'partial_payment',
            'overpayment',
            'zero_or_no_balance',
            'amount_only_match',
            'ambiguous_amount_match',
            'mismatch',
            'currency_mismatch',
            'unmatched'
        )
    ),
    gross_amount NUMERIC(12, 2) NOT NULL CHECK (gross_amount >= 0),
    paid_amount NUMERIC(12, 2) NOT NULL CHECK (paid_amount >= 0),
    expected_amount NUMERIC(12, 2),
    amount_due_at_match_time NUMERIC(12, 2),
    amount_difference NUMERIC(12, 2),
    gateway_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (gateway_fee_amount >= 0),
    net_amount NUMERIC(12, 2),
    allocated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
    overpayment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (overpayment_amount >= 0),
    remaining_balance NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    payer_name TEXT,
    payer_email TEXT,
    payer_phone TEXT,
    customer_reference TEXT,
    suggested_entity_type TEXT,
    suggested_entity_id UUID,
    suggestion_confidence NUMERIC(5, 2),
    candidate_match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    provider_notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        provider_notification_status IN ('pending', 'sent', 'seen', 'failed', 'not_required')
    ),
    provider_notified_at TIMESTAMP WITH TIME ZONE,
    provider_seen_at TIMESTAMP WITH TIME ZONE,
    provider_assigned_entity_type TEXT,
    provider_assigned_entity_id UUID,
    provider_assignment_reason TEXT,
    provider_assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    provider_assigned_at TIMESTAMP WITH TIME ZONE,
    provider_declined_suggestion BOOLEAN NOT NULL DEFAULT false,
    provider_decline_reason TEXT,
    payout_eligibility_status TEXT NOT NULL DEFAULT 'not_eligible' CHECK (
        payout_eligibility_status IN (
            'not_eligible',
            'held',
            'eligible',
            'reserved',
            'included_in_payout',
            'paid_out',
            'blocked',
            'clawed_back'
        )
    ),
    payout_hold_until TIMESTAMP WITH TIME ZONE,
    payout_id UUID REFERENCES public.payouts(id) ON DELETE SET NULL,
    support_case_id UUID,
    dispute_id UUID,
    refund_status TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    allocated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_paystack_terminal_payments_provider
    ON public.provider_paystack_terminal_payments(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_paystack_terminal_payments_terminal
    ON public.provider_paystack_terminal_payments(terminal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_paystack_terminal_payments_allocation
    ON public.provider_paystack_terminal_payments(provider_id, allocation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_paystack_terminal_payments_payout
    ON public.provider_paystack_terminal_payments(provider_id, payout_eligibility_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.provider_terminal_payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    terminal_payment_id UUID NOT NULL REFERENCES public.provider_paystack_terminal_payments(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (
        entity_type IN (
            'booking',
            'invoice',
            'sale',
            'product_order',
            'group_booking',
            'additional_charge',
            'other'
        )
    ),
    entity_id UUID NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'confirmed', 'declined', 'admin_review', 'reversed', 'refunded')
    ),
    reason TEXT,
    allocated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    allocated_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_terminal_payment_allocations_payment
    ON public.provider_terminal_payment_allocations(terminal_payment_id);
CREATE INDEX IF NOT EXISTS idx_provider_terminal_payment_allocations_provider
    ON public.provider_terminal_payment_allocations(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_terminal_payment_allocations_entity
    ON public.provider_terminal_payment_allocations(entity_type, entity_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        DROP TRIGGER IF EXISTS update_provider_paystack_virtual_terminals_updated_at
            ON public.provider_paystack_virtual_terminals;
        CREATE TRIGGER update_provider_paystack_virtual_terminals_updated_at
            BEFORE UPDATE ON public.provider_paystack_virtual_terminals
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        DROP TRIGGER IF EXISTS update_provider_paystack_terminal_payments_updated_at
            ON public.provider_paystack_terminal_payments;
        CREATE TRIGGER update_provider_paystack_terminal_payments_updated_at
            BEFORE UPDATE ON public.provider_paystack_terminal_payments
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        DROP TRIGGER IF EXISTS update_provider_terminal_payment_allocations_updated_at
            ON public.provider_terminal_payment_allocations;
        CREATE TRIGGER update_provider_terminal_payment_allocations_updated_at
            BEFORE UPDATE ON public.provider_terminal_payment_allocations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

ALTER TABLE public.provider_paystack_virtual_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_paystack_terminal_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_terminal_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can view own Paystack virtual terminals"
    ON public.provider_paystack_virtual_terminals;
CREATE POLICY "Providers can view own Paystack virtual terminals"
    ON public.provider_paystack_virtual_terminals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_paystack_virtual_terminals.provider_id
              AND (
                p.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.provider_staff ps
                    WHERE ps.provider_id = p.id
                      AND ps.user_id = auth.uid()
                      AND ps.is_active = true
                )
              )
        )
    );

DROP POLICY IF EXISTS "Providers can view own Paystack terminal payments"
    ON public.provider_paystack_terminal_payments;
CREATE POLICY "Providers can view own Paystack terminal payments"
    ON public.provider_paystack_terminal_payments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_paystack_terminal_payments.provider_id
              AND (
                p.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.provider_staff ps
                    WHERE ps.provider_id = p.id
                      AND ps.user_id = auth.uid()
                      AND ps.is_active = true
                )
              )
        )
    );

DROP POLICY IF EXISTS "Providers can view own terminal payment allocations"
    ON public.provider_terminal_payment_allocations;
CREATE POLICY "Providers can view own terminal payment allocations"
    ON public.provider_terminal_payment_allocations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_terminal_payment_allocations.provider_id
              AND (
                p.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.provider_staff ps
                    WHERE ps.provider_id = p.id
                      AND ps.user_id = auth.uid()
                      AND ps.is_active = true
                )
              )
        )
    );

DROP POLICY IF EXISTS "Superadmins can manage Paystack virtual terminals"
    ON public.provider_paystack_virtual_terminals;
CREATE POLICY "Superadmins can manage Paystack virtual terminals"
    ON public.provider_paystack_virtual_terminals FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS "Superadmins can manage Paystack terminal payments"
    ON public.provider_paystack_terminal_payments;
CREATE POLICY "Superadmins can manage Paystack terminal payments"
    ON public.provider_paystack_terminal_payments FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS "Superadmins can manage terminal payment allocations"
    ON public.provider_terminal_payment_allocations;
CREATE POLICY "Superadmins can manage terminal payment allocations"
    ON public.provider_terminal_payment_allocations FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));
