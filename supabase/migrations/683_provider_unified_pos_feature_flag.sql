-- Gate unified provider POS checkout surfaces (Sell/POS quick actions, Sales nav).
-- Default DISABLED: bookings cover service + product appointments; walk-in retail covers product-only sales.
-- Booking card capture still posts to `/api/provider/sales` when this flag is off.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'provider.unified_pos_checkout',
    'Provider unified POS checkout',
    'Show the unified Sell/POS checkout (services and products without a calendar booking). When disabled, hide Sell/POS entry points; staff use walk-in bookings for services and Retail Product sale for product-only checkout.',
    false,
    'commerce'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'provider.unified_pos_checkout'
      AND tenant_id IS NULL
);
