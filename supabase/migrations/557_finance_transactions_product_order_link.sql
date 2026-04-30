-- Link ecommerce ledger rows back to product_orders so provider finance reports
-- can filter platform-held product earnings by collection location.

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS product_order_id UUID REFERENCES public.product_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_product_order_id
  ON public.finance_transactions(product_order_id);

UPDATE public.finance_transactions ft
SET product_order_id = po.id
FROM public.product_orders po
WHERE ft.product_order_id IS NULL
  AND ft.booking_id IS NULL
  AND ft.provider_id = po.provider_id
  AND ft.transaction_type IN ('payment', 'provider_earnings', 'platform_fee')
  AND (
    ft.description ILIKE '%' || po.order_number || '%'
    OR ft.description ILIKE '%' || po.id::text || '%'
  );
