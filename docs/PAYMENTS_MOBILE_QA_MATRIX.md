# Mobile Paystack — manual QA matrix

**Pair with**: [`PAYMENTS_MOBILE_COMPLIANCE.md`](./PAYMENTS_MOBILE_COMPLIANCE.md)
**Owner**: QA lead
**Last updated**: 2026-05-17

Automated tests (Jest unit suites in both apps) already cover the `verifyPaystackWithRetry` helper across success / pending / failed / network-error / empty-reference paths. This document is the **device-level matrix** that must be run before any mobile release that touches payments.

---

## Test environment

| Item | Required |
|---|---|
| Paystack test mode | Yes — use `pk_test_*` / `sk_test_*` keys. |
| Test card (success) | `4084 0840 8408 4081` (Verve) or `5060 6666 6666 6666 666` (Verve) — see Paystack docs. |
| Test card (decline) | `4111 1111 1111 1112` |
| Test card (3DS required) | `4084 0840 8408 4081`, OTP `123456` |
| Network throttling | Use Charles / iOS Network Link Conditioner / Android Studio CPU throttling to simulate slow webhook (>10s). |
| Webhook delay simulation | Pause the Paystack webhook with a stoppable ngrok or temporarily disable the webhook route in dev to force "pending" outcomes. |
| Devices | At minimum one physical iOS (iPhone, iOS 17+) and one physical Android (Android 13+). Emulators acceptable for smoke. |

---

## Matrix

For each flow, run all **6 scenarios** on **2 platforms** (iOS + Android). Each row should produce the documented outcome.

| # | Customer flow | Initiator screen | Cold-start return screen |
|---|---|---|---|
| C1 | Booking checkout (new card) | `book-checkout.tsx` | `book/paystack.tsx` |
| C2 | Booking detail (pay later) | `booking-detail.tsx` → `usePaystackPayment` | `book/paystack.tsx` |
| C3 | Product checkout | `(tabs)/shop/product-checkout.tsx` | `shop/paystack.tsx` |
| C4 | Product order detail (retry pay) | `product-order-detail.tsx` | `shop/paystack.tsx` |
| C5 | Gift card purchase (new card) | `gift-card-purchase.tsx` | `paystack-callback.tsx` |
| C6 | Gift card purchase (saved card) | `gift-card-purchase.tsx` | n/a (no redirect) |
| C7 | Wallet top-up | `account-settings/wallet.tsx` | `paystack-callback.tsx` |
| C8 | Saved-card add (`/account-settings/payments`) | `account-settings/payments.tsx` | `paystack-callback.tsx` |
| C9 | Custom-offer checkout | `custom-offer-checkout.tsx` | `custom-offer-paystack.tsx` |
| C10 | Membership purchase | `partner-profile.tsx` → "Become a member" | `membership-paystack.tsx` |
| P1 | Provider subscription | `more/settings/subscription.tsx` | `more/settings/subscription-payment-return.tsx` |
| P2 | Provider ad spend | `more/settings/ads.tsx` | `more/settings/ads-payment-return.tsx` |

| Scenario | Expected outcome |
|---|---|
| **S1 happy path** — use success test card, normal network, app foreground throughout. | Branded success card / overlay shows. Domain state updates within ~3 seconds (booking marked paid, order paid, membership activated, subscription updated, ad activated). No "Payment Not Confirmed" toast. |
| **S2 declined card** — use decline test card. | Paystack page itself shows decline; mobile lands on cold-start return screen, verify resolves `failed`, branded "Payment could not be confirmed" card appears, app routes back to source screen after ~2s. No phantom domain mutation. |
| **S3 cancel** — open Paystack, then tap Cancel / browser back. | Cold-start return screen detects `cancelled=1` (or `payment_cancelled=1` for provider), branded "Payment cancelled" card appears, routes back to source within ~800ms. No verify call fires. |
| **S4 cold-start during 3DS** — open Paystack, trigger 3DS, force-kill the app while OTP is on screen, then re-open the app from the deep link. | App resumes on the cold-start return screen (`book/paystack.tsx`, `paystack-callback.tsx`, etc.). `verifyPaystackWithRetry` runs and resolves `success`. Domain state updates. |
| **S5 slow webhook** — paste a known successful test reference but force the webhook to be delayed >10s (throttle network / pause ngrok). | `verifyPaystackWithRetry` returns `pending` after 5 attempts. Branded "Your payment is being confirmed" card appears. App routes to fallback tab. Within ~30s after webhook lands, domain state updates and a subsequent visit to the order/booking shows it paid. |
| **S6 Instagram in-app browser hand-off** — share a partner-profile link to Instagram on a real device; open the link inside Instagram's WebView; tap "Book"; complete payment; observe whether the app handle-off works. | Either the OS opens the app at the correct deep link (success path → S1) **or** Paystack stays in the system browser and we route back via universal link (success path → S4-like). No infinite loop, no lost session. |

---

## Acceptance criteria

A release is **payment-ready** only when:

- All flows in the matrix pass S1, S2, S3 on both iOS and Android.
- C1, C3, C5, C7, C9, C10, P1, P2 pass S4 (cold-start) on both iOS and Android.
- At least three flows pass S5 (slow webhook) on both iOS and Android — strongly recommend C1, C3, P1 since they have the highest user volume.
- S6 has been verified at least once per release on iOS Safari + Instagram in-app browser + Android Chrome + Instagram in-app browser.
- No "Payment Not Confirmed" / "Authentication required" surface appears unless the verify result is genuinely `failed` (i.e. Paystack itself reported `status: failed`).

---

## Known good signals during a successful test

1. **Network**: `GET /api/paystack/verify?reference=<ref>` is called 1–5 times. The first response that resolves with `status: "success"` short-circuits the retry. Subsequent attempts have ~1.5s gaps.
2. **Logs**: `[paystack] verify resolved { attempts, status }` line appears in device logs. Forbidden card-data field names never appear — verify by running `npx react-native log-ios | rg "card_number|cvv|cvc|pan"` during the test and confirming zero hits.
3. **Backend**: `payments` / `paystack_authorizations` rows include `last_four`, `bin`, `brand`, `authorization_code`. They never include PAN, CVV, full expiry date as plaintext.

---

## When the matrix fails

- **"Payment Not Confirmed" on success path**: Re-check that the screen uses `verifyPaystackWithRetry` from `@/lib/payments/verifyPaystackWithRetry` and not a single-shot `api.get` call.
- **Stuck on spinner forever**: Likely missing `markReferenceProcessing(reference)` on the initiator side combined with the cold-start screen reading `isReferenceProcessing(reference) === true`. Audit the guard.
- **Status `pending` but real status was `success`**: Webhook hasn't landed by the time the 5 attempts finish. This is acceptable — the soft-success card will tell the user, and the domain state will update later. If it never updates, check Paystack webhook delivery logs and our `apps/web/src/app/api/payments/webhook/route.ts` handler.
- **`assertPaystackUrl` throws**: Initialize-payment API returned a non-Paystack `authorization_url`. This is a server bug — investigate before shipping. Never relax the allowlist.

---

## Quick CLI gates before shipping

Run from the repo root (PowerShell-safe):

```powershell
pnpm --filter @beautonomi/customer exec tsc --noEmit;
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };
pnpm --filter @beautonomi/provider exec tsc --noEmit;
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };
pnpm --filter @beautonomi/customer exec jest __tests__/lib/verifyPaystackWithRetry.test.ts --no-coverage;
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };
pnpm --filter @beautonomi/provider exec jest __tests__/lib/verifyPaystackWithRetry.test.ts --no-coverage;
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };
```

All four steps must return exit code 0.
