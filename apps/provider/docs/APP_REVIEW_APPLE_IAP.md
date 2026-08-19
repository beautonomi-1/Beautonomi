# App Review — Apple In-App Purchase (Beautonomi Partner)

Use this note in **App Store Connect → App Review Information → Notes** when submitting the Provider iOS app with Apple IAP enabled. **Do not bump the app version** solely for this document.

Bundle ID: `com.beautonomi.partner`

---

## Demo account (Beautonomi login)

Provide reviewers a **staging provider account** that is already onboarded (profile complete, at least one location, subscription screen reachable):

| Field | Value |
| --- | --- |
| Email | `buntulink@gmail.com` |
| Phone | `+27790624995` |
| App Review OTP | `246810` (override with env `APP_REVIEW_DEMO_OTP`) |
| User ID | `11ccc539-9160-47be-b7b3-5fef986f1033` |
| Password | Optional — `buntulink@gmail.com` supports **email + password** sign-in on the Partner login screen |
| Environment | Staging backend (`EXPO_PUBLIC_APP_URL` / web API used by the review build) |
| Subscription | **Must be the free tier** with `billing_provider` not `paystack` |

Legacy alias documented for ops: `appreview.provider@beautonomi.co.za` (prefer the Buntu account above for App Review builds).

**Phone / email OTP (App Review flow)**

1. On the Partner login screen, set country to **South Africa (+27)** if needed, then enter **790624995** (or `0790624995`).
2. Tap send code — the app detects the demo account and prompts for the **App Review OTP** (default `246810`). Typing `buntulink@gmail.com` on the Email tab uses **password** (not email OTP).
3. The app calls `POST /api/auth/app-review/verify-otp` and establishes a Supabase session (no SMS/email delivery required in review).

**Notifications onboarding (Guideline 5.1.1)**

First-session setup is **notifications only**. Pre-prompt buttons say **Continue** (never "Allow"). There is no skip on the welcome step — reviewers must Continue to the notifications step, then Continue again to reach the **system** notification prompt. Photo library and location are requested in-context when those features are used.

**ATT (App Tracking Transparency)**

Customer and Partner iOS builds request ATT via `request-att-before-tracking.ts` before initializing Singular / ad attribution. Declining tracking does not block core app use.

**In-app paths for reviewers**

| Feature | Path |
| --- | --- |
| Trust & Safety hub | **More → Trust & Safety** |
| Age assurance | **More → Trust & Safety → Age assurance** (also **Settings → Age assurance**). Add/edit date of birth here; Calendar is not locked. |
| Emergency contact | **More → Trust & Safety → Emergency contact** (also **Settings → Trust & Safety → Emergency contact**) |
| Content & safety controls | **More → Trust & Safety → Content & safety** (also **Settings → Trust & Safety → Content & Safety Controls**) |
| Blocked users | **More → Trust & Safety → Blocked users** |
| Report a user | **More → Trust & Safety → Report a user** (opens support ticket with safety preset) |
| Paid ads — retry failed campaign | **More → Buy ads → Failed filter → Try payment again** |
| Saved payment cards (billing) | **More → Billing** or **Settings → Billing** — distinct from per-campaign ad checkout |
| Subscription (StoreKit) | **More → Subscription** (shortcut) or **Settings → Billing** |
| Delete account | **More → Settings & account → Account → Delete account** (native in-app; not web-only) |

The iOS app blocks StoreKit checkout for accounts that already have an active Paystack subscription (grandfathering). If the demo account is on a paid Paystack plan, the reviewer taps Upgrade and sees **Not available** instead of the purchase sheet — a guaranteed Guideline 2.1 rejection. Keep this account on free, with Apple product IDs mapped on Growth and Scale.

Once a plan is billed through Apple, Android and web refuse Paystack upgrade/checkout until that Apple subscription expires. A new iPhone with the same Apple ID and Beautonomi login does not need to buy again — unfinished transactions sync at launch, and Restore uses the original StoreKit `appAccountToken` (ads order id or provider id). An Apple subscription lineage (`originalTransactionId`) can belong to only one business.

