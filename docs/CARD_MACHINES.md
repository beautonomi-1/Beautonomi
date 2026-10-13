# Card machines (Yoco + Beautonomi / PayCloud)

## Connection models

| Provider | How providers connect |
|----------|------------------------|
| **Yoco** | OAuth (`yoco_oauth_v2`) for Web POS devices; optional Checkout API keys for hosted/QR only |
| **Beautonomi card machine (PayCloud)** | Admin merchant + RSA in `tenant_paycloud_apps`; provider registers terminal **serial** and enables accept |

## Settings (web)

- Hub: `/provider/settings/sales/card-machines`
- Yoco: `/provider/settings/sales/card-machines/yoco` → OAuth + devices
- PayCloud: `/provider/settings/sales/card-machines/beautonomi` → terminal fleet

## Checkout

- Unified API: `GET /api/provider/card-machines`
- Defaults: `PUT /api/provider/card-machines/defaults`
- Web UI wrapper: `CardMachineCollectDialog` (Yoco + PayCloud) on checkout, booking collect, front desk, sales, ecommerce walk-in, booking walk-in sheet, product orders, group bookings, additional charges
- Mobile: `CardMachineCollectSheet` on booking detail (incl. additional charges), unified POS sales, walk-in product sales, product orders, group bookings (defaults via `GET /api/provider/card-machines`)
- Walk-in product sales: `POST /api/provider/product-sales` with `payment_method: "card_machine"` creates a **pending** order (no stock/ledger), the machine charge settles it, then `finalize_walk_in_order_id` completes delivery. Never send `"card"` for this — that records a paid sale immediately.
- Web report: `/provider/reports/payments/card-machine-reconciliation` (API + mobile catalog)
- Yoco payments settle on **webhook** and on **GET** `/api/provider/yoco/payments/[id]` poll (idempotent)
- In-flight resume: `POST /api/provider/yoco/payments` returns a pending charge (< 15 min) for the same entity + amount instead of sending a second one (`resumed: true`); declined attempts start fresh; a now-successful one is settled.
- Walk-in retries reuse the pending order: finalize first, reopen the machine only on `PAYMENT_NOT_SETTLED`. Abandoned pending walk-in orders are cancelled after 24h by `cron/expire-pending-payment-orders`.

## Feature flags

- `payment_yoco`, `yoco_oauth_v2`
- `payment_paycloud`, `payment_paycloud_qr`, `payment_paycloud_cashback`, `payment_paycloud_same_terminal`
- `payment_manual_card` — record-only “card already taken”

## Refunds

- **PayCloud:** API refund to terminal (`refund_method: original`)
- **Yoco Web POS:** refund on Yoco app/machine, then `record_only` on booking refund (`YOCO_REFUND_ON_MACHINE`). Returned whenever `refund_method: original` targets a Yoco-paid booking; web and mobile refund dialogs show a "refund on machine, then record" step.
- **Yoco obligations (migration `997`):** when staff choose back to card (cancel `refund_rail: terminal` with Yoco, or a manual `original` refund), the platform inserts a **pending** `booking_refunds` row with `machine_refund_provider = yoco`. It counts toward the in-person refund cap but does not post ledger or change `payment_status` until completed. Staff complete it with `record_only`; Yoco refund webhooks link to or close the same row to avoid double booking. Open rows appear on booking detail (banner + record CTA) and in card-machine reconciliation (`awaiting_refunds`).
- Web + mobile cancel dialogs offer "Wallet credit / Back to card" when money was collected and a card machine is enabled; group participant refund sheets offer "Back to card" with the same Yoco record step.
- **Provider cancel with `refund_rail: "terminal"`:** PayCloud portion is reversed via API; a Yoco portion is held back from wallet credit and returned as `card_machine_refund_due { provider: "yoco", action_required: true }` on the PATCH response.

## End-to-end flow (booking, web)

1. **Setup:** Provider registers PayCloud serial or connects Yoco OAuth and adds devices (`/provider/settings/sales/card-machines`, `/card-machines/yoco`).
2. **Optional defaults:** Owner saves default machine via `PUT /api/provider/card-machines/defaults` (requires migration `995`).
3. **Collect:** Booking sheet → **Card machine** → `CardMachineCollectDialog` loads `GET /api/provider/card-machines`, applies location/global default + `selectDefaultMachine`, opens Yoco or PayCloud dialog.
4. **Charge:** `POST /api/provider/yoco/payments` or PayCloud create with stable `client_reference` / merchant order id tied to entity.
5. **Settle:** Web POS: poll `GET /api/provider/yoco/payments/[id]` **or** Yoco webhook → `applyYocoSuccessfulSettlement` → `booking_payments` / sale / product order. PayCloud: webhook or poll → `settlePaycloudPayment`.
6. **Reports:** `GET /api/provider/reports/payments/card-machine-reconciliation` (combined exceptions).

## Automated checks

- Unit: `yoco-webhook-verify`, `yoco-apply-successful-settlement`, `yoco-payments-client-reference`, `card-machines` route test.
- Playwright smoke: `apps/web/e2e/card-machines-api.spec.ts` (auth + webhook rejection + flags).

## Troubleshooting

- Booking shows paid but no tender: check Yoco webhook signature logs; poll payment detail to force settle
- PayCloud stuck in flight: reconcile from card-machines settings or `POST /api/provider/paycloud/payments/reconcile`
