# Feature flags: what happens when they’re disabled

## How flags are used

1. **Config bundle**  
   `/api/public/config-bundle` loads all rows from `feature_flags`, resolves rollout/platform/role/version, and returns `flags: Record<string, { enabled: boolean, ... }>`.  
   When a flag is **disabled** in admin, that flag is returned with `enabled: false`.

2. **Web app**  
   - `ConfigBundleProvider` fetches the config bundle; `useFeatureFlag(key)` returns `bundle.flags[key]?.enabled ?? false`.
   - `useFeatureFlag` in `@/hooks/useFeatureFlag` calls `/api/feature-flags/check?key=...` and returns `{ enabled, loading }`.
   - `FeatureFlagGuard` renders `children` only when the flag is enabled, otherwise renders `fallback` (or nothing).

3. **Customer / Provider apps**  
   They can use the same config bundle and a local `useFeatureFlag` so that when a flag is disabled, they get `false` and can hide or disable the feature.

## What actually happens when you disable a flag

- **Admin:** The flag shows as “Disabled” on **Settings → Feature flags**. Toggling it only updates the DB and the config bundle for future requests.
- **Config bundle:** The next time a client requests the bundle (e.g. on load or refresh), that flag appears with `enabled: false`.
- **Behaviour:** Only code that **explicitly checks** that flag will change:
  - If a screen uses `useFeatureFlag('payment_paystack')` or `FeatureFlagGuard featureKey="payment_paystack"` and hides Paystack when `false`, then disabling the flag will hide Paystack.
  - If nothing checks the flag, disabling it has **no effect** on that flow (e.g. Paystack or gift cards still show).

## Current gating status

- **Paystack (`payment_paystack`):** **Gated.** Web: shop checkout and booking step-payment hide “Pay Online” / “Card” when disabled; default to pay on delivery or cash. API: `/api/paystack/initialize`, `/api/me/orders` (POST), and booking `processPayment` reject with 403/400 when the flag is off.
- **Gift cards (`gift_cards`):** **Gated.** Web: gift-card purchase page shows “unavailable” when disabled; gift-card marketing page hides Buy/bulk CTAs; booking step-payment hides “Gift card” option; provider NewSaleDialog hides gift card payment and gift-card code input. API: purchase, validate (public + provider), booking consume and `processPayment` (gift card application) reject when disabled.
- **Wallet (`payment_wallet`):** **Gated.** Web: shop checkout and booking step-payment hide “Use wallet” when disabled. API: `/api/me/orders` (POST) and booking `processPayment` reject wallet use when disabled.
- **Other flags (e.g. `booking_online`, `booking_at_home`):** Same idea: they only affect behaviour where code explicitly uses `useFeatureFlag(...)` or `FeatureFlagGuard` for that key.

So: **disabling a flag only has an effect where the app already checks that flag.** Paystack, gift cards, and wallet are now gated as above; other flags apply only where explicitly checked.

## How to make “disabled” actually turn features off

1. **Paystack / card payment**
   - **Web:** Where payment methods are chosen (checkout, booking flow), call `useFeatureFlag('payment_paystack')` (or read from config bundle). If `false`, hide “Pay with card” / Paystack and only show cash (or other allowed methods).
   - **Customer app:** Same: in book-checkout and any payment method list, if `payment_paystack` is false, don’t show card/Paystack; optionally show a message like “Online payment is currently unavailable”.
   - **API:** In routes that initialize Paystack or create card payments, call `isFeatureEnabledServer('payment_paystack')` (or equivalent). If false, return 403 or 400 with a clear message so the UI can show “feature disabled”.

2. **Gift cards**
   - **Web:** On pages that list or purchase gift cards (e.g. account, provider profile), wrap the section or route with `FeatureFlagGuard featureKey="gift_cards"` or `useFeatureFlag('gift_cards')`. When disabled, hide the gift card block or redirect.
   - **Customer app:** Before showing “Buy gift card” or gift card list, check the flag from the config bundle; if false, hide those entries/screens.
   - **API:** In gift card purchase/validate endpoints, check the flag server-side and return 403 when the feature is disabled.

3. **Wallet (`payment_wallet`)**
   - Same pattern: anywhere “Use wallet” or wallet balance is shown (checkout, account), check the flag and hide/disable the option when it’s off.

## Summary

- **When a feature flag is disabled:**  
  It is stored as disabled and included in the config bundle with `enabled: false`. Any code that reads that flag (via config bundle or `/api/feature-flags/check`) will see “off”.
- **What actually changes:**  
  Only flows that already check the flag (e.g. with `useFeatureFlag` or `FeatureFlagGuard` or server-side `isFeatureEnabledServer`) will change. Paystack and gift cards are **not** checked today, so disabling them does not yet hide those features until you add the checks above.
