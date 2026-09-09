# Pricing Plans vs Subscription Plans vs Provider Subscriptions

This doc explains how the three concepts fit together and where each is used.

## The three concepts

| Concept | Table | Purpose |
|--------|--------|--------|
| **Pricing plans** | `pricing_plans` | Marketing/display: what you show on the **public pricing page** and in **onboarding**. Controls copy, price text, CTA, and which Paystack plan to use when someone subscribes from that page. |
| **Subscription plans** | `subscription_plans` | Back-end plans for **feature gating and limits**. Holds `price_monthly`/`price_yearly`, `features` (JSONB), `max_bookings_per_month`, `max_staff_members`, `max_locations`, and optional Paystack plan codes. This is what actually defines what a provider is allowed to do. |
| **Provider subscriptions** | `provider_subscriptions` | One row per provider. `plan_id` references **`subscription_plans(id)`**. Tracks status (active/cancelled/expired), Paystack subscription code, billing period, next payment date, etc. |

So: **pricing plans** are the “front”; **subscription plans** are the “backend” that enforce limits; **provider subscriptions** link a provider to a subscription plan.

## Admin “Memberships” vs Provider Subscriptions

- **Admin → Memberships** (`/admin/memberships`) manages the **`memberships`** table. These are **customer** membership products (e.g. Gold, VIP) that **customers** can subscribe to for benefits and discounts (see `customer_memberships`, `membership_benefits`, and booking discounts). They are **not** used for provider billing or for any provider limit enforcement.
- **Provider subscription** = **subscription_plans** + **provider_subscriptions**. This is what **providers** pay the platform for; all limit and feature enforcement (`get_provider_subscription_plan`, `can_provider_*`, etc.) uses this. Managed via **Admin → Plans** and provider subscription APIs.

So: **Memberships** = customer-facing membership products. **Provider subscription** = provider’s plan with the platform. They are not redundant; they serve different actors (customer vs provider). The `memberships` table also has optional `providers.membership_id`; that link is **not** used for enforcement—only subscription_plans/provider_subscriptions are.

## How they are linked

- **`pricing_plans.subscription_plan_id`** (optional FK to `subscription_plans`) links a display plan to the plan used for feature gating.
- When a provider subscribes **via a pricing plan** (e.g. from onboarding or a “Get started” button that uses a pricing plan id), the app uses that link:
  - It looks up the **pricing plan** by id to get Paystack plan codes and, if present, **subscription_plan_id**.
  - It then creates/updates **provider_subscriptions** with `plan_id = pricing_plan.subscription_plan_id` (not the pricing plan id).

So for any pricing plan that can be subscribed to, **`subscription_plan_id` must be set**. Otherwise the create flow would try to store the wrong id (see “Fix” below).

## Where each is used

### Pricing plans (`pricing_plans`)

- **Public pricing page** – `getPricingPlans()` in `lib/supabase/pricing.ts` (from `pricing_plans` + `pricing_plan_features`).
- **Admin → Pricing Plans** – `/admin/pricing-plans` and `/api/admin/pricing-plans` (CRUD on `pricing_plans`; optional “link” = `subscription_plan_id`).
- **Provider onboarding** – Plans shown in the plan step come from **`/api/public/pricing`** (pricing plans). The chosen plan id is a **pricing plan id**.
- **First-time subscription create** – `POST /api/provider/subscriptions/create` expects a **pricing plan id** (`plan_id`) and `billing_period`. It validates `subscription_plan_id` and Paystack plan codes, then calls Paystack **transaction/initialize** with the plan code. The response includes `authorization_url`; the frontend redirects the user there to pay. When the customer pays, Paystack creates the subscription and sends **subscription.create** (and **charge.success**). The **subscription.create** webhook handler creates/updates **provider_subscriptions** with `plan_id = subscription_plan_id` (resolving provider by customer email and plan by Paystack plan code).

### Subscription plans (`subscription_plans`)

