# PayCloud same-terminal Intent — hardware spike checklist

Run on a **Wiseasy P5/P5L** with **WiseCashier** installed before enabling `payment_paycloud_same_terminal`.

## Prerequisites

- Migration `772_paycloud_initiation_channel.sql` applied
- Sandbox merchant + terminal assigned
- Beautonomi provider APK on device (dev client or release)

## Spike steps

1. **Intent contract** — From PayCloud [Same-terminal Application Integration](https://developers.paycloud.africa/docs/public/PosIntegratesOverview), record:
   - Intent action string
   - Required extras (`merchant_order_no`, `order_amount`, `currency`, etc.)
   - Result extras / activity result codes

2. **Create payment** — `POST /api/provider/paycloud/payments` with `channel: "same_terminal"`. Verify response includes `intent_payload` and **no** `ecrorder` side effect (status stays `pending`).

3. **Launch WiseCashier** — Fire Intent from provider app with payload; complete sandbox card payment.

4. **orderquery visibility** — Within 60s, `POST /api/provider/paycloud/payments/{id}/confirm` or cron reconcile must see `trans_status=2` for the same `merchant_order_no`.

5. **Settle** — One `booking_payments` row with `payment_provider=paycloud`; no duplicate on confirm retry.

## Pass criteria

- Steps 1–5 documented with screenshots/logs
- `orderquery` returns nested `data.trans_status=2` (parser in `paycloud-client.ts` handles this)

## Fail criteria

- Intent sale not visible to Cloud `orderquery` → keep flag off; production stays **Cloud Mode only**

## Implementation notes

- Native module: `apps/provider/modules/paycloud-same-terminal/` (Expo config plugin)
- UI copy: “Pay on this device” / “Send to card machine” — never “Intent” or “SDK”
- Settle path unchanged: webhook / poll / confirm / cron → `settlePaycloudPayment`
