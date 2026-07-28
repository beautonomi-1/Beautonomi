-- Master platform/tenant gate for the provider manual card payment method ("Card — already taken").
--
-- Controls every provider-facing surface that lets a provider record a card payment
-- they already took on their own machine (not gateway-captured). When disabled the
-- option disappears everywhere; gateway captures (PayCloud, Yoco, Paystack, etc.)
-- are unaffected because they use payment_provider.
--
-- Default ENABLED: this is today's fallback on booking, group booking and sales screens.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'payment_manual_card',
    'Manual card (already taken)',
    'Show the "Card — already taken" option with helper "Record a card payment you took on your own machine." Disable to hide manual card recording on provider web/app while keeping card machine captures.',
    true,
    'payments'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'payment_manual_card'
      AND tenant_id IS NULL
);