- **Provider subscription record** – `provider_subscriptions.plan_id` → `subscription_plans.id`.
- **Feature/limit enforcement** – e.g. `get_provider_subscription_plan()`, `can_provider_*` checks in `135_subscription_limit_enforcement.sql` (all use `provider_subscriptions` joined to `subscription_plans`).
- **Provider app – plan list and actions**:
  - **GET /api/provider/subscription/plans** – returns **subscription_plans** (used in subscription/upgrade UI).
  - **POST /api/provider/subscription/change** – body `plan_id` = **subscription_plan id**.
  - **POST /api/provider/subscription/initialize-payment** – body `plan_id` = **subscription_plan id** (uses `subscription_plans.price_*` and Paystack codes on `subscription_plans`).
- **Other provider subscription APIs** – upgrade, cancel, renew, and Paystack webhook handlers resolve the provider’s plan via `provider_subscriptions` → `subscription_plans`.

### Provider subscriptions (`provider_subscriptions`)

- Single row per provider; `plan_id` is always a **subscription_plan** id.
- Used by all subscription and feature-checks logic above.

## Two ways to start or change a subscription

1. **Via pricing plan (onboarding / “Get started” from pricing page)**  
   - Client sends **pricing plan id** to `POST /api/provider/subscriptions/create`.  
   - Server uses `pricing_plans` for Paystack and `pricing_plans.subscription_plan_id` for `provider_subscriptions.plan_id`.  
   - **Requirement:** That pricing plan must have `subscription_plan_id` set.

2. **Via subscription plan (in-app upgrade / change plan)**  
   - Client gets plans from **GET /api/provider/subscription/plans** (subscription_plans) and sends **subscription_plan id** to:
     - `POST /api/provider/subscription/change`, or  
     - `POST /api/provider/subscription/initialize-payment`.  
   - Server uses `subscription_plans` only (no pricing_plans).

So: **pricing plans** drive the public/onboarding subscribe flow; **subscription plans** drive in-app plan list, change, and initialize-payment, and are the only thing stored on **provider_subscriptions**.

## Paystack plan codes

- **`pricing_plans`** – `paystack_plan_code_monthly`, `paystack_plan_code_yearly` (migration 189). Used by **subscriptions/create** when the client sends a pricing plan id.
- **`subscription_plans`** – same column names (migration 030). Used by **subscription/initialize-payment** and related flows that use subscription_plan id.

If you use both flows, keep the corresponding Paystack codes in sync for the same logical plan (e.g. the subscription_plan linked by `pricing_plan.subscription_plan_id` should have the same codes as the pricing plan used on the public flow).

## Is this correct?

- **Design:** Yes. One display layer (pricing_plans), one authority for limits (subscription_plans), and provider_subscriptions pointing only at subscription_plans is consistent.
- **Requirement:** Every pricing plan that can be subscribed to (e.g. has Paystack codes and is used in onboarding or “Get started”) **must** have `subscription_plan_id` set. The create route should reject when it’s missing instead of falling back to the pricing plan id (see fix below).
- **Admin (consolidated):** Use **Admin → Plans** (`/admin/plans`) to manage subscription plans and optional public pricing page entry in one place; enable **Show on public pricing page** to sync the linked pricing plan. The old **“link”** to the correct **subscription plan**. The old Pricing Plans and Subscription Plans nav entries are consolidated into **Plans**; `/admin/pricing-plans` redirects to `/admin/plans`.

## Paystack webhooks (provider subscriptions)

The app handles these Paystack events at `POST /api/payments/webhook` (signature-verified, idempotent via `webhook_events`):

| Event | Action |
|-------|--------|
| `subscription.create` | Resolve provider by customer email → upsert `provider_subscriptions` (plan from Paystack plan code). Paystack status `attention` → DB `past_due`. |
| `subscription.disable` | Set `provider_subscriptions` to `cancelled`, `auto_renew: false`. |
| `subscription.enable` | Set `active`, `auto_renew: true`, update `next_payment_date`. |
| `subscription.not_renew` | Set `auto_renew: false`. |
| `subscription.expiring_cards` | Notify provider (push/email) using template `subscription_card_expiring`. |
| `invoice.create` | Update `next_payment_date`. |
| `invoice.update` | Sync `next_payment_date` and status (`past_due` on failed/attention, `active` on success). |
| `invoice.payment_failed` | Set `past_due`, insert failed transaction record. |

