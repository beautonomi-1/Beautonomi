-- Backfill missing ledger/payment rows for already-paid on-platform product orders.
-- Scope: paystack + wallet orders only (cash/card_on_delivery remain off-platform collection flows).

with eligible_orders as (
  select
    po.id,
    po.tenant_id,
    po.provider_id,
    po.order_number,
    coalesce(po.total_amount, 0)::numeric as total_amount,
    coalesce(po.platform_fee, 0)::numeric as platform_fee,
    coalesce(po.paid_at, po.updated_at, po.created_at, now()) as effective_paid_at
  from public.product_orders po
  where po.payment_status = 'paid'
    and po.payment_method in ('paystack', 'wallet')
),
missing_payment_tx as (
  select eo.*
  from eligible_orders eo
  where not exists (
    select 1
    from public.payment_transactions pt
    where (pt.metadata ->> 'product_order_id') = eo.id::text
      and pt.status = 'success'
  )
),
ins_payment as (
  insert into public.payment_transactions (
    booking_id,
    reference,
    amount,
    fees,
    net_amount,
    status,
    provider,
    transaction_type,
    metadata,
    created_at
  )
  select
    null,
    'backfill_product_order_' || m.id::text,
    m.total_amount,
    0,
    m.total_amount,
    'success',
    'system_backfill',
    'charge',
    jsonb_build_object(
      'kind', 'product_order',
      'product_order_id', m.id::text,
      'source', 'migration_419_backfill'
    ),
    m.effective_paid_at
  from missing_payment_tx m
),
missing_payment_ledger as (
  select eo.*
  from eligible_orders eo
  where not exists (
    select 1
    from public.finance_transactions ft
    where ft.provider_id = eo.provider_id
      and ft.transaction_type = 'payment'
      and ft.description ilike ('%product order ' || eo.order_number || '%')
  )
)
insert into public.finance_transactions (
  booking_id,
  provider_id,
  tenant_id,
  transaction_type,
  amount,
  fees,
  commission,
  net,
  description,
  created_at
)
select
  null,
  m.provider_id,
  m.tenant_id,
  t.transaction_type,
  t.amount,
  t.fees,
  t.commission,
  t.net,
  t.description,
  m.effective_paid_at
from missing_payment_ledger m
cross join lateral (
  values
    (
      'payment'::text,
      greatest(0, m.total_amount - m.platform_fee),
      0::numeric,
      m.platform_fee,
      m.platform_fee,
      'Product order payment ' || m.order_number
    ),
    (
      'provider_earnings'::text,
      greatest(0, m.total_amount - m.platform_fee),
      0::numeric,
      0::numeric,
      greatest(0, m.total_amount - m.platform_fee),
      'Provider earnings from product order ' || m.order_number
    ),
    (
      'platform_fee'::text,
      m.platform_fee,
      0::numeric,
      0::numeric,
      m.platform_fee,
      'Platform fee from product order ' || m.order_number
    )
) as t(transaction_type, amount, fees, commission, net, description);

