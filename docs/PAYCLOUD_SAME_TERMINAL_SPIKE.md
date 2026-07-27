# PayCloud same-terminal Intent — hardware spike checklist

**Launch gate (July 2026 audit):** Production launch is **PayCloud Cloud Mode only**. Same-terminal native (`payment_paycloud_same_terminal`) stays **off** until this spike passes on physical hardware. Do not enable the flag for go-live based on code completeness alone.

Run on **every Wiseasy model you ship** (P5, P5 PRO, P5K, P5SE, P5L, P5L SSK, N6, T2, D5/D5 PRO, E1 Lite PRO, etc.) with **WiseCashier** installed before enabling `payment_paycloud_same_terminal`.

## Device support model

- Same-terminal uses **capability detection**, not a model allowlist: WiseCashier Intent (`com.wiseasy.transaction.call`) + device serial match (or manual pairing).
- Untested models automatically fall back to **Cloud Mode** — no code change required.
- Record each model in the matrix below; ops uses `paycloud_terminals.model` and payment metadata for diagnostics.

## Prerequisites

- Migration `772_paycloud_initiation_channel.sql` applied
- Sandbox merchant + terminal assigned (see [PAYCLOUD_SANDBOX_QA.md](./PAYCLOUD_SANDBOX_QA.md))
- Beautonomi provider APK on device (EAS `terminal` profile or dev client)
- `payment_paycloud` enabled; `payment_paycloud_same_terminal` **disabled** until spike sign-off
- Native module: `@beautonomi/paycloud-same-terminal` (`apps/provider/modules/paycloud-same-terminal`)

## Official Intent contract (implemented defaults)

Per [Same-terminal Application Integration](https://developers.paycloud.africa/docs/public/SameTerminalAppIntegration/):

| Field | Value |
|-------|--------|
| Action | `com.wiseasy.transaction.call` |
| Package | `com.wiseasy.cashier` (implicit via action resolution) |
| `version` | `A01` |
| `appId` | PayCloud payment app id |
| `transType` | `PRE-INIT`, `SALE`, `CASHBACK`, `REFUND` (string) |
| `transData` | JSON string: `businessOrderNo`, `paymentScenario` (`CARD`/`SCANQR`/`BSCANQR`), `amt` in **cents** (12-digit zero-padded), optional `tipAmount`, `cashAmount`, `notifyUrl`, `POSMode: "1"` |
| Result | `result` extra — `"00"` = approved; `resultMsg`; response `transData` JSON |

Override via **Admin → PayCloud → app metadata** only if a specific firmware build differs:

```json
{
  "intent_contract": {
    "package_name": "com.wiseasy.cashier",
    "action": "com.wiseasy.transaction.call"
  }
}
```

## Build and install provider APK

```bash
cd apps/provider
eas build --profile terminal --platform android
adb install -r beautonomi-provider-terminal.apk
```

## Per-device spike matrix

| Model | Build.MODEL | canLaunch | Serial source | Auto-match SN | PRE-INIT | SALE | Tip | CASHBACK | REFUND | Cancel K026 | Timeout | App-kill resume | UX (screen size) | Pass |
|-------|-------------|-----------|---------------|---------------|----------|------|-----|----------|--------|-------------|---------|-----------------|------------------|------|
| e.g. P5 | | | build_serial / wiseasy_property / android_id | Y/N | | | | | | | | | | |
| e.g. P5L | | | | | | | | | | | | | | |
| e.g. D5 | | | | | | | | | | | | | | |

## Spike steps (repeat per device row)

1. **Device identity** — Open **Card machines**; note This device panel (manufacturer, model, ID). If auto-match fails, use **Link this device** on the correct terminal row.
2. **Create payment** — `POST /api/provider/paycloud/payments` with `channel: "same_terminal"`, `device_serial`, `device_model`. Response must include `intent_payload` with `version: "A01"`, `transType`, nested `transData` — status stays `pending` (no cloud ecrorder).
3. **PRE-INIT** (optional) — First launch of the day; verify WiseCashier opens briefly and returns `result: "00"`.
4. **SALE** — Pay on this device → complete sandbox card in WiseCashier → confirm via `POST .../confirm` with intent result → `orderquery` shows `trans_status=2` → one `booking_payments` row, terminal `in_flight` cleared.
5. **Tip / CASHBACK** — Repeat with tip and cashback enabled in settings.
6. **REFUND/void** — Void a completed same-terminal payment where supported.
7. **Resume** — Kill provider app mid-payment, reopen sheet, **Resume payment** — settles without duplicate charge.
8. **Cancel** — Dismiss sheet mid-payment; `in_flight_payment_id` cleared; new charge gets fresh `businessOrderNo` (no M016).
9. **Form-factor UX** — Payment sheet and Card machines usable on this screen (portrait + landscape if applicable).

## Pass criteria

- All tested device rows marked Pass in the matrix
- `orderquery` returns nested `data.trans_status=2` for successful sales
- Ops + payments sign-off before enabling `payment_paycloud_same_terminal` for pilot tenant

## Fail criteria

- Intent sale not visible to Cloud `orderquery` → keep flag off; production stays Cloud Mode
- Wrong action/package → fix via metadata override first; update module defaults only after hardware confirmation

## Cloud-only launch (no spike required)

| Flow | Launch status |
|------|----------------|
| PayCloud Cloud Mode (`channel: "cloud"`) | **In scope** — ECR order + webhook/poll settle |
| Same-terminal Intent on device | **Out of scope** until matrix pass for your fleet |
| Provider UI copy | “Pay on this device” / “Send to card machine” |

## Rollout after matrix pass

1. Enable platform flag for pilot tenant only (via admin feature flags UI or `platform_config`).
2. Set `payment_paycloud_same_terminal` = enabled for that tenant.
3. Monitor `paycloud_webhook_events` and `provider_paycloud_payments` for 48h before broader rollout.
4. Any new/untested model: no code change — Cloud Mode fallback applies automatically until spiked.

## Implementation map

- Intent contract (server): `apps/web/src/lib/payments/paycloud-intent-contract.ts`
- Native module: `apps/provider/modules/paycloud-same-terminal/`
- JS bridge: `apps/provider/src/lib/paycloud-same-terminal.ts`
- UI: `PayCloudPaymentSheet`, `card-machines.tsx`
- Settle path: webhook / poll / confirm → `reconcilePaycloudPayment` → `settlePaycloudPayment`
