-- Master platform/tenant gate for the provider booking "payment link" method.
--
-- Controls every provider-facing payment-link surface: the "Payment Link" booking
-- method option, the "Send payment link" actions on bookings/group bookings/front
-- desk, the auto-send on booking + recurring create, and the customer
-- /bookings/:id/pay entry page. When disabled the method disappears everywhere,
-- mirroring how `payment_yoco` gates Yoco.
--
-- Default DISABLED: the method stays hidden until an admin turns it on in the
-- Feature Flags page. `platforms_allowed` is left NULL (all platforms) so it gates
-- the provider apps and the customer-facing web pay page together.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'payment_link',
    'Booking payment link',
    'Enable the provider booking payment link method (send a Paystack checkout link for a booking). Disable to hide the Payment Link option and the Send payment link actions everywhere on provider web/app and the customer pay page.',
    false,
    'payments'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'payment_link'
      AND tenant_id IS NULL
);