**Steps to verify subscription IAP**

1. Sign in with the demo account above.
2. Open **More → Subscription** (or **Settings → Billing**).
3. Choose **Growth Monthly** (or any paid plan).
4. On iOS, the app uses **StoreKit** (`Products.storekit` for local Xcode testing; Sandbox / Production for review builds).
5. Complete the App Store purchase sheet. The app calls `POST /api/provider/iap/verify` before finishing the transaction.
6. Confirm the plan badge updates to the selected tier and billing shows **Apple** as the processor.

**Sandbox Apple ID (IAP tester)**

Create a Sandbox tester in **App Store Connect → Users and Access → Sandbox → Testers**. Sign out of the personal Apple ID on the review device, then sign in with the sandbox tester when prompted during purchase. No real charges are made in Sandbox.

**Restore purchases**

From the subscription screen, use **Restore purchases** (if shown) or reinstall and sign in — the app re-verifies existing entitlements via StoreKit restore + server verify.

---

## StoreKit local testing (optional for engineering)

1. Open the Provider workspace in Xcode (after `expo prebuild` / dev client).
2. Edit the **Run** scheme → **Options** → **StoreKit Configuration** → select `apps/provider/Products.storekit`.
3. Product IDs match App Store Connect naming: `com.beautonomi.partner.sub.*` and `com.beautonomi.partner.ads.*`.
4. Set `APPLE_IAP_VERIFY_JWS=false` on the **local** web API. A StoreKit configuration file signs transactions with an Xcode-generated certificate, so signature verification correctly rejects them. Sandbox and TestFlight use real Apple certificates and need no such change.

---

## Backend configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `APPLE_APP_STORE_ISSUER_ID`, `APPLE_APP_STORE_KEY_ID`, `APPLE_APP_STORE_PRIVATE_KEY` | — | App Store Server API credentials. Can instead be managed by a superadmin at **Admin → Integrations → Apple**, which stores them in `platform_secrets` with an audit entry. |
| `APPLE_APP_STORE_BUNDLE_ID` | `com.beautonomi.partner` | Rejects signed payloads issued for any other app. |
| `APPLE_IAP_COMMISSION_RATE` | `0.15` | Commission split used for uplift pricing and ledger fees. |
| `APPLE_IAP_ENABLED` | enabled | Emergency kill switch, set to `false` to stop in-app purchases. iOS has no permitted Paystack fallback, so switching this off leaves iOS providers with no way to buy. |
| `APP_REVIEW_DEMO_OTP` | `246810` | Fixed App Review verification code (server only). |
| `APP_REVIEW_DEMO_PHONE` | `+27790624995` | Demo phone matcher (accepts `790624995` / `0790624995` / `+27…`). |
| `APP_REVIEW_DEMO_ENABLED` | enabled | Kill switch only. Set `false` to disable `POST /api/auth/app-review/verify-otp`. Unset means **enabled**. |
| `APPLE_SIGN_IN_CLIENT_ID`, `APPLE_SIGN_IN_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_PRIVATE_KEY` | — | Sign in with Apple token exchange + revoke on account deletion. Native SIWA stores a refresh token after the first authorization. |

Both switches are surfaced with their live values on the **Admin → Integrations → Apple** status panel.

Apple's notification endpoint is `POST /api/webhooks/apple/notifications` (configure in App Store Connect for both Production and Sandbox). It is unauthenticated by design and relies entirely on JWS signature verification.

If a purchase lands before its product mapping exists, fix the mapping under **Admin → Monetization → Apple products** and press **Replay** on the row in **Apple IAP Transactions**. Replay re-applies the stored payload and is safe to run repeatedly.

---

## Guideline 3.1.3 — why Apple IAP *and* non-IAP payments coexist

Beautonomi Partner is a **B2B SaaS + in-person salon operations** app. Payments fall into **distinct categories** with different merchants of record:

### A. Apple In-App Purchase (required digital entitlement)

| Flow | Product examples | Merchant of record |
| --- | --- | --- |
| Provider **subscription** (Growth / Scale) | `com.beautonomi.partner.sub.growth.monthly`, etc. | **Apple** |
| Provider **ads budget** (consumables) | `com.beautonomi.partner.ads.time.*`, `com.beautonomi.partner.ads.impressions.*` | **Apple** |

These unlock **platform tools and digital ad placement inside Beautonomi**. They are sold through StoreKit on iOS. Apple collects tax where applicable; subscription receipts state that Apple is the seller of record.

### B. §3.1.3(e) — goods & services **outside the app** (not Apple IAP)

The Provider app also supports **in-person payment capture** for real-world services and retail sold at the salon:

| Flow | Where money is collected | Guideline |
| --- | --- | --- |
| **Walk-in / POS booking checkout** | Paystack, Yoco, or **PayCloud card terminal** at the chair | §3.1.3(e) — payment for a **physical, in-person beauty/wellness service** consumed outside the app |
| **Retail product orders** (takeaway / pickup) | Same terminal or Paystack checkout | §3.1.3(e) — **physical goods** collected in store |
| **Cash / EFT / manual card** recorded for reconciliation | Provider-entered; no digital unlock | §3.1.3(e) — settlement for services already rendered in the real world |

These flows do **not** unlock digital content inside the app. They record payment for appointments and products fulfilled **face-to-face** at the provider’s premises or during a home visit. Guideline **§3.1.3(e) Goods and Services Outside of the App** explicitly permits payment methods other than IAP for such transactions.

**PayCloud / terminal POS specifically:** The “Charge on card machine” action initiates a **physical terminal** transaction (chip/tap on hardware at the salon). The mobile app only displays status and receipt — it is not selling a digital good. This is equivalent to Square, Yoco, or Shopify POS terminal flows used for in-person services.

### Reviewer-facing summary (paste if asked)

> Beautonomi Partner uses Apple IAP only for **platform subscription** and **paid ad placement** (digital entitlements managed by Beautonomi). All **in-person salon payments** — bookings, retail, and card-terminal (PayCloud/Yoco) checkout — are for real-world services and goods under **App Store Review Guideline §3.1.3(e)** and are processed outside IAP. Customer-facing booking payments occur in the separate Customer app and are similarly exempt as in-person services.

---

## App Store Connect checklist (required before submit)

These are not in the binary. Missing any of them produces an empty paywall or a metadata rejection:

1. **Paid Applications Agreement** signed, with banking and tax complete. Until this is done, `fetchProducts` returns nothing and prices render blank (Guideline 2.1).
2. Create the 4 auto-renewable subscriptions and 9 consumables with the exact product IDs in `apps/provider/Products.storekit`.
3. Put Growth and Scale in **one subscription group**, Scale at a higher level than Growth.
4. Localize display name and description for every IAP.
5. Attach a **review screenshot** to every IAP (required field).
6. Attach every IAP to **this version** of the app. First-time IAPs cannot be submitted on their own.
7. Set App Store Server Notifications V2 to `POST /api/webhooks/apple/notifications` for **Production and Sandbox**.
8. Load the In-App Purchase `.p8` key in **Admin → Integrations → Apple**.
9. Map `apple_product_id` on each paid plan and ads pack in Admin. An unmapped plan on iOS now errors instead of opening Paystack.
10. Privacy Policy and EULA URLs in App Store Connect metadata. The subscription screen also links Terms of Use and Privacy Policy in-app (Guideline 3.1.2).

---

## Privacy & account deletion

- Privacy Policy and Terms URLs are configured in App Store Connect (see `docs/store-compliance-provider-app.md`).
- Account deletion: **Settings → Account → Delete account** in the Partner app (native flow; Apple Sign in tokens are revoked server-side when configured).

---

## Contact

For review questions, use the **App Review contact** email/phone configured in App Store Connect (Beautonomi operations team).
