# PayCloud In-Person Payments — Sandbox & QA

Facts aligned with [PayCloud Developer docs](https://developers.paycloud.africa/docs/) and Cloud Mode APIs.

## Official Cloud Mode APIs

| Function | Path | OpenAPI `method` |
|----------|------|------------------|
| [Create Order](https://developers.paycloud.africa/docs/addpay/CloudAPI/create-order/) | `POST /api/entry/ecrorder` | `wisehub.cloud.pay.order` |
| [Query Order](https://developers.paycloud.africa/docs/addpay/CloudAPI/query-order/) | `POST /api/entry/orderquery` | `order.query` |
| [Close Order](https://developers.paycloud.africa/docs/addpay/CloudAPI/close-order/) | `POST /api/entry/ecrclose` | `wisehub.cloud.pay.close` |
| [Notify](https://developers.paycloud.africa/docs/addpay/CloudAPI/transaction-result-notification/) | `POST {notify_url}` | — respond plain text `success` |

Auth: RSA2 `SHA256WithRSA` ([API Security](https://developers.paycloud.africa/docs/public/APISecurity/)). Request body is **flat JSON** (not Alipay `biz_content`). Timestamp = 13-digit Unix ms. Envelope `version` = `1.0`; create order also sends `api_version=2.0`.

Sandbox gateway root (official Test Integration doc): `https://addpay-open.wangtest.cn`  
Live default: `https://api.paycloud.africa`  
Override via `PAYCLOUD_API_BASE_SANDBOX` / `PAYCLOUD_API_BASE_LIVE` or `tenant_paycloud_apps.api_base_url`.

### Official sandbox test parameters ([Test integration](https://developers.paycloud.africa/docs/public/PayCloudTestIntegration))

| Field | Value |
|-------|-------|
| API endpoint | `https://addpay-open.wangtest.cn/api/entry` |
| `app_id` | `wz715fc0d10ee9d156` |
| `merchant_no` | `302100085224` |
| `store_no` | `4021000637` |

Enter these in **Admin → Integrations → PayCloud Card Machines** (sandbox environment). Use PayCloud's published RSA key pair from the test integration doc. **Never** copy test keys into production tenants.

### Required create-order fields (v1)

- `merchant_no`, `store_no`, `terminal_sn`
- `message_receiving_application=WISECASHIER`
- `pay_scenario=SWIPE_CARD` (card) or `BSCANQR_PAY` (+ `pay_method_id` for QR)
- `trans_type=1` (sale) or `11` (sale + cashback)
- `order_amount`, `price_currency`, `merchant_order_no`, `notify_url`
- Optional: `tip_amount`, `cashback_amount`, `expires=300`, `reject_trade_when_terminal_offline=true`

### `trans_status`

| Value | Meaning |
|-------|---------|
| 9 | Created — cancellable via `ecrclose` |
| 0 | Processing |
| 1 | Closed (order closed without capture) |
| 2 | Completed — settle |
| 3 | Cancelled |

Never mark paid unless `trans_status=2` (webhook, poll, confirm, and cron all require this). Poll via `orderquery` as backup to webhook.

## Terminal setup (Cloud Mode)

1. Superadmin configures `tenant_paycloud_apps` (sandbox/live `app_id`, RSA private key, gateway public key, API base) via **Admin → Integrations → PayCloud Card Machines**.
2. Register `paycloud_merchants` (`merchant_no`, `store_no`) for the tenant.
3. On device: WiseCashier → Settings → General → ECR Hub → **Cloud** mode ([Cloud Mode](https://developers.paycloud.africa/docs/public/CloudMode)).
4. Provider adds serial under **Settings → Sales → Card machines** or receives one from terminal shop fulfillment.

## Sandbox E2E checklist

| Scenario | Steps | Expected |
|----------|-------|----------|
| Card sale | Booking outstanding → Card machine → tap/insert | `provider_paycloud_payments.status=successful`, `booking_payments` with `payment_provider=paycloud`, `payment_method=card` |
| QR wallet | Enable QR flags + settings | `pay_scenario=BSCANQR_PAY` |
| Tip | Tip in dialog/sheet | `tip_amount` on order |
| Cashback | Enable cashback | `trans_type=11` |
| Poll recovery | Block webhook; poll GET `/payments/[id]` | Settles only when `trans_status=2` |
| Close | Cancel while `trans_status=9` | `ecrclose` clears in-flight |
| Void | Successful capture → Void on card machine | `trans_type=2` + `orig_merchant_order_no`; distinct from `ecrclose` |
| Add-on only | Single unpaid `additional_charge` → Card machine | RPC `record_walk_in_additional_charge_payment` only |
| Booking + add-ons | Booking collect when base paid but add-ons unpaid | Base skipped; add-ons settled via RPC |
| Product order | Walk-in order wallet remainder | `recordProductOrderPayment`; rejects `order_source=appointment` |
| Calendar checkout | PayCloud booking checkout | Skips `createSale`; honors receipt checkbox |
| Cron reconcile | Kill webhook; wait 15m | `GET /api/cron/sync-paycloud-payments` settles stuck rows |
| Receipt | Booking settle + `receipt_auto_send` on | Customer receipt email via `notifyReceiptSent` |
| Group | Group outstanding → one charge | Fan-out `booking_payments` per child + add-on RPC per child |
| Amount guard | Change booking mid-dialog | `AMOUNT_MISMATCH` |
| Dup / 113 | Double-tap charge | Returns existing `payment_id` with `reused: true` — client polls |
| House call | `location_id` null | Portable terminal preferred |
| Commerce bridge | PayCloud terminal order + serial | `paycloud_terminals.source=order` |

## Status truth

Beautonomi does **not** subscribe clients to PayCloud payment realtime (RLS is service-role only). Source of truth for in-flight charges:

1. HTTP poll `GET /api/provider/paycloud/payments/[id]` while the charge dialog/sheet is open
2. Webhook `POST /api/provider/paycloud/webhook` (primary)
3. Cron `GET /api/cron/sync-paycloud-payments` every 15 minutes (safety net)

## Go-live checklist

1. Apply migrations `770_paycloud_integration.sql`, `771_paycloud_terminal_products.sql`, and `772_paycloud_initiation_channel.sql`.
2. Superadmin: configure `tenant_paycloud_apps` (RSA keys, sandbox/live gateway roots).
3. Superadmin: register `paycloud_merchants` (`merchant_no`, `store_no`) per tenant — **required** on terminal assign.
4. Assign terminals to providers (Operations or Provider detail); device in **Cloud Mode** on WiseCashier.
5. Enable platform flag `payment_paycloud` + plan feature `paycloud_terminal`.
6. Provider: complete Card machines setup checklist → turn on **Accept in-person card payments**.
7. Sandbox E2E: run scenario matrix below.

## Superadmin scenario matrix

| Scenario | Steps | Expected |
|----------|-------|----------|
| Merchant CRUD | Integrations → PayCloud → Merchants panel | Merchant rows with merchant_no / store_no |
| Credential test | Test sandbox credentials | Gateway reachable (order-not-found OK) |
| Terminal assign | Operations assign form or Provider detail assign | Terminal `assigned`, merchant linked |
| Provider readiness | Provider detail PayCloud panel | Traffic-light blockers match provider view |
| Force-settle | Provider detail recent payment with mismatch | `booking_payments` row when trans_status=2 |
| Run reconcile | Integration or Operations → Run reconcile now | Pending payments polled in last 24h |

## Provider scenario matrix

| Context | Web | Mobile | Intelligence |
|---------|-----|--------|--------------|
| Setup checklist | Card machines page | Card machines tab | Blockers + progress steps |
| Booking outstanding | Collect | Collect | Amount = outstanding incl. add-ons |
| Base paid, add-ons due | Collect | Same | Add-on-only amount |
| Single additional charge | Per-charge Card machine | Same | `entity_type=additional_charge` |
| Group booking | Group page | Group bookings | One charge; fan-out settle |
| Calendar / checkout | Sidebar + CheckoutDialog | Booking detail | Skip createSale if paycloudSettled |
| Front desk | PaymentActions | — | Same amount rules |
| New sale / Sales | Dialog / page | sales tab | Tip/cashback when on |
| Walk-in / product order | ecommerce pages | walk-in / orders | Rejects appointment-sourced orders |
| House call | Booking location null | Same | Portable preference + warning |
| No terminals / not accepted | Setup nudge | Setup nudge | Never dead-end |
| Duplicate tap | Resume in-flight | Resume | `reused: true` |
| After success void | Void on card machine | Same | Distinct from Cancel |
| Reconcile UX | Needs attention + Check status | Same | Plain language exceptions |

## Same-terminal Intent (P5/P5L — gated)

- Feature flag: `payment_paycloud_same_terminal` (off until hardware spike passes).
- Spike checklist: `docs/PAYCLOUD_SAME_TERMINAL_SPIKE.md`.
- Native module: `apps/provider/modules/paycloud-same-terminal` (Expo Android module → WiseCashier Intent).
- APIs: `channel: same_terminal` on create → `intent_payload` (includes `app_id` + optional `intent_contract` from `tenant_paycloud_apps.metadata`); `device_serial` optional for terminal_sn validation; `POST .../confirm` + poll after Intent.
- Close/cancel: same-terminal pending rows skip cloud `ecrclose` — local close clears `in_flight_payment_id`.
- Settle path unchanged: webhook / poll / confirm / cron → `settlePaycloudPayment`.
- UI copy: “Pay on this device” / “Send to card machine” — never “Intent” or “SDK”.
- EAS build for side-load: `eas build --profile terminal --platform android` (APK, arm64).

## Known deferrals (documented, not faked)

- **Refunds**: On terminal (CP limited); record in-app — no automated CP refund API in v1.
- **Offline**: No store-and-forward; retry or manual record after reconnect; never false "paid".
- **Recurring rental billing**: Single charge today.

## Finance contract

- `payment_method: "card"`, `payment_provider: "paycloud"`
- Excluded from platform payout balance (not in `PLATFORM_HELD_PAYMENT_PROVIDERS`)
- Included in gateway card capture dedupe in reports
- Ledger via DB triggers only

## Switching sandbox ↔ live (superadmin only)

Providers **cannot** toggle test vs live. Superadmin controls environment end-to-end:

1. **Credentials** — Admin → PayCloud Integration: save sandbox and/or live `tenant_paycloud_apps` rows (tenant row preferred; global row is fallback).
2. **Merchants** — Create or edit `paycloud_merchants` with matching `environment`. Optional `paycloud_app_id` must match merchant env.
3. **Assign terminals** — Link each machine to the correct merchant. Operations → Fleet → **Reassign** moves provider/merchant.
4. **Provider** — Enable **Accept in-person card payments**; use Cloud Mode on WiseCashier (`payment_paycloud_same_terminal` stays off).

Verify: sandbox R1 capture uses sandbox gateway; `provider_paycloud_payments.environment` matches merchant; webhook verifies via tenant→global key fallback; provider card-machines shows read-only **Test** / **Live** strip.

