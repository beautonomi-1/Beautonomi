-- Attribute gift cards and purchase orders to a market for admin scoping (NN-8).

ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_gift_cards_tenant_id ON public.gift_cards (tenant_id);

ALTER TABLE public.gift_card_orders
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_gift_card_orders_tenant_id ON public.gift_card_orders (tenant_id);

-- Orders sold under a provider inherit that provider's tenant
UPDATE public.gift_card_orders gco
SET tenant_id = p.tenant_id
FROM public.providers p
WHERE gco.provider_id = p.id
  AND gco.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- Platform / legacy orders: default market
UPDATE public.gift_card_orders gco
SET tenant_id = t.id
FROM public.tenants t
WHERE gco.tenant_id IS NULL
  AND t.slug = 'za';

-- Issued cards: tenant from their paid order row
UPDATE public.gift_cards gc
SET tenant_id = sub.tenant_id
FROM (
  SELECT DISTINCT ON (gco.gift_card_id)
    gco.gift_card_id,
    gco.tenant_id
  FROM public.gift_card_orders gco
  WHERE gco.gift_card_id IS NOT NULL
    AND gco.status = 'paid'
    AND gco.tenant_id IS NOT NULL
  ORDER BY gco.gift_card_id, gco.created_at DESC
) sub
WHERE gc.id = sub.gift_card_id
  AND gc.tenant_id IS NULL;

-- Cards linked from bookings (e.g. missing order linkage)
UPDATE public.gift_cards gc
SET tenant_id = sub.tenant_id
FROM (
  SELECT DISTINCT ON (b.gift_card_id)
    b.gift_card_id,
    b.tenant_id
  FROM public.bookings b
  WHERE b.gift_card_id IS NOT NULL
    AND b.tenant_id IS NOT NULL
  ORDER BY b.gift_card_id, b.updated_at DESC NULLS LAST, b.created_at DESC
) sub
WHERE gc.id = sub.gift_card_id
  AND gc.tenant_id IS NULL;
