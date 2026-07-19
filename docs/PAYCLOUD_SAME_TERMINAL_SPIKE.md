# PayCloud same-terminal Intent — hardware spike checklist

**Launch gate (July 2026 audit):** Production launch is **PayCloud Cloud Mode only**. Same-terminal native (`payment_paycloud_same_terminal`) stays **off** until this spike passes on physical hardware. Do not enable the flag for go-live based on code completeness alone.

Run on a **Wiseasy P5/P5L** with **WiseCashier** installed before enabling `payment_paycloud_same_terminal`.

## Prerequisites

- Migration `772_paycloud_initiation_channel.sql` applied
- Sandbox merchant + terminal assigned (see [PAYCLOUD_SANDBOX_QA.md](./PAYCLOUD_SANDBOX_QA.md) for test credentials)
- Beautonomi provider APK on device (EAS `terminal` profile or dev client)
- `payment_paycloud` enabled; `payment_paycloud_same_terminal` **disabled** in production until spike sign-off
- Native module built: `@beautonomi/paycloud-same-terminal` (`apps/provider/modules/paycloud-same-terminal`)

## Build and install provider APK on terminal

1. From repo root:
   ```bash
   cd apps/provider
   eas build --profile terminal --platform android
   ```
2. Download the APK from the EAS build page when complete.
3. Install on the P5/P5L:
   - **ADB:** `adb install -r beautonomi-provider-terminal.apk`
   - **MDM / Wiseasy app store:** deploy the same APK if your fleet uses device management.
4. Open the app, sign in as a provider with PayCloud enabled, and confirm **Card machines** shows your sandbox terminal.

The `terminal` EAS profile produces an **APK** (not AAB), **arm64**, suitable for side-loading on POS hardware without Google Play.

## Spike steps

1. **Intent contract** — From PayCloud [Same-terminal Application Integration](https://developers.paycloud.africa/docs/public/PosIntegratesOverview), record:
   - Intent action string
   - WiseCashier package name
   - Required extras (`merchant_order_no`, `order_amount`, `currency`, etc.)
   - Result extras / activity result codes
   - If defaults in the native module differ, set overrides in **Admin → PayCloud → sandbox app → metadata**:

   ```json
   {
     "intent_contract": {
       "package_name": "com.wiseasy.cashier",
       "action": "com.wiseasy.cashier.action.PAYMENT"
     }
   }
   ```

   No app release required when using metadata overrides.

2. **Create payment** — `POST /api/provider/paycloud/payments` with `channel: "same_terminal"` and optional `device_serial`. Verify response includes `intent_payload` (with `app_id`, `intent_contract`) and **no** `ecrorder` side effect (status stays `pending`).

3. **Launch WiseCashier** — In provider app: booking/sale → Card machine → **Pay on this device**. Complete sandbox card payment on WiseCashier.

4. **orderquery visibility** — Within 60s, `POST /api/provider/paycloud/payments/{id}/confirm` or cron reconcile must see `trans_status=2` for the same `merchant_order_no`.

5. **Settle** — One `booking_payments` row with `payment_provider=paycloud`; no duplicate on confirm retry.

6. **Resume** — Kill the provider app mid-payment, reopen the sheet, tap **Resume payment**; confirm settles without a duplicate charge.

7. **Cancel** — Start same-terminal payment, dismiss sheet; verify `in_flight_payment_id` cleared and a new charge can start.

## Pass criteria

- Steps 1–7 documented with screenshots/logs
- `orderquery` returns nested `data.trans_status=2` (parser in `paycloud-client.ts` handles this)
- Ops + payments sign-off recorded before enabling `payment_paycloud_same_terminal` in any production tenant

## Fail criteria

- Intent sale not visible to Cloud `orderquery` → keep flag off; production stays **Cloud Mode only** (current launch default)
- Intent action/package wrong → fix via `tenant_paycloud_apps.metadata.intent_contract` first; update module defaults only after confirmed on hardware

## Cloud-only launch (no spike required)

| Flow | Launch status |
|------|----------------|
| PayCloud Cloud Mode (`channel: "cloud"`) | **In scope** — ECR order + webhook/poll settle |
| Same-terminal Intent on device | **Out of scope** until spike passes |
| Provider UI copy | “Pay on this device” / “Send to card machine” — never “Intent” or “SDK” |

## Implementation notes

- Native module: `apps/provider/modules/paycloud-same-terminal/` (Expo module, Android-only)
- JS bridge: `apps/provider/src/lib/paycloud-same-terminal.ts`
- UI: `PayCloudPaymentSheet` — “Pay on this device” / “Send to card machine”
- Settle path unchanged: webhook / poll / confirm / cron → `settlePaycloudPayment`
