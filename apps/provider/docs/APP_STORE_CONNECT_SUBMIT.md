# Provider iOS — App Store Connect submission checklist (v1.0.85)

Use this checklist when resubmitting **Beautonomi Provider** (`com.beautonomi.partner`) after App Review rejection. Complete every item before clicking **Submit for Review**.

Related: [APP_REVIEW_APPLE_IAP.md](./APP_REVIEW_APPLE_IAP.md) · [APP_STORE_AGE_RATING.md](../../../docs/APP_STORE_AGE_RATING.md)

---

## 1. Prerequisites

- [ ] **Paid Applications Agreement** signed (Agreements, Tax, and Banking)
- [ ] App Review contact phone in **App Store Connect → App Review Information** is current
- [ ] Production web API deployed with `APP_REVIEW_DEMO_ENABLED` unset or `true`
- [ ] Demo account `buntulink@gmail.com` on **free tier** (`billing_provider` ≠ `paystack`)
- [ ] Apple product IDs mapped on Growth/Scale plans in **Admin → Monetization → Apple products**

**Smoke test (after deploy):**

```bash
curl -X POST https://www.beautonomi.com/api/auth/app-review/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"buntulink@gmail.com","otp":"246810"}'
```

Expect HTTP **200** with session payload — not `404` or `403`.

---

## 2. In-App Purchases (Guideline 2.1(b))

Create **13 products** matching [`Products.storekit`](../Products.storekit):

### Subscriptions (one group: Growth < Scale)

| Product ID |
| --- |
| `com.beautonomi.partner.sub.growth.monthly` |
| `com.beautonomi.partner.sub.growth.yearly` |
| `com.beautonomi.partner.sub.scale.monthly` |
| `com.beautonomi.partner.sub.scale.yearly` |

### Consumables (ads)

| Product ID |
| --- |
| `com.beautonomi.partner.ads.time.1d` |
| `com.beautonomi.partner.ads.time.3d` |
| `com.beautonomi.partner.ads.time.7d` |
| `com.beautonomi.partner.ads.time.14d` |
| `com.beautonomi.partner.ads.time.30d` |
| `com.beautonomi.partner.ads.impressions.50` |
| `com.beautonomi.partner.ads.impressions.100` |
| `com.beautonomi.partner.ads.impressions.500` |
| `com.beautonomi.partner.ads.impressions.1000` |

**Per product:**

1. App Store Connect → **In-App Purchases** → create with exact Product ID
2. Add **display name** + **description** (en-US minimum)
3. Set **pricing**
4. Upload **App Review screenshot** (capture from **More → Subscription** or ads checkout)
5. For subscriptions: same **subscription group**; Scale tier **above** Growth

**Attach to version:**

1. Open the **1.0.85** version page
2. **In-App Purchases and Subscriptions** → add all 13 products
3. Submit IAPs **with** the new binary (first-time IAPs cannot be submitted alone)

**Server notifications:**

- Production + Sandbox → `POST https://www.beautonomi.com/api/webhooks/apple/notifications`

---

## 3. Age rating (Guideline 2.3.6)

App Store Connect → **App Information → Age Rating → Edit**:

| Question | Answer |
| --- | --- |
| **Parental Controls** | **None** |
| **Age Assurance** | **Yes** (In-App) |

Reviewer path: **More → Trust & Safety → Age assurance**

Public URL: https://www.beautonomi.com/age-suitability

---

## 4. Metadata — EULA & privacy (Guideline 3.1.2(c))

| Field | Value |
| --- | --- |
| **Privacy Policy URL** | `https://www.beautonomi.com/privacy-policy` |
| **Terms of Use** | Custom EULA **or** add to **App Description**: `Terms of Use: https://www.beautonomi.com/terms-and-condition` |

Verify both URLs load in Safari on device before submitting.

---

## 5. App Privacy label (Guideline 5.1.2)

If Singular/IDFA is enabled in production builds:

- **Device ID used for tracking** = Yes
- Note in Review Notes: ATT prompt on first launch before analytics

If not tracking on iOS, update label to **No tracking** and remove Device ID tracking declaration.

**Must match runtime:** production builds call ATT before Singular init.

---

## 6. Build & submit

**Build 1.0.85:** run production iOS build after merge (see commands below).

```bash
cd apps/provider
eas build --profile production --platform ios
eas submit --profile production --platform ios --latest
```

On the version page: select build **1.0.85**, attach all IAPs, paste Review Notes below, **Submit for Review**.

---

## 7. TestFlight verification (before submit)

Fresh install (delete app first). Use Sandbox Apple ID for IAP.

| # | Test | Pass |
| --- | --- | --- |
| 1 | ATT prompt on first launch | ☐ |
| 2 | Notifications onboarding: Welcome → Continue → Notifications → Continue → system prompt; no "Allow" / "Skip" on pre-prompt | ☐ |
| 3 | Demo login phone `790624995` → OTP `246810` | ☐ |
| 4 | Demo login email `buntulink@gmail.com` + password or OTP `246810` | ☐ |
| 5 | Sign in with Apple — no name/email re-entry in onboarding Step 2 | ☐ |
| 6 | **More → Trust & Safety → Age assurance** | ☐ |
| 7 | **More → Trust & Safety → Emergency contact** (save → hub shows masked phone) | ☐ |
| 8 | **More → Trust & Safety → Content & safety** (back works; toggles persist) | ☐ |
| 9 | **More → Trust & Safety → Blocked users** | ☐ |
| 10 | **More → Trust & Safety → Report a user** (support ticket preset) | ☐ |
| 11 | **More → Buy ads → Failed filter → Try payment again + Billing link** | ☐ |
| 12 | **More → Subscription** → Growth Monthly → StoreKit sheet | ☐ |
| 13 | Terms + Privacy links on subscription screen | ☐ |

---

## 8. Review Notes (paste into App Store Connect)

```
DEMO ACCOUNT (no phone call needed)
Email: buntulink@gmail.com
Phone: +27 79 062 4995 (enter 790624995 on login)
App Review OTP: 246810
Password sign-in also works for the email above.
Environment: https://www.beautonomi.com

APP REVIEW OTP FLOW
1. Partner login → Phone tab → South Africa (+27) → 790624995 → Send code
2. Enter OTP 246810 (fixed demo code; no SMS required)
3. Or Email tab → buntulink@gmail.com → Send code → OTP 246810

SUBSCRIPTION IAP (Guideline 2.1(b))
More → Subscription (or Settings → Billing) → Growth Monthly → complete StoreKit purchase.
Demo account is on the free tier with Apple product IDs mapped. Sandbox Apple ID required for purchase.

APP TRACKING TRANSPARENCY (Guideline 5.1.2)
ATT system prompt appears on first app launch before Singular/analytics initialization.
Declining does not block app use.

SIGN IN WITH APPLE (Guideline 4)
Apple-provided name and email are used automatically; onboarding Step 2 does not re-ask for them.

PERMISSIONS (Guideline 5.1.1)
First-session flow covers notifications only (Continue buttons). Photo library and location are requested in-context when the user uploads photos or uses location features.

AGE ASSURANCE (Guideline 2.3.6)
More → Trust & Safety → Age assurance (edit date of birth).
Trust & Safety also includes Emergency contact, Content & safety controls, Blocked users, and Report user (support ticket).

PAID ADS vs BILLING
More → Buy ads: each campaign is paid at checkout. Saved cards for subscriptions/invoices: More → Billing (Settings → Billing).

Age Suitability: https://www.beautonomi.com/age-suitability

SUBSCRIPTION LEGAL (Guideline 3.1.2)
More → Subscription shows plan name, price, billing period, auto-renew disclosure, and links to Terms of Use and Privacy Policy.

Terms: https://www.beautonomi.com/terms-and-condition
Privacy: https://www.beautonomi.com/privacy-policy
```
