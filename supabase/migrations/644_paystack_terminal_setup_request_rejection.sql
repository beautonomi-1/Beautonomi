-- Paystack Virtual Terminal setup request rejection workflow.
--
-- Lets Ops reject a provider's terminal setup request with a reason that is shown
-- back to the provider, optionally opening a support ticket so Ops can chat with
-- the provider. After a rejection the provider can fix their WhatsApp number (or
-- other details) and submit a fresh request.

-- 1) Allow the 'rejected' status.
ALTER TABLE public.provider_paystack_virtual_terminal_setup_requests
    DROP CONSTRAINT IF EXISTS provider_paystack_virtual_terminal_setup_requests_status_check;

ALTER TABLE public.provider_paystack_virtual_terminal_setup_requests
    ADD CONSTRAINT provider_paystack_virtual_terminal_setup_requests_status_check
    CHECK (status IN ('requested', 'in_progress', 'created', 'cancelled', 'rejected'));

-- 2) Rejection metadata + support ticket link.
ALTER TABLE public.provider_paystack_virtual_terminal_setup_requests
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS support_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_setup_requests_rejected
    ON public.provider_paystack_virtual_terminal_setup_requests(provider_id, rejected_at DESC)
    WHERE status = 'rejected';
