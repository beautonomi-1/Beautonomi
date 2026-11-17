-- A table-level SELECT grant lets any active tenant role read
-- gift_card_orders.recipient_email and recipient_phone. A scheduled send
-- keeps that address in metadata until delivery, so the same session could
-- read it there. Drop the table read for anon and authenticated, then grant
-- every other column except those two and metadata. INSERT and UPDATE stay,
-- so a buyer can still store a recipient. The webhook and the delivery job
-- keep the original table read.

REVOKE SELECT ON TABLE public.gift_card_orders FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  purchaser_user_id,
  provider_id,
  amount,
  currency,
  status,
  paystack_reference,
  gift_card_id,
  created_at,
  updated_at,
  tenant_id,
  quantity,
  total_amount,
  deliver_at,
  delivery_channel,
  delivered_at,
  refunded_at
) ON TABLE public.gift_card_orders TO anon, authenticated;
