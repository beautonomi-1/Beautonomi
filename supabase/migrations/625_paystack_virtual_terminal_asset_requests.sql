-- Paystack Virtual Terminal branded asset request workflow.
--
-- Tracks provider requests for Beautonomi-branded QR/poster assets so Ops can
-- work from an explicit queue instead of polling all incomplete terminals.

ALTER TABLE public.provider_paystack_virtual_terminals
    ADD COLUMN IF NOT EXISTS asset_request_status TEXT NOT NULL DEFAULT 'not_requested',
    ADD COLUMN IF NOT EXISTS asset_request_notes TEXT,
    ADD COLUMN IF NOT EXISTS asset_requested_by_provider_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS asset_request_completed_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
    ALTER TABLE public.provider_paystack_virtual_terminals
        ADD CONSTRAINT provider_paystack_vt_asset_request_status_check
        CHECK (asset_request_status IN ('not_requested', 'requested', 'in_progress', 'completed'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_asset_request_status
    ON public.provider_paystack_virtual_terminals(asset_request_status, asset_last_requested_at DESC)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_paystack_vt_provider_location_name_active
    ON public.provider_paystack_virtual_terminals(
        provider_id,
        COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
        name
    )
    WHERE deleted_at IS NULL;

UPDATE public.provider_paystack_virtual_terminals
SET
    asset_request_status = CASE
        WHEN asset_status = 'ready' THEN 'completed'
        WHEN asset_last_requested_at IS NOT NULL THEN 'requested'
        ELSE asset_request_status
    END,
    asset_request_completed_at = CASE
        WHEN asset_status = 'ready' THEN COALESCE(asset_completed_at, asset_request_completed_at)
        ELSE asset_request_completed_at
    END
WHERE asset_status = 'ready'
   OR asset_last_requested_at IS NOT NULL;

UPDATE public.provider_paystack_virtual_terminals
SET
    payment_link = REPLACE(payment_link, 'paystaack.shop', 'paystack.shop'),
    terminal_url = REPLACE(terminal_url, 'paystaack.shop', 'paystack.shop')
WHERE payment_link LIKE '%paystaack.shop%'
   OR terminal_url LIKE '%paystaack.shop%';
