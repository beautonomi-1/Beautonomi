-- Customer emails: surface full pricing breakdown via HTML block + merge tags
-- already populated in apps/web/src/lib/notifications/notification-service.ts
-- (`pricing_breakdown_html`, subtotal, platform_fee, loyalty_discount, etc.).

-- receipt_sent (polished HTML from migration 542): inject breakdown after Total.
UPDATE public.notification_templates
SET
  email_body = REPLACE(
    email_body,
    '<p style="margin:6px 0 0;color:#111827;font-size:24px;font-weight:800;">{{total_amount}}</p>',
    '<p style="margin:6px 0 0;color:#111827;font-size:24px;font-weight:800;">{{total_amount}}</p>{{pricing_breakdown_html}}'
  ),
  variables = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(variables, ARRAY[]::TEXT[])
        || ARRAY[
          'pricing_breakdown_html',
          'subtotal',
          'tax_amount',
          'travel_fee',
          'platform_fee',
          'service_fee',
          'membership_discount',
          'membership_label',
          'loyalty_discount',
          'promotion_discount',
          'package_discount',
          'package_name',
          'tip_amount'
        ]::TEXT[]
      )
    )
  ),
  updated_at = NOW()
WHERE key = 'receipt_sent';

-- booking_confirmed (default HTML from migration 062): inject after Total line.
UPDATE public.notification_templates
SET
  email_body = REPLACE(
    email_body,
    '<p><strong>Total:</strong> {{total_amount}}</p>',
    '<p><strong>Total:</strong> {{total_amount}}</p>{{pricing_breakdown_html}}'
  ),
  variables = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(variables, ARRAY[]::TEXT[])
        || ARRAY[
          'pricing_breakdown_html',
          'subtotal',
          'tax_amount',
          'travel_fee',
          'platform_fee',
          'service_fee',
          'membership_discount',
          'membership_label',
          'loyalty_discount',
          'promotion_discount',
          'package_discount',
          'package_name',
          'tip_amount'
        ]::TEXT[]
      )
    )
  ),
  updated_at = NOW()
WHERE key = 'booking_confirmed';
