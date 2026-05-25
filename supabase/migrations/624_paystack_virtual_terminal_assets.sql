-- Paystack Virtual Terminal asset completion and identity metadata.
--
-- Adds Superadmin-managed fields for the practical Paystack dashboard workflow:
-- payment links, printable posters, QR images, WhatsApp destinations, and
-- searchable provider/store identity snapshots.

ALTER TABLE public.provider_paystack_virtual_terminals
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS business_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS paystack_domain TEXT,
    ADD COLUMN IF NOT EXISTS payment_link TEXT,
    ADD COLUMN IF NOT EXISTS poster_url TEXT,
    ADD COLUMN IF NOT EXISTS poster_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS poster_uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS poster_uploaded_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS asset_status TEXT NOT NULL DEFAULT 'missing_assets',
    ADD COLUMN IF NOT EXISTS asset_notes TEXT,
    ADD COLUMN IF NOT EXISTS asset_completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS asset_completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS asset_last_requested_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS asset_last_requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notification_whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS notification_whatsapp_label TEXT,
    ADD COLUMN IF NOT EXISTS destination_status TEXT NOT NULL DEFAULT 'not_configured',
    ADD COLUMN IF NOT EXISTS identity_status TEXT NOT NULL DEFAULT 'needs_review',
    ADD COLUMN IF NOT EXISTS paystack_dashboard_url TEXT,
    ADD COLUMN IF NOT EXISTS synced_from_paystack_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS sync_match_confidence NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS sync_match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    ALTER TABLE public.provider_paystack_virtual_terminals
        ADD CONSTRAINT provider_paystack_vt_asset_status_check
        CHECK (asset_status IN ('missing_assets', 'link_ready', 'poster_ready', 'ready'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE public.provider_paystack_virtual_terminals
        ADD CONSTRAINT provider_paystack_vt_destination_status_check
        CHECK (destination_status IN ('not_configured', 'configured', 'sync_error', 'disabled'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE public.provider_paystack_virtual_terminals
        ADD CONSTRAINT provider_paystack_vt_identity_status_check
        CHECK (identity_status IN ('needs_review', 'verified', 'manual_override'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_asset_status
    ON public.provider_paystack_virtual_terminals(asset_status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_destination_status
    ON public.provider_paystack_virtual_terminals(destination_status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_identity_status
    ON public.provider_paystack_virtual_terminals(identity_status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provider_paystack_vt_payment_link_missing
    ON public.provider_paystack_virtual_terminals(provider_id, created_at DESC)
    WHERE deleted_at IS NULL
      AND COALESCE(payment_link, terminal_url) IS NULL;

UPDATE public.provider_paystack_virtual_terminals
SET
    display_name = COALESCE(display_name, name),
    payment_link = COALESCE(payment_link, terminal_url),
    paystack_domain = COALESCE(paystack_domain, metadata->>'domain'),
    asset_status = CASE
        WHEN COALESCE(payment_link, terminal_url) IS NOT NULL
         AND (poster_url IS NOT NULL OR qr_url IS NOT NULL) THEN 'ready'
        WHEN COALESCE(payment_link, terminal_url) IS NOT NULL THEN 'link_ready'
        WHEN poster_url IS NOT NULL OR qr_url IS NOT NULL THEN 'poster_ready'
        ELSE 'missing_assets'
    END,
    asset_completed_at = CASE
        WHEN COALESCE(payment_link, terminal_url) IS NOT NULL
         AND (poster_url IS NOT NULL OR qr_url IS NOT NULL)
        THEN COALESCE(asset_completed_at, NOW())
        ELSE asset_completed_at
    END,
    destination_status = CASE
        WHEN jsonb_array_length(COALESCE(destinations, '[]'::jsonb)) > 0 THEN 'configured'
        ELSE destination_status
    END
WHERE display_name IS NULL
   OR payment_link IS NULL
   OR paystack_domain IS NULL
   OR asset_status = 'missing_assets'
   OR destination_status = 'not_configured';
