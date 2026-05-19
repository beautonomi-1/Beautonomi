-- 611_yoco_oauth_v2_feature_flag.sql
--
-- §Yoco-OAuth 2026-05: Gate the new Web POS OAuth UI behind a feature flag so we
-- can dogfood internally before flipping it on for all tenants. When the flag is
-- OFF, the "Connect Yoco" OAuth button is hidden in the web + mobile UI and the
-- existing dashboard-key paste path is the only visible option (it still works
-- for hosted-checkout links).
--
-- The corresponding backfill (existing enabled integrations with secret_key →
-- credential_mode='checkout') already lives in 610 so providers don't lose the
-- ability to take checkout payments while they wait to reconnect via OAuth.

-- Seed the global flag row (OFF). Migration 348 dropped the global UNIQUE
-- constraint on (feature_key) in favour of partial unique indexes, so a plain
-- ON CONFLICT (feature_key) DO NOTHING no longer works. Insert only if absent.
INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'yoco_oauth_v2',
    'Yoco OAuth Web POS (v2)',
    'Surface the new Connect Yoco (OAuth) flow that enables real Web POS card terminals. When off, only the legacy Checkout API key paste flow is visible.',
    false,
    'payments'
WHERE NOT EXISTS (
    SELECT 1 FROM public.feature_flags
    WHERE feature_key = 'yoco_oauth_v2' AND tenant_id IS NULL
);

-- Allow providers to dismiss the "reconnect for terminals" banner so the UI
-- doesn't keep nagging them when they're intentionally staying on hosted
-- checkout. The OAuth credential_mode 'oauth' path ignores this column.
ALTER TABLE public.provider_yoco_integrations
    ADD COLUMN IF NOT EXISTS reconnect_banner_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.provider_yoco_integrations.reconnect_banner_dismissed_at IS
    'When non-null, the "reconnect Yoco for terminals" banner is suppressed for this provider. Cleared when credential_mode transitions back from oauth to checkout.';