Successful renewals (in invoice payload with `status: success` and `paid_at`) update `last_payment_date`, `expires_at`, `next_payment_date`, insert into `payment_transactions` and `finance_transactions`, and send the `subscription_renewed` notification.

## Superadmin: updating plans and existing subscriptions

- **Admin → Plans** (or **Subscription Plans**): When editing a paid plan, you can set **“Apply price/name changes to existing Paystack subscriptions”**. If checked, the Paystack plan update is sent with `update_existing_subscriptions: true` so current subscribers get the new price/interval on the next billing cycle. If unchecked, only new subscriptions use the updated plan.
- **Cancel flow**: Provider (or superadmin) cancels via `POST /api/provider/subscription/cancel`. The app fetches the Paystack subscription to get `email_token`, then calls Paystack’s disable API with that token so cancellation is reliable.

## Requirement: `subscription_plan_id` when subscribing via pricing plan

The create route **requires** `pricing_plan.subscription_plan_id` and returns 400 with a clear message if it’s missing. No fallback to the pricing plan id is used, so `provider_subscriptions.plan_id` always references `subscription_plans(id)`.

## Tier entitlements (enforcement vs marketing copy)

Migration `883_subscription_truth_alignment.sql` aligns **subscription_plans.features**, **pricing_plans** / **pricing_plan_features** bullets, and **apple_iap_products** descriptions with API enforcement. Migration `884_growth_plan_numeric_caps.sql` writes Growth’s numeric caps onto `subscription_plans` (columns + `features` JSON) so they match those bullets. Display copy lives in `pricing_plan_features`; limits and gates live in `subscription_plans.features` and are checked by RPCs (`can_provider_*`) and route-level helpers.

| Tier | Slug | Key limits | Marketing campaigns | Reports (`report_types`) | Included monthly credit |
|------|------|------------|---------------------|--------------------------|-------------------------|
| **Starter** | `free-tier-default` | 50 bookings/mo, 4 staff, 3 locations, 5 express links | Off (email/SMS/WhatsApp blocked) | `sales`, `bookings`, `clients` | R0 |
| **Growth** | `beautonomi-growth` | Unlimited bookings; 25 staff; 8 locations; 20 express links; 8,000 chat messages; 40 automations; 8 Yoco devices | Email + SMS via platform credentials | Above + `staff`, `products`, `payments`, `memberships` | R50/mo (see credit semantics below) |
| **Scale** | `beautonomi-scale` | Unlimited | Email + SMS + WhatsApp (own Twilio for WhatsApp) | Full suite incl. `gift_cards`, `packages` | R0 (pay-as-you-go top-ups only) |

**No trialing credit:** Providers in `trialing` status receive full plan entitlements, but there is **no** included marketing credit grant for trialing subscriptions. The monthly credit cron (`/api/cron/grant-marketing-credits`) runs only for `provider_subscriptions.status = 'active'`.

**No API access bullet on Scale:** Provider public API / API keys are not shipped; do not advertise API access on pricing or IAP copy until a real provider API exists.

## Report subscription gating

Provider report APIs use `requireProviderReportsAccess(request, { reportType })` in `apps/web/src/lib/reports/require-provider-reports-access.ts`, which checks staff permission **then** subscription via `assertReportSubscriptionAccess` in `apps/web/src/lib/subscriptions/report-gating.ts`.

Rules:

- **Superadmin:** always allowed.
- **Missing `advanced_analytics` key** on a legacy plan: fail-open (allow) with a console warning.
- **`advanced_analytics.enabled === false`:** 403 with `code: "SUBSCRIPTION_REQUIRED"`.
- **`report_types` non-empty:** allow only if the route's report type is in the list (case-insensitive). Report types are defined in `packages/subscription-features` (`REPORT_TYPES`, includes `memberships`).
- **`report_types` empty:** fall back to basic vs advanced buckets (`sales`/`bookings` → basic; others → advanced).

