-- Online checkout hold: snapshot buyer contact, delivery address, payment attempt notes,
-- and refresh product_order_payment_failed copy for retryable declines.

ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS payment_attempt_note TEXT;

COMMENT ON COLUMN public.product_orders.customer_email IS
  'Snapshot of buyer email at checkout (online orders); avoids provider RLS on users.';
COMMENT ON COLUMN public.product_orders.delivery_address_snapshot IS
  'Copy of delivery address at checkout when delivery_address_id is set.';
COMMENT ON COLUMN public.product_orders.payment_attempt_note IS
  'Last Paystack decline message while order remains an unpaid online hold.';

-- Backfill contact snapshots where empty (do not overwrite walk-in names).
UPDATE public.product_orders po
SET
  customer_name = COALESCE(NULLIF(TRIM(po.customer_name), ''), u.full_name),
  customer_email = COALESCE(NULLIF(TRIM(po.customer_email), ''), u.email),
  customer_phone = COALESCE(NULLIF(TRIM(po.customer_phone), ''), u.phone)
FROM public.users u
WHERE po.customer_id = u.id
  AND (
    NULLIF(TRIM(po.customer_name), '') IS NULL
    OR NULLIF(TRIM(po.customer_email), '') IS NULL
    OR NULLIF(TRIM(po.customer_phone), '') IS NULL
  );

UPDATE public.product_orders po
SET delivery_address_snapshot = jsonb_build_object(
  'label', ua.label,
  'address_line1', ua.address_line1,
  'address_line2', ua.address_line2,
  'city', ua.city,
  'state', ua.state,
  'postal_code', ua.postal_code,
  'country', ua.country,
  'latitude', ua.latitude,
  'longitude', ua.longitude,
  'apartment_unit', ua.apartment_unit,
  'building_name', ua.building_name,
  'floor_number', ua.floor_number,
  'parking_instructions', ua.parking_instructions,
  'location_landmarks', ua.location_landmarks
)
FROM public.user_addresses ua
WHERE po.delivery_address_id = ua.id
  AND po.delivery_address_snapshot IS NULL;

INSERT INTO public.notification_templates (
  tenant_id,
  key,
  title,
  body,
  channels,
  email_subject,
  email_body,
  variables,
  url,
  enabled,
  description
)
VALUES
  (
    NULL,
    'product_order_payment_pending',
    'Complete your order payment',
    'Order {{order_number}} is waiting for payment. Open the app to pay before your items are released.',
    ARRAY['push', 'email']::TEXT[],
    'Complete payment — {{order_number}}',
    '<h2>Payment pending</h2><p>Your order <strong>{{order_number}}</strong> is reserved. Complete payment from My Orders before it expires. Any wallet or gift amount already applied stays on this order.</p><p><a href="/account-settings/orders/{{order_id}}">View order</a></p>',
    ARRAY['order_number', 'order_id', 'total_amount']::TEXT[],
    '/account-settings/orders/{{order_id}}',
    true,
    'Sent when an online product order is created and Paystack payment is still pending'
  )
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = COALESCE(EXCLUDED.email_subject, notification_templates.email_subject),
  email_body = COALESCE(EXCLUDED.email_body, notification_templates.email_body),
  variables = EXCLUDED.variables,
  url = COALESCE(EXCLUDED.url, notification_templates.url),
  enabled = true,
  description = EXCLUDED.description,
  updated_at = NOW();

UPDATE public.notification_templates
SET
  body = 'Your payment for order {{order_number}} did not go through. Open My Orders to try again before the order expires.',
  email_body = '<h2>Payment failed</h2><p>We could not charge your card for order <strong>{{order_number}}</strong>. Your order is still payable from My Orders until it expires. Any wallet or gift amount applied stays on this order.</p><p><a href="/account-settings/orders/{{order_id}}">View order</a></p>',
  url = '/account-settings/orders/{{order_id}}',
  description = 'Sent when Paystack charge.failed for a pending online product order (order remains payable until TTL)',
  updated_at = NOW()
WHERE key = 'product_order_payment_failed'
  AND tenant_id IS NULL;
