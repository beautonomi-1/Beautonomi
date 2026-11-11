-- Live order alerts subscribe to product_orders with the staff member's own
-- session. REPLICA IDENTITY FULL published every column, including the
-- customer's email and phone, on that websocket frame. The alert only reads
-- the order id, number, status, payment status, source, and customer name.
--
-- Replica identity moves to (id, payment_status), which are both NOT NULL, so
-- an UPDATE still includes the previous payment status. The publication then
-- lists every other operational column and omits customer_email and
-- customer_phone. A later column added to product_orders is not published
-- until this list is extended.

CREATE UNIQUE INDEX IF NOT EXISTS product_orders_realtime_identity
  ON public.product_orders (id, payment_status);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'product_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.product_orders;
    END IF;

    ALTER TABLE public.product_orders
      REPLICA IDENTITY USING INDEX product_orders_realtime_identity;

    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_orders (
      id,
      order_number,
      customer_id,
      provider_id,
      status,
      fulfillment_type,
      delivery_address_id,
      delivery_instructions,
      tracking_number,
      estimated_delivery_date,
      collection_location_id,
      subtotal,
      tax_amount,
      delivery_fee,
      discount_amount,
      total_amount,
      currency,
      payment_status,
      payment_method,
      payment_provider_id,
      confirmed_at,
      shipped_at,
      delivered_at,
      cancelled_at,
      cancellation_reason,
      created_at,
      updated_at,
      platform_fee,
      order_source,
      payment_reference,
      paid_at,
      staff_id,
      customer_name,
      wallet_amount,
      tenant_id,
      carrier,
      tracking_url,
      booking_id,
      delivery_fee_type,
      delivery_distance_km,
      refund_method,
      refunded_amount,
      refunded_at,
      refund_reason,
      refund_customer_confirmation_required,
      refund_customer_confirmed_at,
      refund_customer_disputed_at,
      refund_confirmation_deadline_at,
      legacy_sale_id,
      shipping_booking_status,
      shipping_booking_detail,
      courier_shipment_id,
      courier_label_url,
      courier_charged_amount,
      courier_charged_weight_kg,
      tax_inclusive,
      provider_vat_number_snapshot,
      delivery_address_snapshot,
      payment_attempt_note,
      promotion_id,
      promotion_code,
      promotion_discount_amount,
      gift_card_id,
      gift_card_amount,
      partially_shipped_notified_at
    );
  END IF;
END $$;