Route → report type mapping: `apps/web/src/lib/reports/report-subscription-types.ts`.

**Dashboard feeds:** `weekly-revenue` and `top-services` back the mobile dashboard cards and map to `sales` (available on every tier). `top-services` ranks service revenue (same basis as Sales by service), not products. The dashboard suppresses the error card on `SUBSCRIPTION_REQUIRED` rather than showing a red error.

**Ungated endpoints** (permission only, no subscription check): `products/inventory` (operational stock view).

**Schedule report:** gated on `advanced_analytics.enabled` only (not a separate report type).

**UI:** Mobile report screens show a "View plans" CTA on `SUBSCRIPTION_REQUIRED` via `FinanceReportError`. Web report pages use `ReportSubscriptionRequired` and `parseReportLoadError`.

## Marketing automations vs campaigns

- **Campaigns** (email/SMS/WhatsApp blasts): require `marketing_campaigns.enabled` and the channel in `marketing_campaigns.channels`.
- **Automations:** `marketing_automations.enabled` allows automation records on all tiers, but **outbound channel actions** are blocked on Starter via `assertAutomationChannelAllowed` (`apps/web/src/lib/subscriptions/marketing-channel-access.ts`):
  - `action_type` of `email`, `sms`, or `whatsapp` → 403 when marketing campaigns are disabled or channel not allowed.
  - `action_type` of `notification` (push/in-app) → allowed on Starter.
- Gate applies on **create**, **PATCH** (changing `action_type`), and **execute**.

## Included monthly marketing credit

Pure helper: `resolveIncludedMonthlyCreditZar(features)` in `apps/web/src/lib/marketing/included-credit.ts`.

Resolution order:

1. If `marketing_campaigns.included_marketing_credit_zar_per_month > 0`, use that value.
2. Else if `platform_ads.enabled === false`, return 0.
3. Else use `platform_ads.included_credit_zar_per_month` (Growth: 50; Scale: 0; Starter: 0).

Cron: `POST /api/cron/grant-marketing-credits` (Vercel schedule). Grants only **active** subscriptions, paginated in batches of 500. Credit is written to `provider_marketing_credits.included_balance_zar` via `grantMonthlyIncludedCredits` and is spendable on platform sends and on ads when `payment_method: "marketing_credit"`.

**Important:** `use_platform_credentials` on `marketing_campaigns` controls whether the provider may use platform SendGrid/Twilio for campaigns; it is **not** required for the ads included-credit grant.

## Platform ads module dependency

Subscription `platform_ads.enabled` on Growth/Scale allows a provider to **participate** in promoted placement when the platform has ads turned on. Actual ad serving, bidding, and spend still depend on **admin control-plane** config:

- Table: `ads_module_config` (per environment).
- Superadmin must enable the ads module for the environment before providers see promoted-placement UI or impressions are charged.
- Growth copy may mention "promoted placement ads (where available)" — availability is ops-dependent, not automatic from subscribing alone.

## Manual QA checklist (post-deploy)

Apply migrations `883` and `884` after code deploy. Smoke-test with one provider per tier:

1. **Starter:** email campaign POST → 403; notification automation POST → 201; email automation POST → 403; 51st booking in month → blocked; 6th express link → 403; `staff/performance` report → 403 + upgrade CTA; `sales/summary` → 200; inventory → 200.
2. **Growth (active):** email + SMS campaign → 200; `memberships` report → 200; `gift-cards/sales` → 403; 26th staff / 9th location → 403 + View plans; on 1st of month, `marketing_credit_ledger` has `monthly_grant` of 50; ads payable with `marketing_credit` when `ads_module_config.enabled`.
3. **Scale:** WhatsApp campaign → 200 only with Twilio WhatsApp configured; all reports → 200; no `monthly_grant` row.
4. **Copy surfaces:** `/pricing`, provider app More → Subscription, Admin → Plans, App Store product descriptions match migration 883 bullets (no trials, no API access on Scale, no included credit on Scale).
