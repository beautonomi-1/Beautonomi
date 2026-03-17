# Ads system: provider and superadmin

This doc describes how the **ads system** (boosted listings / sponsored slots) works between **superadmin**, **provider (web)**, and **customer app**, and what is fully wired vs placeholder.

---

## 1. Superadmin (control plane)

| What | Where | Status |
|------|--------|--------|
| **Module config** | Admin → Control Plane → Ads module | ✅ Full |
| **API** | `GET/PUT /api/admin/control-plane/modules/ads` | ✅ |
| **Config fields** | `enabled`, `model`, `disclosure_label`, `max_sponsored_slots`, `cost_per_impression_ratio` (per environment: production, staging, development) | ✅ |
| **Impression packs** | Same page: list and edit packs (price_zar, is_active, display_order) | ✅ Full |
| **API** | `GET/PATCH /api/admin/control-plane/modules/ads/packs` | ✅ |

Superadmin can enable/disable the ads module per environment and manage fixed impression packs (e.g. 50, 100, 500, 1000 impressions at set ZAR prices). Providers see only **active** packs when the module is enabled.

---

## 2. Provider (web portal)

| What | Where | Status |
|------|--------|--------|
| **Ads page** | Provider → Settings → Paid ads (`/provider/settings/ads`) | ✅ Full |
| **Campaigns** | `GET /api/provider/ads/campaigns`, `POST` (create draft or with payment), `PATCH /api/provider/ads/campaigns/[id]` (status, budget, targeting) | ✅ |
| **Performance** | `GET /api/provider/ads/performance` (impressions, clicks, spend, sales) | ✅ |
| **Packs** | `GET /api/provider/ads/packs` (active packs only; gated by module enabled) | ✅ |
| **Create campaign** | Draft with optional budget; budget > 0 → create `ads_budget_orders` row, redirect to Paystack | ✅ |
| **Buy pack** | POST campaigns with `impression_pack_id` → same payment flow | ✅ |
| **Payment callback** | Return to `/provider/settings/ads?payment_success=1&order_id=...` → refetch campaigns/performance | ✅ |
| **Webhook** | Paystack charge success → `handleAdsBudgetOrderSuccess`: mark order paid, credit campaign `budget`, insert `payment_transactions` and `finance_transactions` (provider_ads_payment) | ✅ |

Provider **mobile app**: Settings → Ads opens a **native placeholder screen** only (“Ad campaigns – Full ad management is coming soon”). No API calls, no link to web. Ads management is **web-only** for now.

---

## 3. Auction and impressions (customer-facing)

| What | Where | Status |
|------|--------|--------|
| **Search** | `GET /api/public/search` | ✅ Runs `runAdsAuction()` when `ads_module_config.enabled` is true; merges sponsored slots at top; returns `is_sponsored` and `campaign_id` on cards |
| **Impressions** | `recordAdImpressions(winners, idempotencyPrefix)` in search route after auction | ✅ Writes to `ads_events` (event_type: impression). DB trigger charges campaign `spent` (5% of bid_cpc per impression, capped at budget) |
| **Home** | `GET /api/public/home` | ✅ Inline ads logic when module enabled (sponsored slots) |
| **Auction** | `runAdsAuction()` in `apps/web/src/lib/ads/auction.ts` | ✅ Reads `ads_module_config` (enabled, max_sponsored_slots), active campaigns with budget, applies daily cap and pack impression cap |

---

## 4. Click and book attribution (customer app)

| Event | Recorded by | Status |
|-------|-------------|--------|
| **Impression** | Server (search/home) | ✅ When results are returned and `recordAdImpressions` runs |
| **Click** | Customer app | ✅ **Fixed:** `ProviderCard` now calls `POST /api/public/ads/event` with `event_type: 'click'`, `campaign_id`, `provider_id` when user taps a sponsored card (search and anywhere else that passes `campaign_id`) |
| **Book** | Customer app | ⚠️ **Not wired:** Completing a booking from a sponsored result does not yet call `POST /api/public/ads/event` with `event_type: 'book'`. To support “sales” in provider performance, the booking success flow would need to send a book event when the user came from an ad (e.g. store `campaign_id` in booking context or session and call the event API on success). |

---

## 5. Database and finance

- **Tables:** `ads_campaigns`, `ads_events`, `ads_impression_packs`, `ads_module_config`, `ads_budget_orders`
- **RLS:** Providers manage own campaigns; superadmins can manage all. Public event API uses admin client to insert events.
- **Spend:** Impression cost = 5% of `bid_cpc` (trigger in migration 261). Pack campaigns use `pack_impressions` and are capped by that count.
- **Admin finance:** `GET /api/admin/finance/summary` includes `ads_net`, `ads_gross`, `ads_gateway_fees` from `finance_transactions` (transaction_type: provider_ads_payment).

---

## 6. Summary

- **Superadmin ↔ provider (web):** Fully working. Superadmin enables the module and manages packs; providers create campaigns, buy packs or set budget, pay via Paystack; webhook credits the campaign; provider sees performance (impressions, clicks, spend; “sales” count depends on book events).
- **Provider mobile:** Ads management is not implemented; placeholder only. Use web for ads.
- **Customer app:** Search uses public search API (auction + impressions). Click attribution from sponsored cards is implemented; **book attribution** is not yet implemented.

Implementing **book attribution** would require: (1) passing `campaign_id` (and optionally `provider_id`) through the booking flow when the user came from a sponsored result, and (2) calling `POST /api/public/ads/event` with `event_type: 'book'` when the booking is confirmed.
