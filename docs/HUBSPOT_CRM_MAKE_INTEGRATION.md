# HubSpot CRM + Make ↔ Supabase integration (Beautonomi)

This document is the **implementation blueprint** for syncing Beautonomi’s product data into HubSpot for sales, marketing, and support. It is aligned to the **Supabase schema** under `supabase/migrations/` and assumes **Make** (formerly Integromat) orchestrates HTTP calls and scheduled jobs.

**Related docs:** [support-tickets.md](./support-tickets.md) (in-app ticket behaviour), [DATA_MODEL.md](./audit/DATA_MODEL.md) (table inventory).

**Goals**

- One **360° view** of **customers** and **providers** (people + businesses).
- **Marketing** segmentation (tenant, lifecycle, wallet, engagement, reviews).
- **Sales** pipeline for provider commercial motion (subscription / onboarding).
- **Support** parity with in-app **support tickets**, **disputes**, and escalations.
- **No secrets in mobile apps** — HubSpot and heavy sync run **server-side** or via Make with stored credentials.

---

## Table of contents

1. [Architecture](#1-architecture)
2. [HubSpot products to enable](#2-hubspot-products-to-enable)
3. [Core mapping: Supabase → HubSpot](#3-core-mapping-supabase--hubspot)
4. [Step-by-step: HubSpot setup](#4-step-by-step-hubspot-setup)
5. [Contact properties (full catalog)](#5-contact-properties-full-catalog)
6. [Company properties (provider business)](#6-company-properties-provider-business)
7. [Deals (pipelines & properties)](#7-deals-pipelines--properties)
8. [Support tickets ↔ HubSpot Tickets](#8-support-tickets--hubspot-tickets) (incl. provider-scoped tickets & thread sync)
9. [Ratings & reviews](#9-ratings--reviews)
10. [Wallet & money movement](#10-wallet--money-movement)
11. [Disputes & risk signals](#11-disputes--risk-signals)
12. [Other relevant entities (bookings, referrals, gift cards)](#12-other-relevant-entities-bookings-referrals-gift-cards)
13. [Make.com scenarios (detailed)](#13-makecom-scenarios-detailed)
14. [Sync keys, deduplication, and ordering](#14-sync-keys-deduplication-and-ordering)
15. [Privacy, consent, and data minimization](#15-privacy-consent-and-data-minimization)
16. [Quick reference: Supabase tables](#16-quick-reference-supabase-tables)

---

## 1. Architecture

```
┌─────────────────┐     webhooks / schedules      ┌──────────────┐
│    Supabase     │ ───────────────────────────▶ │     Make     │
│  (Postgres +    │ ◀─────────────────────────── │  (scenarios) │
│   Edge Fn/API)  │     optional reverse sync     └──────┬───────┘
└─────────────────┘                                      │
        ▲                                                │
        │ service role / signed triggers                  ▼
        │                                        ┌──────────────┐
        │                                        │   HubSpot    │
        └────────────────────────────────────────│  CRM API     │
                     optional write-back         └──────────────┘
```

**Recommended**

- **Primary upsert key (person):** `beautonomi_supabase_user_id` = `public.users.id`.
- **Primary upsert key (business):** `beautonomi_provider_id` = `public.providers.id`.
- **Ticket bridge:** `beautonomi_support_ticket_id` = `public.support_tickets.id` (UUID), plus human-readable `ticket_number`.

---

## 2. HubSpot products to enable

| Hub / area | Use for Beautonomi |
|------------|-------------------|
| **CRM – Contacts** | Every platform user; customer + provider owner + staff (same contact if one login). |
| **CRM – Companies** | One company per **provider business** (`providers.id`); associate owner + key staff. |
| **CRM – Deals** | Provider revenue / onboarding funnel; optional B2B pipeline. |
| **CRM – Tickets** | Mirror `support_tickets` for CS workflows, SLAs, and reporting. |
| **Lists & workflows** | Segments (wallet balance, review behaviour, open disputes, tenant). |
| **Marketing email** (tier permitting) | Nurture, win-back, review prompts (respect consent). |
| **Sales / Service seats** | Assign owners on deals/tickets. |

**Custom objects (optional, later)**

- If you must store **every** review row in HubSpot, add a **custom object** “Beautonomi Review” — usually **not** needed if aggregates + engagements suffice.

---

## 3. Core mapping: Supabase → HubSpot

| Supabase | HubSpot object | Notes |
|----------|----------------|-------|
| `public.users` | **Contact** | Always; includes wallet owner, reviewer, ticket requester. |
| `public.providers` | **Company** | Business record; link to Contact (`user_id` owner). |
| `public.tenants` | Contact + Company **properties** | `tenant_id`, `slug`, `default_currency`, etc. |
| `public.user_wallets`, `wallet_transactions` | Contact **aggregates** | Balance, last movement, counts — not every row by default. |
| `public.reviews` | Company aggregates + optional Contact (customer) review stats | Provider `rating_average` / `review_count` already maintained in DB. |
| `public.product_reviews` | Company + Contact aggregates | E-commerce reputation. |
| `public.support_tickets` | **Ticket** (1:1) | Best CS experience. |
| `public.support_ticket_messages` | Ticket **threads** / notes | Via API or manual process if full thread sync is heavy. |
| `public.booking_disputes` | Ticket **properties** or linked Deal/Ticket | Risk + priority for support. |
| `public.bookings` | Aggregates on Contact/Company | Counts, LTV proxies, last booking date. |

---

## 4. Step-by-step: HubSpot setup

### Phase A — Foundation (day 1)

1. Create a **private app** in HubSpot with scopes: `crm.objects.contacts.read/write`, `crm.objects.companies.read/write`, `crm.objects.deals.read/write`, `tickets` (read/write), `crm.schemas.*` as needed.
2. Decide **naming prefix** for all custom properties: `beautonomi_` (used throughout this doc).
3. In **Settings → Properties**, create properties from [Section 5](#5-contact-properties-full-catalog) and [Section 6](#6-company-properties-provider-business) (start with **identity + tenant + wallet + support aggregates**).
4. Create **association labels** (optional): Contact → Company “Owner”, “Staff”.

### Phase B — Support (week 1)

5. Configure **Ticket pipelines** and stages aligned to [Section 8](#8-support-tickets--hubspot-tickets).
6. Add **ticket properties** (`beautonomi_*`) for Supabase linkage and dispute flags.
7. Build first **Make** scenario: new/updated `support_tickets` → HubSpot Ticket upsert.

### Phase C — Reviews & wallet (week 1–2)

8. Add Contact/Company properties for **review and wallet aggregates** ([Sections 9–10](#9-ratings--reviews)).
9. Schedule Make (e.g. hourly/daily): SQL aggregates → patch HubSpot contacts/companies.

### Phase D — Sales & marketing (ongoing)

10. Create **Deal pipeline** ([Section 7](#7-deals-pipelines--properties)).
11. Build **lists** (e.g. high wallet balance customers, providers with low rating, open disputes).
12. Add **workflows** triggered on property changes (e.g. `beautonomi_open_dispute_count` > 0 → internal task).

---

## 5. Contact properties (full catalog)

Use **Contact** for the **person**. Mirror HubSpot native fields where useful (`email`, `firstname`, `lastname`, `phone`) for deliverability and mobile apps; keep `beautonomi_*` as source-aligned copies for Make.

### 5.1 Identity & platform role

| Internal name | Type | Supabase / source |
|---------------|------|-------------------|
| `beautonomi_supabase_user_id` | Single-line text | `users.id` — **primary upsert key** |
| `beautonomi_app_user_role` | Dropdown | `users.role`: `customer`, `provider_owner`, `provider_staff`, `superadmin` |
| `beautonomi_persona` | Dropdown | Derived: `customer`, `provider`, `both` |
| `beautonomi_provider_id` | Text | `providers.id` if user owns a business |
| `beautonomi_provider_staff_id` | Text | `provider_staff.id` if applicable |
| `beautonomi_provider_staff_role` | Text | `provider_staff.role`: `owner`, `manager`, `employee` |

### 5.2 Profile (`public.users`)

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_full_name` | Text | `users.full_name` |
| `beautonomi_preferred_name` | Text | `users.preferred_name` |
| `beautonomi_phone` | Phone | `users.phone` |
| `beautonomi_handle` | Text | `users.handle` |
| `beautonomi_preferred_language` | Text | `users.preferred_language` |
| `beautonomi_preferred_currency` | Text | `users.preferred_currency` |
| `beautonomi_timezone` | Text | `users.timezone` |
| `beautonomi_date_of_birth` | Date | `users.date_of_birth` |
| `beautonomi_email_verified` | Checkbox | `users.email_verified` |
| `beautonomi_phone_verified` | Checkbox | `users.phone_verified` |
| `beautonomi_last_login_at` | DateTime | `users.last_login_at` |
| `beautonomi_user_created_at` | DateTime | `users.created_at` |
| `beautonomi_signup_source` | Text | `users.signup_source` (API-maintained; see `/api/me/profile`; column added per repo migration for `users`) |
| `beautonomi_preferred_home_tenant_id` | Text | `users.preferred_home_tenant_id` — customer’s chosen home market (FK `tenants.id`) |
| `beautonomi_referral_code` | Text | `users.referral_code` |
| `beautonomi_referred_by_user_id` | Text | `users.referred_by` |

### 5.3 Identity verification (`public.users`)

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_identity_verified` | Checkbox | `users.identity_verified` |
| `beautonomi_identity_verification_status` | Dropdown | `users.identity_verification_status`: `pending`, `approved`, `rejected` |
| `beautonomi_identity_verification_submitted_at` | DateTime | `users.identity_verification_submitted_at` |
| `beautonomi_identity_verification_reviewed_at` | DateTime | `users.identity_verification_reviewed_at` |

### 5.4 Notifications & marketing eligibility

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_email_notifications` | Checkbox | `users.email_notifications_enabled` |
| `beautonomi_sms_notifications` | Checkbox | `users.sms_notifications_enabled` |
| `beautonomi_push_notifications` | Checkbox | `users.push_notifications_enabled` |

Use these with HubSpot **subscription types** / legal basis for email/SMS.

### 5.5 Multi-tenant (`public.tenants`, `user_tenant_roles`, provider context)

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_tenant_id` | Text | Active / primary `tenants.id` or `providers.tenant_id` |
| `beautonomi_tenant_slug` | Text | `tenants.slug` |
| `beautonomi_tenant_name` | Text | `tenants.name` |
| `beautonomi_tenant_region_code` | Text | `tenants.region_code` |
| `beautonomi_tenant_lifecycle` | Dropdown | `tenants.lifecycle`: `active`, `sandbox`, `suspended`, `disabled` |
| `beautonomi_tenant_default_currency` | Text | `tenants.default_currency` |
| `beautonomi_tenant_default_language` | Text | `tenants.default_language` |

### 5.6 Customer — booking & commerce aggregates

Populate via scheduled SQL in Make (or a materialized view). Adjust names to match your reporting.

| Internal name | Type | Typical SQL intent |
|---------------|------|-------------------|
| `beautonomi_customer_total_bookings` | Number | Count `bookings` for `customer_id` |
| `beautonomi_customer_completed_bookings` | Number | `status = completed` |
| `beautonomi_customer_cancelled_bookings` | Number | Optional |
| `beautonomi_customer_last_booking_at` | DateTime | Max `scheduled_at` or `end_time` |
| `beautonomi_customer_first_booking_at` | DateTime | Min completed |
| `beautonomi_customer_lifetime_spend` | Number | Sum paid amounts (from `transactions` / bookings — define in finance spec) |
| `beautonomi_customer_active_disputes` | Number | Count open `booking_disputes` for user’s bookings |

### 5.7 Customer — **service reviews** (`public.reviews`)

Reviews are **per booking**; customer is `reviews.customer_id`.

| Internal name | Type | Typical SQL intent |
|---------------|------|-------------------|
| `beautonomi_customer_reviews_written_count` | Number | Count `reviews` by `customer_id` |
| `beautonomi_customer_last_review_at` | DateTime | Max `reviews.created_at` |
| `beautonomi_customer_avg_rating_given` | Number | Avg `reviews.rating` (optional; usually less important than provider-side) |
| `beautonomi_customer_flagged_reviews_count` | Number | `is_flagged = true` |

### 5.8 Customer — **product reviews** (`public.product_reviews`)

| Internal name | Type | Typical SQL intent |
|---------------|------|-------------------|
| `beautonomi_customer_product_reviews_count` | Number | Count by `customer_id` |
| `beautonomi_customer_last_product_review_at` | DateTime | Max `created_at` |

### 5.9 Customer / user — **wallet** (`public.user_wallets`, `public.wallet_transactions`)

| Internal name | Type | Source / SQL |
|---------------|------|----------------|
| `beautonomi_wallet_id` | Text | `user_wallets.id` |
| `beautonomi_wallet_balance` | Number | `user_wallets.balance` |
| `beautonomi_wallet_currency` | Text | `user_wallets.currency` |
| `beautonomi_wallet_last_transaction_at` | DateTime | Max `wallet_transactions.created_at` |
| `beautonomi_wallet_lifetime_credits` | Number | Sum `amount` where `type = credit` (optional) |
| `beautonomi_wallet_lifetime_debits` | Number | Sum `amount` where `type = debit` (optional) |
| `beautonomi_wallet_transaction_count_30d` | Number | Rolling window (optional segment) |

`wallet_transactions` fields for reference when building reports in Supabase: `type` (`credit`/`debit`), `amount`, `description`, `reference_id`, `reference_type` (`booking`, `payout`, `refund`, etc.).

### 5.10 Support — **aggregates** (`public.support_tickets`)

Even when each ticket is a HubSpot Ticket, keep **rollups** on the Contact for segmentation. Ticket **categories** and **priorities** should use the same allowed values your product and admin APIs enforce (see `support_tickets.category`, `priority`, `status` in Supabase).

| Internal name | Type | Typical SQL intent |
|---------------|------|-------------------|
| `beautonomi_support_open_ticket_count` | Number | `status` in (`open`, `pending`, …) — match your app |
| `beautonomi_support_total_tickets` | Number | All time |
| `beautonomi_support_last_ticket_at` | DateTime | Max `created_at` |
| `beautonomi_support_last_ticket_number` | Text | Latest `ticket_number` |

### 5.11 Emergency & privacy (`public.users` / migrations)

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_emergency_contact_name` | Text | `users.emergency_contact_name` |
| `beautonomi_emergency_contact_phone` | Text | `users.emergency_contact_phone` |
| `beautonomi_emergency_contact_email` | Text | `users.emergency_contact_email` |

Only sync if CS truly needs it; see [Section 15](#15-privacy-consent-and-data-minization).

---

## 6. Company properties (provider business)

One **Company** per `public.providers.id`.

### 6.1 Core business

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_provider_id` | Text | `providers.id` — **company upsert key** |
| `beautonomi_supabase_owner_user_id` | Text | `providers.user_id` |
| `beautonomi_business_name` | Text | `providers.business_name` |
| `beautonomi_business_slug` | Text | `providers.slug` |
| `beautonomi_business_type` | Dropdown | `providers.business_type` |
| `beautonomi_provider_status` | Dropdown | `providers.status` |
| `beautonomi_tenant_id` | Text | `providers.tenant_id` |
| `beautonomi_currency` | Text | `providers.currency` |
| `beautonomi_phone` | Phone | `providers.phone` |
| `beautonomi_email` | Text | `providers.email` |
| `beautonomi_website` | Text | `providers.website` |
| `beautonomi_is_verified` | Checkbox | `providers.is_verified` |
| `beautonomi_is_featured` | Checkbox | `providers.is_featured` |
| `beautonomi_provider_created_at` | DateTime | `providers.created_at` |

### 6.2 Ratings & reviews (service) — **already on `providers`**

These are denormalized from `reviews` via triggers.

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_rating_average` | Number | `providers.rating_average` |
| `beautonomi_review_count` | Number | `providers.review_count` |

Optional extra rollups from SQL:

| Internal name | Type | Notes |
|---------------|------|--------|
| `beautonomi_reviews_visible_count` | Number | `reviews` where `is_visible` |
| `beautonomi_reviews_flagged_count` | Number | `is_flagged` |
| `beautonomi_reviews_pending_response_count` | Number | `provider_response IS NULL` and visible |
| `beautonomi_avg_service_rating_from_json` | Number | Only if you parse `service_ratings` JSONB in ETL |

### 6.3 Product reviews (`public.product_reviews` → by `products.provider_id`)

| Internal name | Type | Typical SQL intent |
|---------------|------|-------------------|
| `beautonomi_product_review_count` | Number | Join `product_reviews` → `products` → `provider_id` |
| `beautonomi_product_rating_average` | Number | Avg rating |
| `beautonomi_product_reviews_flagged_count` | Number | `is_flagged` |

### 6.4 Commercial & operations

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_total_bookings` | Number | `providers.total_bookings` |
| `beautonomi_total_earnings` | Number | `providers.total_earnings` |
| `beautonomi_subscription_plan_id` | Text | `providers.subscription_plan_id` |
| `beautonomi_subscription_status` | Text | `providers.subscription_status` |
| `beautonomi_subscription_expires_at` | DateTime | `providers.subscription_expires_at` |
| `beautonomi_team_size` | Dropdown | `providers.team_size` |
| `beautonomi_yoco_machine` | Dropdown | `providers.yoco_machine` |
| `beautonomi_payroll_type` | Dropdown | `providers.payroll_type` |

### 6.5 Primary location (from `provider_locations`)

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_primary_location_city` | Text | primary row |
| `beautonomi_primary_location_country` | Text | primary row |
| `beautonomi_primary_location_line1` | Text | optional — privacy |
| `beautonomi_primary_location_id` | Text | `provider_locations.id` |

### 6.6 Support & disputes (provider-scoped)

| Internal name | Type | Typical SQL intent |
|---------------|------|-------------------|
| `beautonomi_provider_open_ticket_count` | Number | `support_tickets.provider_id` |
| `beautonomi_provider_open_disputes_count` | Number | Disputes on bookings for this `provider_id` |

---

## 7. Deals (pipelines & properties)

### Pipeline example: **Beautonomi — Provider subscription**

Suggested stages (rename to match your motion):

1. New lead  
2. Qualified  
3. Onboarding in progress  
4. Subscribed (active)  
5. Expansion  
6. At risk  
7. Churned / closed lost  

### Deal properties

| Internal name | Type | Source / use |
|---------------|------|----------------|
| `beautonomi_supabase_user_id` | Text | Owner |
| `beautonomi_provider_id` | Text | Company link |
| `beautonomi_tenant_id` | Text | Market |
| `beautonomi_subscription_plan_id` | Text | `providers.subscription_plan_id` |
| `beautonomi_mrr_amount` | Number | From `subscription_plans` / billing |
| `beautonomi_currency` | Text | |
| `beautonomi_deal_source` | Dropdown | `inbound`, `outbound`, `self_serve`, `partner` |

Associate Deal to **Company** (provider) and primary **Contact** (owner).

---

## 8. Support tickets ↔ HubSpot Tickets

### 8.1 Why mirror tickets

`public.support_tickets` is the in-app source of truth. Syncing to HubSpot gives:

- Queues, SLAs, macros, and **CS reporting** alongside CRM.
- Single place for **follow-ups** when linked to Contact/Company.

### 8.2 Supabase schema reference

**`support_tickets`:** `id`, `ticket_number`, `user_id`, `provider_id`, `subject`, `description`, `category`, `priority`, `status`, `assigned_to`, `tags`, `metadata`, `resolved_at`, `closed_at`, `created_at`, `updated_at`.

**`support_ticket_messages`:** thread rows (`ticket_id`, `user_id`, `message`, `is_internal`, `attachments`, `created_at`).

**`support_ticket_notes`:** internal notes (`is_private`).

### 8.3 HubSpot Ticket — custom properties

| Internal name | Type | Source |
|---------------|------|--------|
| `beautonomi_support_ticket_id` | Text | `support_tickets.id` — **upsert key** |
| `beautonomi_ticket_number` | Text | `support_tickets.ticket_number` (human-readable; also map to Ticket name) |
| `beautonomi_ticket_category` | Text | `category` |
| `beautonomi_ticket_priority` | Dropdown | align to Supabase values |
| `beautonomi_ticket_tags` | Text (multi-line) or multi-select | `tags` array serialized |
| `beautonomi_ticket_metadata_json` | Text (long) | `metadata` JSON string — or omit and keep in Supabase only |
| `beautonomi_assigned_supabase_user_id` | Text | `assigned_to` |

### 8.4 Associations

- Ticket → **Contact** (`user_id` as requester).
- Ticket → **Company** if `provider_id` set (business context).
- Optional: Ticket → **Deal** if the issue is subscription-related.

### 8.5 Pipeline stages (example)

Map `support_tickets.status` ↔ HubSpot ticket stage:

| Supabase `status` (example values) | HubSpot stage |
|------------------------------------|---------------|
| `open` | New |
| `pending` / `waiting_on_customer` | Waiting on contact |
| `in_progress` | In progress |
| `resolved` | Resolved |
| `closed` | Closed |

Align enums to whatever your **production app** actually uses (check API/admin).

### 8.6 Provider-scoped tickets

When `support_tickets.provider_id` is set, the issue is tied to a **business** as well as the requester. Always associate the HubSpot ticket to the **Company** (`beautonomi_provider_id`) so CS sees bookings, disputes, and reviews in one place.

### 8.7 Message thread sync (optional)

Full **bi-directional** thread sync is non-trivial. Pragmatic options:

1. **MVP:** Sync ticket **header** only; agents work in HubSpot with link to admin URL for full thread.  
2. **Phase 2:** Append new `support_ticket_messages` as **engagement notes** on the HubSpot ticket via API.  
3. **Phase 3:** Webhook from HubSpot → your API to post **customer-visible** replies back to Supabase (requires careful `is_internal` handling).

---

## 9. Ratings & reviews

### 9.1 Service reviews — `public.reviews`

| Column | Meaning |
|--------|---------|
| `booking_id` | Unique per review |
| `customer_id` | Reviewer (Contact) |
| `provider_id` | Reviewed business (Company) |
| `rating` | 1–5 |
| `comment` | Text |
| `service_ratings` | JSONB per offering |
| `staff_rating` | JSONB |
| `provider_response`, `provider_response_at` | Public reply |
| `is_verified`, `is_flagged`, `flagged_reason` | Moderation |
| `is_visible`, `helpful_count` | Display |

**HubSpot strategy**

- **Company:** keep `rating_average`, `review_count` (synced from `providers` or recomputed).
- **Contact (customer):** review **counts** and dates ([Section 5.7](#57-customer--service-reviews-publicreviews)).
- **Optional:** create a **Ticket** or **Task** when `is_flagged` becomes true for moderation workflow.

### 9.2 Product reviews — `public.product_reviews`

| Column | Meaning |
|--------|---------|
| `product_id`, `order_id`, `customer_id` | Who bought / reviewed |
| `rating`, `title`, `comment`, `image_urls` | Content |
| `is_verified_purchase`, `is_visible`, `is_flagged` | Trust & moderation |
| `provider_response`, `provider_response_at` | Seller reply |

**HubSpot strategy:** Company-level product review aggregates ([Section 6.3](#63-product-reviews-publicproduct_reviews--by-productsprovider_id)).

### 9.3 Moderation and reputation workflows

| Signal | Suggested HubSpot action |
|--------|---------------------------|
| `reviews.is_flagged` or `product_reviews.is_flagged` | Task or Ticket for moderation queue; set `beautonomi_reviews_flagged_count` on Company. |
| New low rating (1–2) on active provider | Internal notification workflow (optional). |
| `provider_response` null for N days | Task for provider success (optional). |

---

## 10. Wallet & money movement

### 10.1 What to sync

- **Always:** current **balance** and **currency** on the Contact (`user_wallets`).
- **Often:** `last_transaction_at` and simple **30d activity** for segments.
- **Rarely:** every `wallet_transactions` row in HubSpot — use Supabase/BI for ledger detail unless finance needs a custom object.

### 10.2 Reference types (`wallet_transactions.reference_type`)

Examples: `booking`, `payout`, `refund`, etc. Use these in Supabase-only reporting; in HubSpot you might only store:

| Internal name | Type | Purpose |
|---------------|------|---------|
| `beautonomi_wallet_last_reference_type` | Text | Last txn type |
| `beautonomi_wallet_last_reference_id` | Text | For deep link to admin |

---

## 11. Disputes & risk signals

### 11.1 `public.booking_disputes`

| Column | Meaning |
|--------|---------|
| `booking_id` | FK |
| `reason`, `description` | Case detail |
| `opened_by` | `customer`, `provider`, `admin` |
| `status` | `open`, `resolved`, `closed` |
| `resolution` | `refund_full`, `refund_partial`, `deny` |
| `refund_amount`, `notes` | Outcome |

### 11.2 HubSpot usage

**Contact properties**

| Internal name | Type | SQL intent |
|---------------|------|------------|
| `beautonomi_open_dispute_count` | Number | Open disputes on user’s bookings (as customer or provider context) |
| `beautonomi_last_dispute_opened_at` | DateTime | |

**Company properties**

| Internal name | Type | SQL intent |
|---------------|------|------------|
| `beautonomi_provider_open_disputes_count` | Number | Disputes for provider’s bookings |

**Tickets:** When a dispute is opened, **create or link** a HubSpot ticket (or set `beautonomi_risk_dispute_open` checkbox on Contact/Company for list membership).

---

## 12. Other relevant entities (bookings, referrals, gift cards)

### 12.1 Bookings

Prefer **aggregates** on Contact/Company (counts, last date, revenue proxies). Full booking rows usually stay in Supabase.

### 12.2 Referrals

`users.referral_code`, `users.referred_by` — already on Contact. Optional: `beautonomi_referral_attached_at` if you track in a table.

### 12.3 Gift cards (`gift_cards`, `gift_card_orders`)

Optional Contact properties:

| Internal name | Type | Notes |
|---------------|------|--------|
| `beautonomi_gift_cards_purchased_count` | Number | |
| `beautonomi_gift_card_total_value_purchased` | Number | |

### 12.4 Saved payment methods (`payment_methods`)

Generally **do not** sync tokens or provider IDs to HubSpot. At most: `beautonomi_has_saved_card` checkbox.

---

## 13. Make.com scenarios (detailed)

1. **User upsert** — Trigger: Supabase `users` insert/update (via Database Webhook, Edge Function, or scheduled search) → HubSpot Contact upsert by `beautonomi_supabase_user_id`.
2. **Provider company upsert** — `providers` insert/update → Company upsert by `beautonomi_provider_id` → associate owner Contact.
3. **Wallet refresh** — Schedule hourly: query `user_wallets` + last txn → update Contact.
4. **Review rollups** — Schedule daily: recompute customer review counts; copy `providers.rating_average` / `review_count` to Company.
5. **Support ticket mirror** — `support_tickets` insert/update → HubSpot Ticket upsert; set associations.
6. **Dispute flag** — `booking_disputes` insert when `status=open` → update Contact/Company risk fields + optional Ticket.
7. **Deal stage from subscription** — When `providers.subscription_status` changes → update linked Deal (if using deals).

---

## 14. Sync keys, deduplication, and ordering

- **Contacts:** Upsert by `beautonomi_supabase_user_id`; fallback search by **email** if UUID missing (merge carefully).
- **Companies:** Upsert by `beautonomi_provider_id`.
- **Tickets:** Upsert by `beautonomi_support_ticket_id`.
- **Order:** User before Company association; Company before Deal.

---

## 15. Privacy, consent, and data minimization

- Do not sync **payment method secrets**, full **card numbers**, or **auth tokens** to HubSpot.
- **Emergency contacts**, **exact addresses**, and **internal notes** — only if CS requires them; restrict HubSpot visibility.
- Align `email_notifications_enabled` / HubSpot **subscription types** before marketing sends.
- Honour **account deletion** / deactivation: delete or anonymize HubSpot contact per your DPA.

---

## 16. Quick reference: Supabase tables

| Area | Tables |
|------|--------|
| Users | `users` (includes `signup_source`, `preferred_home_tenant_id` per migrations), `user_profiles`, `user_addresses`, `user_tenant_roles` |
| Providers | `providers`, `provider_locations`, `provider_staff`, `provider_onboarding_drafts` |
| Tenants | `tenants`, `tenant_domains`, `tenant_settings` |
| Reviews | `reviews`, `review_helpful_votes`, `product_reviews`, `product_review_helpful_votes` |
| Wallet | `user_wallets`, `wallet_transactions` |
| Support | `support_tickets`, `support_ticket_messages`, `support_ticket_notes` |
| Disputes | `booking_disputes` |
| Bookings | `bookings`, `booking_services`, `transactions`, … |

---

## Document maintenance

When the schema changes (new columns, enums, or tables), update:

1. The **property tables** in this doc.
2. Make scenario field mappings.
3. HubSpot dropdown **option sets** to stay in sync with Postgres `CHECK` constraints where applicable.

---

*Last aligned to Beautonomi migrations for `users`, `providers`, `tenants`, `reviews`, `product_reviews`, `user_wallets`, `wallet_transactions`, `support_tickets`, and `booking_disputes`.*
