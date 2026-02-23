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
- **First-time subscription create** – `POST /api/provider/subscriptions/create` expects a **pricing plan id** (`plan_id`). It reads Paystack codes and `subscription_plan_id` from that pricing plan and creates a Paystack subscription, then creates **provider_subscriptions** with `plan_id = subscription_plan_id` (see route and fix below).

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

## Fix: subscription create when `subscription_plan_id` is null

In **`apps/web/src/app/api/provider/subscriptions/create/route.ts`**, the code currently does:

```ts
plan_id: subscriptionPlanId || plan_id  // plan_id here is the pricing plan id
```

If `subscription_plan_id` is null, this would write the **pricing plan** id into `provider_subscriptions.plan_id`, which is a FK to **subscription_plans**. That would be wrong (and can violate the FK). The create route should require `subscription_plan_id` when creating a provider_subscription from a pricing plan and return a clear error if it’s missing, instead of using `plan_id`.
