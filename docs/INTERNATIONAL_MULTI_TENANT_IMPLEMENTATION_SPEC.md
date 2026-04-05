# Beautonomi International Multi-Tenant Rollout — Technical Design

**Version:** 2.6.4  
**Audience:** Engineering, Platform, Security, Product  
**Stack:** One Supabase project, one Next.js web app (Vercel), one Customer Expo app, one Provider Expo app, one monorepo.

**Document map:** §0 terminology → §1–2 scope & architecture → **Non-negotiable rules (NN)** → **Cross-Border Customer Principles** → §3–6 operating model, roles, data, schema → §7–8 auth & RLS (incl. §7.8–7.9 edge cases) → §9 (**incl. §9.7.1 Vercel**) & §10 payments → §11–14 web (**incl. §11.3.1–11.3.2 admin portal + `/api/admin` inventory**), mobile, API, ops → §15–20 test, rollout, risks, acceptance, migration, **§20.1 feature flags** → §21 completeness + **§21.1** (residual risks + **enforcement / governance limits**) → **Appendix A** → **Appendix B** → **Appendix C (`/api/admin` route inventory)** → Key changes.

### Document maintenance (normative)

- **Single definition:** If a new section introduces a rule that **already exists** elsewhere, the new text **MUST** cite the **authoritative** section (see **Authoritative index** below) and **MUST NOT** restate conflicting wording. Prefer **one short normative paragraph + link**.  
- **Index updates:** When you add an authoritative rule, **update the Authoritative index** table in the same PR/commit as the prose change.  
- **Numbering:** New subsections use the next free decimal (e.g. `6.2.3`); do not reuse numbers. If you **move** a subsection, update **all** internal references (`§x.y`) in this file and in linked runbooks.  
- **Admin API inventory:** When you add or remove **`apps/web/src/app/api/admin/**/route.ts`** handlers, regenerate **Appendix C** in the same PR where feasible (PowerShell + `node` steps at the top of **Appendix C**).

### Authoritative index (use this to resolve duplicates)

| Topic | **Single source of truth** | Also referenced in |
|-------|---------------------------|-------------------|
| Names: **Tenant**, **Active tenant**, **Booking tenant**, **Home / preferred tenant** | **§0** | §3 (short), §7.3.1, Cross-Border Principles |
| **Trust model** (what is never trusted from client) | **§7.1** | §11.1, §13.2, NN below |
| **Customer global identity vs tenant-scoped data** | **§5.0** | §4.3, §5.2, §8.4 |
| **Commerce scoping** (wallet, reviews, favorites, promos) | **§5.2** + Cross-Border Principles item 5 | §10.7 |
| **Schema / `tenant_id` end state** | **§6.6** | §6.2–6.3, §8.1 |
| **Customer cross-tenant reads** | **§8.4** | §7.7, §13.1 |
| **Payments rails + orchestration** | **§10.0–10.2** | §6.5, §6.7 |
| **Mobile resolution + cart** | **§12.0, §12.7** | §7.7, §16 step 8 |
| **Support ownership** | **§13.4** + Cross-Border Principles item 11 | — |
| **Superadmin / `/admin` portal** | **§11.3.1** | §4.2–4.3, §7.6, §8.3, §11.3.2, §13.1, Appendix B, **Appendix C** |
| **`/api/admin` route list (generated)** | **Appendix C** | §11.3.2, §11.3.1 |
| **Analytics money vs funnel** | **§14.7** | §10.7, NN |
| **Legacy / seed tenant (backfill only)** | **§6.2** + **§6.6** | NN-8, §16 step 1, §20 |
| **Feature flag merge order** | **§20.1** | §14.6, §10.2 step 5 |

**Reading order for implementers:** §0 → **NN** → Cross-Border Principles → §6.1–6.3, **§6.2** (legacy tenant rule), §6.6–6.7 → §7.1, §7.3.1–7.3.2, **§7.8** → §8.1, §8.4 → §9.7–**§9.7.1** → §10.0–**§10.7** → §11.1, **§11.3.1**, **§11.3.2** / **Appendix C** (if working on **`/admin`** or **`/api/admin/*`**) → §12.0, §12.7 → **§20.1** → §15 (tests for your slice).

---

## 0. Terminology (normative)

- **Tenant** is the **durable admin boundary** and **primary data-isolation boundary** for market operations. All tenant-scoped configuration, RLS, and admin authorization are expressed in terms of **tenant**, not “country” or “region” as separate entities in code or schema.
- **Tenant usually maps to one country** (one primary country domain, one primary currency/compliance posture). It **may** later map to a **regulated multi-country region** (e.g. a single EU tenant) without renaming concepts—**that region is still a tenant** (`slug` = `eu`, domains mapped accordingly).
- **Do not** introduce parallel role names such as `country_superadmin` or `regional_superadmin` in schema or APIs. Use **`tenant_superadmin`** for full admin within a tenant, and **`global_superadmin`** only for optional internal cross-tenant operations.
- **“Country”** appears in product copy, domains, and SEO; **“tenant”** is the implementation primitive.
- **Active tenant (session context)** — The tenant resolved for the **current request or app session** (web `Host`, deep link, or explicit customer switch). Drives **browse, search, checkout, SEO surface, and tenant-default UX**.
- **Booking tenant** — The tenant attached to a **specific booking** (and its payments, tax, invoices, disputes). **Immutable** for the life of that booking; equals the market where the service is sold and settled.
- **Home / preferred tenant (customer)** — Optional **personalization hint** only (language/currency **suggestions**, marketing defaults). **Does not** restrict where the customer may transact.

**Authority:** These definitions are **canonical**. §3 repeats only **operating-model** context; on conflict, **§0 wins**.

---

## 1. Scope and goals

### 1.1 In scope

- **Logical multi-tenancy** in a **single** Supabase project: one schema, `tenant_id` + RLS for isolation.
- **Domain-based tenant resolution** on web (`Host` → tenant).
- **Per-tenant (country/market) operations:** config, admin scope, integrations, payments, SEO surfaces.
- **Gradual migration** from today’s single-market assumptions (additive schema, adapters, feature flags).
- **One binary** for Customer and **one binary** for Provider; tenant awareness at runtime.
- **Monorepo preservation:** additive changes, wrappers, minimal folder churn.
- **Cross-border customers (Airbnb-class):** a **single global auth identity** may browse, book, pay, review, and receive notifications **across multiple tenants over time**; **commercial, financial, tax, legal, and admin boundaries remain tenant-scoped** (see **Cross-Border Customer Principles** and §7–8).

### 1.2 Out of scope (phase 1)

- Separate Supabase projects per country.
- Separate web apps or country forks of the repo.
- Separate mobile apps per country.
- Full “Shopify Plus merchant-of-record” complexity unless product explicitly requires it later.

### 1.3 Success criteria

- No cross-tenant data access via API or direct DB (RLS enforced).
- Each country domain has correct **canonical, hreflang, sitemap, robots** behavior.
- Payment and integration behavior is **selected by resolved tenant**, not hardcoded.
- **Tenant superadmins** (`tenant_superadmin`) cannot act outside their assigned tenant(s).
- Existing production traffic can run on a **default tenant** until cutover per domain.
- A logged-in customer may complete bookings in **tenant A** and later in **tenant B** without a second account; **each booking** carries **`booking_tenant_id`**; **checkout, PSP, and tax** always match that booking’s tenant.
- **“My bookings”** (and similar) present a **coherent global account view** while each row remains **financially and legally** tied to its booking tenant.

---

## 2. Architectural decision

**Chosen pattern:** **Logical multi-tenancy** with **`tenant_id` on tenant-scoped rows + RLS**, and **request-scoped tenant context** derived primarily from **HTTP `Host`** on web and **explicit bootstrap + membership checks** on mobile.

**Why not DB-per-region or app-per-region:** Lowest operational and code churn for one team, one deploy pipeline, one schema evolution story.

**Default mapping:** **`tenant` = primary go-to-market (usually one country)** — e.g. `za`, `uk`, `global`. A tenant may later represent a **regulated multi-country region** (e.g. `eu`) if legal/product demands one policy surface across countries; **that is still one tenant**, not a second isolation concept—map domains and policies to that tenant. Start with **one tenant per country domain** for clarity and SEO.

**Customer vs tenant (decisive):** **Tenant** is **not** a customer account boundary. **Customers are global identities** (`auth.users` + `users` profile). **Admin and provider commercial operations** stay **strictly tenant-scoped**. **Marketplace transactions** (bookings, payments, payouts, invoices, most promos/loyalty/wallets) stay **tenant-scoped per record**. Cross-border travel is **first-class**, not an edge case.

---

## Non-negotiable engineering rules (NN)

Rules below **MUST** hold in production. They supersede convenience, client hints, and implicit single-market habits.

| ID | Rule | Enforcement surface |
|----|------|----------------------|
| **NN-1** | **Tenant is the only isolation primitive** in code and schema for market boundaries. **Do not** add parallel `country_id` / `region_id` FKs for the same purpose; **product “country”** = domain/copy/SEO only. | DB `tenant_id`, APIs, RLS |
| **NN-2** | **Never trust** `tenant_id` / `tenant_slug` from **query/body** for authorization or row scope on **mutating** routes. **Web:** resolve from **`Host`** (and edge-trusted `x-forwarded-host` per §7.1). **Mobile:** client tenant is a **hint**; **server** validates membership or resource `tenant_id`. | Edge + Route Handlers |
| **NN-3** | **One global customer identity** — no duplicate `users` rows per tenant. | Auth + `users` |
| **NN-4** | **Booking tenant = financial truth** — PSP, tax, refunds, disputes, booking notifications, invoice semantics for that booking use **`bookings.tenant_id`**, not **active** or **home** tenant. | Payments §10.2, §10.7, jobs §14.2 |
| **NN-5** | **Booking mutations** — load booking (or idempotent key) first; **derive `tenant_id` from the row**; reject if **active** context does not match **and** no approved **booking-scoped** path (§7.8). | API handlers |
| **NN-6** | **Every tenant-bound SELECT/INSERT/UPDATE** from app code **MUST** constrain `tenant_id` (or inherit from a parent row already constrained). **Service-role** routes **MUST** document bypass and still apply explicit filters. | Code review, §8.6 |
| **NN-7** | **Revenue / GMV metrics** **MUST** attribute to **`booking_tenant`** (or equivalent); **never** use **`active_tenant`** or **`home_tenant`** as sole money attribution. | §14.7, warehouses |
| **NN-8** | The **legacy / seed / `default_tenant`** used for **initial backfill** is a **migration convenience only**. Production code **MUST NOT** treat it as a **permanent implicit fallback** when **`Host`** / `tenant_domains` resolution fails or when `tenant_id` is unknown—**fail closed** or resolve explicitly (§6.2, §6.6). | Edge, APIs, jobs |

---

## Cross-Border Customer Principles

**Normative summary** for product and legal alignment. **Mechanisms:** §7.3.1 (three-tenant model), §7.7–**§7.8** (browse vs mutate), §8.4 (reads), §12.7 (cart).

Normative rules for Airbnb-style marketplace behavior **without** weakening tenant isolation:

1. **One identity** — Single Supabase auth user; **no** requirement for duplicate registration per tenant.
2. **Customer not tenant-locked** — Optional **home/preferred tenant** is for **UX hints only**; it **must not** block checkout in another tenant.
3. **Booking is the financial unit** — **Exactly one `tenant_id` per booking** (the **booking tenant**). That tenant governs **online checkout PSP**, **tax**, **invoices**, **refunds**, **disputes**, and **ledger lines** for that booking.
4. **Active tenant drives discovery** — Browse/search/checkout on a domain (or explicit app switch) use **active tenant** from **host / deep link / intentional switch**; inventory and pricing are **tenant-local**.
5. **No silent cross-tenant money** — Wallets, store credit, loyalty balances, and promo redemptions are **tenant-scoped by default**; never auto-convert or merge across tenants unless a **future** product explicitly designs and audits that.
6. **Admin never inherits customer mobility** — `tenant_superadmin`, provider tools, and payouts remain **tenant-scoped**; **global_superadmin** is explicit and rare.
7. **Coherent account UI** — Customers may see **all their bookings** in one list; each row shows **market/tenant** context; deep links open the **correct tenant** surface for actions that change that booking.
8. **Notifications follow context** — Booking lifecycle messages use **booking tenant** (templates, links, PSP callbacks). Optional marketing may use **home** or **last active** tenant by policy—**documented and consent-gated** where required.
9. **Legal and consent are tenant-aware** — Terms/privacy **acceptances** are recorded **per tenant** when documents differ; export/delete orchestration may aggregate **per tenant** for one user.
10. **Analytics dimensions** — Every event carries **`booking_tenant`** when applicable plus **`active_tenant`** / **`home_tenant`** properties to avoid double-counting and to report GMV **per tenant** and journeys **per user**.
11. **Support ownership (v1)** — **Pure account/auth** (login, verification, device) → **platform** queue. **Booking-linked** refunds, disputes, service issues → **`bookings.tenant_id`** support (§13.4). **Do not** route by **last active tenant** alone when a booking id exists.

---

## 3. Operating model

| Concept | Definition |
|--------|------------|
| **Tenant** | The **durable** market instance (typically one country) with its own domains, config, admin scope, and business data partition. Same word in DB, APIs, and admin UX. |
| **Domain** | Maps 1:1 to a tenant via `tenant_domains` (primary + aliases). |
| **Global** | Platform-wide reference data, internal tools, and **fallback** defaults when tenant has no override. |
| **Effective config** | `merge(global_defaults, tenant_settings)` with explicit override rules (see §5). |
| **Active / Booking / Home tenant** | **Defined in §0 and §7.3.1** — this table does not redefine them (avoids drift). |

**Tenant lifecycle states** (store on `tenants`):

- `active` — normal operations  
- `sandbox` — staging / pilot; optional payment test mode  
- `suspended` — read-only or degraded (product-defined)  
- `disabled` — hard block at edge + clear error surface  

---

## 4. Tenant model and role model

### 4.1 Is “tenant = country” the right default?

**Yes, for Beautonomi’s stated goals (SEO + local ops + local PSPs).**  
Country domains align with **search intent**, **local compliance**, and **payment availability**. If you later need **EU-wide** (or other multi-country) governance, introduce **one tenant** (e.g. `eu`) whose **primary domain** and policies represent that region—**do not** add a parallel “region” admin or isolation layer unless product explicitly requires splitting tenants further.

### 4.2 Role model (simple, practical)

Avoid exploding roles. Use **two dimensions**: **platform scope** × **tenant attachment**.

**Platform roles (optional, small set)**

- `global_superadmin` — internal only; full cross-tenant (use sparingly, MFA, audit).

**Tenant-attached roles** (rows in `user_tenant_roles`)

- `tenant_superadmin` — full admin within that tenant (product may describe this as “country superadmin”; **code and DB use this single role name**).  
- Existing section admins as today: `admin_finance`, `admin_trust`, `admin_platform_config`, … **scoped to one tenant** via `user_tenant_roles`.

**Naming note:** **Do not** add `country_superadmin`, `regional_superadmin`, or other aliases in RBAC tables. If “region” = EU market, **create tenant `eu`** and grant `tenant_superadmin` on that tenant.

**Permission rule (decisive):**

- **All admin API checks** = `user has required role FOR (user_id, tenant_id)` where `tenant_id` is **resolved server-side** for the request (see §7).  
- `global_superadmin` bypasses tenant filter **only** where explicitly coded (dangerous paths gated + audited).

**Provider/customer:** Same Supabase `auth.users` identity; **data scoping** via `tenant_id` on `providers`, `bookings`, etc., and RLS. A user may be customer in `za` and provider in `uk` only if product allows—model supports it via separate rows and memberships.

### 4.3 Isolation surfaces (admin vs provider commercial vs customer mobility)

| Surface | Scoped by | Rule |
|---------|-----------|------|
| **Admin / back-office** | **Tenant** | `user_tenant_roles` + host on admin domains; no cross-tenant access except **global_superadmin** tooling. |
| **Provider commercial** | **Tenant** | Provider entity, staff, catalog, payouts, and POS config are **tenant-local**; same legal entity in two countries → **two provider rows** (§6.7). |
| **Customer identity** | **Global** | One account; profile fields may include **optional** `preferred_home_tenant_id` (or equivalent) for UX only. |
| **Customer marketplace actions** | **Active tenant** (browse/checkout) + **booking tenant** (post-commit) | User opens `beautonomi.co.uk` → active tenant UK; booking created there → **booking `tenant_id` = UK** forever for that row. |
| **Customer account history** | **Aggregated view, tenant-scoped rows** | APIs may return bookings **across tenants** for `customer_id`, but **each row** carries `tenant_id`; mutations on a booking validate **booking tenant** (or use booking id lookup first). |

---

## 5. Data classification model

### 5.0 Customer data: global identity vs tenant-specific (normative)

**Purpose:** Engineers must know **which columns live on global profile tables** vs **which rows/columns are tenant-scoped**, to avoid leaking one market’s policy into another or storing PII in the wrong isolation boundary.

#### 5.0.1 Global customer identity and profile (no `tenant_id` on the row)

Stored once per person; **never duplicated** per tenant for the same `user_id`.

| Field / concern | Typical storage | Rule |
|-----------------|-----------------|------|
| **Auth identifiers** | `auth.users` (email, phone auth, OAuth ids) | Single identity; multi-domain auth still one user. |
| **Core profile** | `users`: legal/wallet name, primary email/phone, avatar, locale **hints** (optional) | Edits are **global**; downstream tenant UIs re-validate at checkout if a market requires stricter fields. |
| **Global account security** | MFA factors, session metadata (as applicable) | **Platform** concern; not tenant-partitioned unless product explicitly shards security per tenant. |

**Do not** store **tenant-specific legal acceptance**, **per-tenant marketing consent**, or **per-tenant commercial preferences** as the only copy on `users` without a `tenant_id`—those belong in **tenant-scoped tables** (see below).

#### 5.0.2 Tenant-specific preferences, consents, and settings

Each record that encodes **“this user in this market agreed / prefers / is configured as…”** carries **`tenant_id`** (or is a child of a tenant-scoped parent such as `bookings`).

| Concern | Storage pattern | Notes |
|---------|-----------------|-------|
| **Terms / privacy / refund policy acceptance** | `(user_id, tenant_id, doc_type, version, accepted_at)` | User may have **many** rows—one per tenant/doc version (§5.1). |
| **Marketing / SMS / email consent (market campaigns)** | **Per-tenant** rows or JSON keyed by `tenant_id` | v1 default: **per-tenant** where campaigns differ (§5.1). |
| **Tenant UX flags** | `tenant_settings` + optional `user_tenant_preferences` if introduced | E.g. dismissed banners, last-selected sub-market—**never** imply authorization. |
| **Commercial engagement tied to money/liability** | Tables in §5.2 | Wallets, loyalty, promos, gift cards—**always** tenant-scoped. |

#### 5.0.3 Global customer profile vs tenant-scoped commerce data (implementers)

- **Profile row (`users`)** answers: *who is this person, how do we authenticate them, how do we display their name globally?*  
- **Commerce data** answers: *what did they buy, owe, or earn **in market X**?* — always keyed by **`booking.tenant_id`**, **`providers.tenant_id`**, or explicit **`tenant_id`** on ledger/review/favorite rows.  
- **APIs:** “Me” endpoints that mix both must **label each block** (`global_profile` vs `per_tenant[]`) so clients do not merge wallets, reviews, or legal consent across tenants by accident.

| Class | Examples | Storage | Client visibility |
|-------|----------|---------|-------------------|
| **Global reference** | ISO country/currency tables | Unscoped tables | Public read OK |
| **Tenant business data** | Providers, bookings, payouts, promos, **per-tenant** customer ledger rows (wallet, loyalty, applied promos) | `tenant_id` required | RLS + API scope |
| **Global customer identity** | `auth.users`, core `users` profile (name, email, phone) | No `tenant_id` on identity | User can access **own** data across tenants via explicit policies/APIs |
| **Tenant public config** | Branding, supported languages, feature flags, **public** integration flags | `tenant_settings` JSONB (non-secret) | Public bundle endpoint |
| **Tenant private config** | API keys, webhook secrets, OAuth client secrets | `tenant_secrets` (server-only) | Never to client |
| **Global platform defaults** | Today’s `platform_settings` | Keep during migration | Becomes fallback only |
| **Overrides** | Per-tenant template, tax profile | Dedicated tables or JSON sections | Merge with fallback |
| **Integration metadata** | `integration_capabilities` registry (§6.5) | DB reference rows | Internal docs + validation; not a substitute for `tenant_settings` |

**Rule:** Anything in `tenant_settings` that was ever world-readable (like today’s `platform_settings` patterns) must **not** hold secrets—mirror current `platform_secrets` split at tenant level.

### 5.1 Internationalization, compliance, and money (concise)

These are **first-class** alongside payments; keep them **tenant-scoped** where policy differs by market.

| Concern | Tenant-scoped? | Notes |
|---------|----------------|--------|
| **Default locale / language list** | Yes | `tenant_settings` + `tenant_localization` if split out; fallback to global. |
| **Currency display & rounding** | Yes | Default currency per tenant; **money stored in DB as minor units or decimal + currency code** consistently; never mix ZAR/GBP in one wallet without an explicit model (see §5.2). |
| **Tax / VAT / invoice footers** | Yes | Regime and defaults per tenant; line-level tax on bookings/products as product requires. |
| **Legal docs (terms, privacy, refunds)** | Yes | Version per tenant; acceptance records include `tenant_id` + `doc_version`. |
| **DSR (export / delete)** | Yes | One global identity may request export/delete; orchestration returns **packages per tenant** (or merged with tenant labels); jobs carry `tenant_id` where data is tenant-bound. |
| **Retention windows** | Yes (optional) | Configurable per tenant where law differs; document global minimum. |
| **Legal acceptance (terms / privacy)** | **Per tenant** when documents differ | Store `(user_id, tenant_id, doc_type, version, accepted_at)`; user may have **multiple** rows over time for different tenants. |
| **Consent (marketing / analytics)** | **Split** | Categories that are **purely global** (rare) vs **tenant-specific** (e.g. UK vs ZA marketing)—**v1 simplest:** persist **per-tenant** marketing consent where tenants run separate campaigns; **global** technical minimum (e.g. product analytics) only if legal approves one policy. |

Do **not** block the first rollout on full tax engine complexity—**do** reserve `tenant_id` on any table that will need market-specific tax or invoicing later.

### 5.2 Commerce and engagement scoping (reviews, loyalty, promos, wallets, subscriptions)

**Principle:** **Default tenant-scoped** for anything that touches **money, liability, or regulatory exposure**; **global or cross-tenant read** only where it improves UX and **does not** blur accounting.

| Entity | Scoping (**v1 — normative unless marked optional**) | Rationale |
|--------|---------------------------|-----------|
| **Bookings** | **Always `tenant_id` = booking tenant** | Financial and legal unit; traveler bookings in UK use UK tenant end-to-end. |
| **Payments, refunds, invoices, disputes** | **Same `tenant_id` as booking** | PSP, tax, and reporting stay aligned. |
| **Wallets / stored credit / gift card balance** | **Tenant-scoped** (`user_id` + `tenant_id` or separate balance row per tenant) | Avoids cross-currency liability and reconciliation nightmares. |
| **Loyalty points** | **Tenant-scoped** by default | Same reasons as wallet; optional future “global program” is a **separate** product decision. |
| **Promo codes** | **Tenant-scoped** (`unique (tenant_id, code)`) | Prevents cross-market subsidy errors. |
| **Gift cards** | **Tenant-scoped** (issued/redeemed in one market) | Cross-tenant gift cards require explicit FX and legal design—**out of v1** unless approved. |
| **Customer subscriptions / memberships** (marketplace products) | **Tenant-scoped** if tied to a market catalog | If one SKU exists per tenant, subscription row carries that `tenant_id`. |
| **Reviews** | **Tenant-scoped row** (`tenant_id` on review or derived from **booking’s `tenant_id`**) | Moderation and trust ops are per tenant. **Display:** show in **that tenant’s** provider profile; **account “my reviews”** may list **all** user’s reviews with **tenant badge**. |
| **Favorites / saved providers** | **Tenant-scoped** (`user_id`, `tenant_id`, `provider_id`) | Provider id is only unique within tenant (§6.3); favorite references **one tenant’s** provider. Re-saving same business in another tenant = **second row** if they have another provider record there. |

**Normative (favorites and reviews, cross-tenant businesses):**

- **Separate tenant-local provider records:** The **same real-world business** operating in **two tenants** is modeled as **two `providers` rows** (`provider_id_A` in `tenant_za`, `provider_id_B` in `tenant_uk`) per §6.7. Favorites and review aggregates are **always per `provider_id`** (hence **per tenant**).  
- **No default cross-tenant aggregation:** **Public** ratings/review counts on a provider profile **must not** merge reviews attached to **another tenant’s** provider row—even if staff believe it is the “same brand.” **Product-led** cross-market reputation is **out of v1** unless explicitly designed (separate trust model, legal, and UI). **“My reviews”** in account settings may still list **all** of the user’s reviews **with a visible tenant/market badge** per row.

---

## 6. Data model and schema changes

### 6.1 Core tenant tables (additive)

```sql
-- Core tenancy
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  region_code text not null,
  lifecycle text not null default 'active'
    check (lifecycle in ('active','sandbox','suspended','disabled')),
  default_currency text not null,
  default_language text not null default 'en',
  default_timezone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  hostname text not null unique,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Exactly one primary domain per tenant
create unique index tenant_domains_one_primary
  on public.tenant_domains (tenant_id)
  where is_primary = true;

create table public.tenant_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  version int not null default 1,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (tenant_id, is_active)
);

create table public.tenant_secrets (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  -- payments
  paystack_secret_key text,
  paystack_webhook_secret text,
  stripe_secret_key text,
  stripe_webhook_secret text,
  yoco_webhook_secret text,
  -- integrations (examples)
  mapbox_access_token text,
  onesignal_rest_api_key text,
  amplitude_secret_key text,
  google_calendar_client_secret text,
  outlook_client_secret text,
  updated_at timestamptz not null default now()
);

create table public.user_tenant_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, role)
);
```

### 6.2 Tenant-scoped business columns (phased)

```sql
alter table public.providers add column if not exists tenant_id uuid references public.tenants(id);
alter table public.bookings add column if not exists tenant_id uuid references public.tenants(id);
-- repeat for other tenant-bound tables in prioritized waves
```

**Backfill:** Single existing market → assign all rows to **`default_tenant`** (e.g. `za` or `global`—pick one canonical legacy tenant and document it).

**Legacy / seed tenant (normative — not a permanent fallback):**

- The **`default_tenant`** / **legacy tenant** row exists to **backfill** historical data and to run **single-market** cutovers **before** every hostname maps to a real tenant.  
- **Forbidden:** Using that id as **`if (!tenantId) use default_tenant`** in **customer-facing** resolution, **new writes**, or **cron** that should be multi-tenant—this **reintroduces** implicit single-market behavior and violates **NN-8**.  
- **Allowed:** Time-boxed migration scripts, one-off admin tools, and **explicitly documented** “legacy hostname → legacy tenant” rows in **`tenant_domains`** until cutover completes.  
- **End state:** Every production request path resolves **`tenant_id`** from **`Host`** (web) or validated bootstrap (mobile); unknown host → **error**, not silent default (§7.1, §11.1).

### 6.2.1 Optional customer preference columns (additive)

**Home / preferred tenant (personalization only):**

```sql
-- Example: on public.users (or dedicated customer_preferences)
alter table public.users add column if not exists preferred_home_tenant_id uuid references public.tenants(id);
```

- **Nullable.** If set, use for **default language/currency suggestions** on cold start (mobile) or **marketing** segmentation—not for authorization.  
- **Must not** be required for signup.  
- Changing it **never** migrates existing bookings or wallets.

### 6.2.2 Saved addresses (customers, v1 — cross-border travelers)

**Simplest safe v1 model:** **Tenant-scoped saved addresses** — table keyed by **`(user_id, tenant_id, …)`** (or equivalent composite). A traveler maintains **independent** saved address lists **per market**; switching **active tenant** does **not** imply addresses “follow” silently.

**Why:** Validation rules (required fields, allowed countries, postal formats, service-area / geofence checks) differ by **booking tenant** and provider; a ZA-formatted address must not auto-apply to a UK checkout without **explicit** user action and **server-side** re-validation under **booking tenant** rules.

**Validation at booking time (non-negotiable):**

- **Checkout / hold / booking create** must validate the chosen address against **`bookings.tenant_id`** (booking tenant) requirements: allowed destination countries, provider service area, platform geocoding rules, and any tenant-specific compliance flags.  
- An address **saved under tenant A** is **not trusted** for tenant B until validated under **tenant B** rules (user may re-select it; server still re-runs checks).  
- **Do not** store a single global “default shipping address” without `tenant_id` if it is used for **tenant-bound services**—use **per-tenant default** pointer or **last-used per tenant**.

### 6.3 Composite uniqueness must become tenant-aware

**Examples of required changes (illustrative—verify against live schema):**

- `providers.slug` globally unique today → **`unique (tenant_id, slug)`** after backfill.  
- `promotions.code`, `notification_templates.key`, etc. → **`(tenant_id, key)`** with nullable `tenant_id` only during transition; end state **NOT NULL** on tenant-bound tables.

**Rule:** Any `UNIQUE` that represents a **business identifier** in a market must include `tenant_id`.

### 6.4 Audit logging

```sql
create table public.tenant_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  actor_user_id uuid references public.users(id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Append-only; server writes with service role or privileged RPC; RLS: **tenant admins read own tenant**; global superadmin read all.

### 6.5 Integration capability registry (reference metadata)

**Purpose:** Single source of truth for **which integrations exist**, **who owns secrets**, **what scope they apply at**, and **whether global fallback is allowed**. Runtime config still lives in `tenant_settings` / `tenant_secrets` / provider rows; this table is **documentation + enforcement hooks** (app can validate writes against it; optional DB check constraints via triggers later).

```sql
-- integration_capabilities: one row per logical integration surface
create table public.integration_capabilities (
  integration_key text primary key,
  -- global = platform default only; tenant = configured per tenant; provider = per-provider overlay within tenant rules
  scope text not null check (scope in ('global', 'tenant', 'provider')),
  -- platform = env / platform_secrets; tenant = tenant_secrets; provider = provider-owned secrets (e.g. per-provider OAuth)
  secret_owner text not null check (secret_owner in ('platform', 'tenant', 'provider')),
  -- Whether merge(global_defaults, tenant) may supply this integration when tenant has no override
  fallback_allowed boolean not null default false,
  -- Documented public JSON keys (non-secret) for reviews and codegen; not enforced by Postgres unless you add triggers
  public_config_key_hints text[] not null default array[]::text[],
  description text,
  created_at timestamptz not null default now()
);

-- Seed examples (adjust keys to match codebase naming)
insert into public.integration_capabilities (integration_key, scope, secret_owner, fallback_allowed, public_config_key_hints, description) values
  ('payments_online_checkout', 'tenant', 'tenant', false, array['allowed_gateway_families','default_gateway_family','enabled_gateway_families'], 'Platform-collected online checkout; tenant defines allowed/default gateway families'),
  ('payments_inperson_pos', 'tenant', 'tenant', false, array['allowed_pos_families','default_pos_family'], 'In-person / POS rails; tenant defines allowed families; provider enables methods within tenant'),
  ('maps_geocoding', 'tenant', 'tenant', true, array['provider','enabled'], 'Map geocoding/directions; optional global token fallback if fallback_allowed'),
  ('messaging_push', 'tenant', 'tenant', true, array['enabled','customer_app_id','provider_app_id'], 'OneSignal or equivalent; public app IDs in tenant_settings, REST keys in tenant_secrets'),
  ('messaging_sms', 'provider', 'provider', false, array['enabled'], 'SMS often provider-scoped; secrets on provider integration rows'),
  ('analytics_product', 'tenant', 'tenant', true, array['enabled','project_key_public'], 'Amplitude etc.; public key in settings, secret in tenant_secrets'),
  ('kyc_identity', 'tenant', 'tenant', false, array['enabled','level'], 'Sumsub or equivalent; tenant-scoped policy'),
  ('fraud_risk', 'tenant', 'tenant', false, array['enabled','ruleset'], 'Fraud provider or internal rules version'),
  ('calendar_google', 'tenant', 'tenant', false, array['enabled','client_id_public'], 'OAuth client id public; secret in tenant_secrets'),
  ('calendar_outlook', 'tenant', 'tenant', false, array['enabled','client_id_public'], 'OAuth client id public; secret in tenant_secrets')
on conflict (integration_key) do nothing;
```

**Concrete split (payments vs maps vs KYC):**

| integration_key | scope | secret_owner | Public config (examples) | Private / secret | fallback_allowed |
|-----------------|-------|--------------|---------------------------|------------------|------------------|
| `payments_online_checkout` | tenant | tenant | `allowed_gateway_families`, `default_gateway_family` | PSP API keys, webhook secrets | no |
| `payments_inperson_pos` | tenant | tenant | `allowed_pos_families`, `default_pos_family` | POS webhook secrets if platform-mediated | no |
| `maps_geocoding` | tenant | tenant | `enabled`, `provider` | Map access token | yes (single global token OK if policy allows) |
| `messaging_push` | tenant | tenant | `enabled`, app IDs | REST API key | yes |
| `messaging_sms` | provider | provider | `enabled` | Provider Twilio creds | no |
| `analytics_product` | tenant | tenant | `enabled`, public API key | secret key | yes |
| `kyc_identity` | tenant | tenant | `enabled`, `level` | API secret | no |
| `fraud_risk` | tenant | tenant | `enabled`, `ruleset` | API secret | no |
| `calendar_google` / `calendar_outlook` | tenant | tenant | `enabled`, OAuth client id (if exposed) | client secret | no |

### 6.6 Migration end state (tenant-bound tables)

After migration completes, **every table that holds tenant-scoped business data** must satisfy:

1. **`tenant_id uuid NOT NULL`** referencing `tenants(id)` (except pure global reference tables, e.g. ISO codes).
2. **Tenant-aware indexes:** leading column `tenant_id` on hot paths, e.g. `(tenant_id, created_at desc)`, `(tenant_id, status)`, `(tenant_id, provider_id)` as appropriate.
3. **Tenant-aware unique constraints:** any natural key that was globally unique becomes **`unique (tenant_id, …)`** (e.g. provider slug, promo code, template key per tenant).
4. **No insert without resolved tenant:** application and RPC entry points **reject** creates when `tenant_id` cannot be derived from trusted context (web `Host`, server-inferred tenant from resource, or explicit validated tenant for jobs/webhooks after resolution).
5. **RLS enabled** with policies consistent with §8; service-role bypass paths documented and filtered by `tenant_id` in code.  
6. **Legacy / seed tenant** from §6.2 backfill **does not** grant permission to skip **Host** / bootstrap resolution in application code after cutover—see **NN-8**.

Nullable `tenant_id` is **transition-only**; remove nullability once backfill and code paths are verified.

### 6.7 Provider and catalog tenancy (recommended default)

**Easiest model that preserves isolation and avoids shared market rows:**

- Each **provider** has **`tenant_id NOT NULL`** = **primary tenant** (the market where the business is onboarded and where commercial operations default).
- **Provider commercial and catalog data** that participates in marketplace discovery, booking, payouts, and tax for that market is **tenant-scoped** (same `tenant_id` on `providers`, listings, offerings, bookings, etc., per your schema).
- **Cross-tenant expansion** (same legal entity operating in another country) is modeled as **a separate provider record** (or explicit subsidiary) **in the other tenant** with its own slug and configuration—not as one provider row shared across tenants by default. Linking legal entity identity (optional) is a **non-market** concern (e.g. `legal_entity_id`) and does **not** weaken RLS boundaries.
- **Provider-enabled payment methods** (e.g. “accept Yoco terminal”, “enable Paystack subaccount”) are stored on **provider** (or `provider_*_integrations`) but **must be filtered** by **tenant allow-lists**: tenant config defines **allowed gateway / POS families**; provider config only **enables** options **within** that allow-list.

### 6.8 Tenant-bound table inventory (waves)

Maintain an explicit checklist (in repo docs or ticket) of tables that **must** gain `tenant_id` and tenant-aware uniques. **Minimum waves:**

| Wave | Typical tables / domains |
|------|---------------------------|
| **W1** | `providers`, `bookings`, booking children (payments, refunds, holds), `provider_locations` |
| **W2** | Commerce: `promotions`, `loyalty_rules`, `subscription_plans`, memberships, gift cards, shop orders |
| **W3** | Content & comms: `notification_templates`, `email_templates`, `sms_templates`, CMS pages/FAQs as applicable |
| **W4** | Ops: `feature_flags` (nullable `tenant_id` = global row), support tickets, ads/ranking module config if market-specific |
| **W5** | Finance ledgers, payouts, disputes—**must** align with payment rail and reconciliation (§10.4) |

**Discovery command:** grep migrations / `DATA_MODEL` audit for `CREATE TABLE` and cross-check against this spec.

### 6.9 Tenant and domain lifecycle (deletion / cascade)

- **Prefer soft lifecycle:** `tenants.lifecycle = disabled` + disable `tenant_domains`; avoid **hard-deleting** tenants that have bookings or payouts.  
- **FK strategy:** `tenant_id` references should use **`ON DELETE RESTRICT`** (or no cascade) on high-value business tables so a mistaken tenant drop does not wipe production data.  
- **Hard delete** (if ever required): explicit runbook, legal hold check, **two-person** approval, backup snapshot.

---

## 7. Auth and tenant context strategy

### 7.1 Trust model (non-negotiable)

**Untrusted inputs:** `tenant_id` or `tenant_slug` from query/body (easy to spoof).  
**Trusted inputs (web):** Resolve hostname from **`Host`**, or on Vercel **`x-forwarded-host`** (first value) **only when** the request is known to come from the platform edge (Next.js on Vercel)—**never** trust `x-forwarded-host` from arbitrary clients on unproxied routes. Normalize to lowercase hostname without port.  
**Trusted inputs (mobile):** Not the client’s claimed tenant alone—**verify** against `user_tenant_roles` or resource `tenant_id` for privileged operations.

### 7.2 Do not rely on `tenant_id` permanently in JWT as sole truth

**Decision:** **Do not put `tenant_id` in JWT as the long-lived source of tenant.**

**Why:** Users may belong to multiple tenants; switching tenant would require token refresh churn; stale JWT tenant is a common footgun.

**Instead:**

1. **Web session:** Resolve tenant from `Host` every request at edge/server; attach `tenant_id` to **request context** (headers downstream within Next).  
2. **Mobile:** Persist **last active tenant** in secure storage; on each session, **revalidate** membership for admin routes.  
3. **Optional short-lived claim:** For RLS-heavy direct PostgREST from clients, use **Supabase custom claims** or **request header** set only by **trusted server** paths—not arbitrary clients.

**Practical RLS pattern for Phase 1:** Prefer **server-side** Supabase clients (service or user JWT) where API routes enforce `tenant_id` filters; introduce DB session variable `app.current_tenant_id` only via **SECURITY DEFINER** RPC if you need stricter RLS on direct client reads.

### 7.3 Multi-tenant users and cross-border customers

**Customers (normative):**

- **Global identity:** One `auth.users` / `users` row; **not** duplicated per tenant.  
- **Not tenant-locked:** A South African user may open **`beautonomi.co.uk`**, search UK providers, and complete checkout **in the UK tenant** using the **same account**. A UK user in South Africa does the inverse on **`beautonomi.co.za`**.  
- **Transactional truth:** Every **booking** has **`tenant_id` = booking tenant** (market where the service is sold). Payments, invoices, refunds, and disputes **follow that `tenant_id`**.  
- **Wallets / loyalty / promos:** **Tenant-scoped** per §5.2; balances do **not** travel with the user across tenants unless a **future** explicitly designed product says otherwise.

**Admins:** **Many-to-many** via `user_tenant_roles`; **no** automatic cross-tenant access from customer travel patterns.

**Impersonation / support:** If it exists, must log **target tenant_id** explicitly.

### 7.3.1 Home tenant vs active tenant vs booking tenant (decisive)

| Concept | Purpose | Hard rule |
|---------|---------|-----------|
| **Home / preferred tenant** | Suggestions (language, currency **display** defaults, marketing); optional `preferred_home_tenant_id` (§6.2.1) | **Never** blocks checkout in another tenant. |
| **Active tenant** | Current browse/search/checkout context: **web hostname** or **explicit app switch** | All **new** marketplace reads/writes for discovery use this tenant **until** checkout creates a booking with that tenant. |
| **Booking tenant** | Stored on `bookings.tenant_id` | **Checkout, PSP, tax, legal, refunds** for that purchase use **booking tenant**, not home tenant. |

**Pricing and compliance:** Always from **active tenant** at discovery time (which equals booking tenant once the booking is for that market). **Home tenant** may only pre-fill **non-binding** UI defaults; server **re-validates** against active/booking tenant on submit.

### 7.3.2 Booking tenant timezone (normative)

**Decision:** For **marketplace scheduling and post-booking operations**, the **booking tenant’s** configured timezone (e.g. `tenants.default_timezone` / tenant legal business timezone) is the **authoritative interpretation** of **calendar dates and local cutoffs** for that booking—unless the UI **explicitly** labels another timezone (e.g. “Your device time”).

**Applies to:**

- **Availability and slot generation** for services sold under that tenant.  
- **Booking start/end** display in customer and provider surfaces **by default** (store **`timestamptz`** in UTC; convert using **booking tenant** TZ for “local” labels).  
- **Cancellation / reschedule policy windows** (e.g. “cancel before 24h”)—compute cutoffs from **booking tenant** rules and local policy text.  
- **Reminder and lifecycle notifications** (cron, queue)—schedule and word “today / tomorrow” relative to **booking tenant** unless template explicitly uses UTC/device.  
- **Invoices, receipts, and settlement-period wording** where a **business calendar date** is implied—anchor to **booking tenant** unless regulation requires customer-local display (then **show both**).

**Provider operational reality:** Staff may work in another TZ; **product copy** should still tie policy to **booking tenant** to avoid cross-border disputes.

### 7.4 Creation and mutation guardrail

- **No tenant-bound row is created** without a **resolved `tenant_id`** from trusted context (web host, webhook/account mapping, validated job payload, or server-verified mobile session for that operation).  
- **Cross-tenant writes** (e.g. admin acting on another tenant) require **`global_superadmin`** or explicit cross-tenant tooling—never implicit defaults.

### 7.5 Supabase Auth and multi-domain redirects

- **Redirect allowlist:** Register **every production customer/provider domain** (and `www` variants) in Supabase Auth **Redirect URLs**; include mobile deep-link schemes if magic links / OAuth return to the app.  
- **Site URL:** Keep a **primary** Site URL for Supabase dashboard defaults; **per-request** redirect targets should still use the **user’s current host** (or explicit `redirect_to` validated against allowlist).  
- **Email links** (password reset, magic link, confirm): template or server must build links using **tenant primary domain** when the user’s intent is market-specific (avoid always sending `beautonomi.com` for a `.co.uk` signup).  
- **Same user, multiple tenants:** Auth identity is global; **authorization** remains `user_tenant_roles` + RLS—see §4.2.

### 7.6 Migrating from `users.role` to `user_tenant_roles` (pragmatic)

Today many checks use **`users.role`** (e.g. `superadmin`, section admins). **End state:** admin authorization for tenant-scoped admin is **`user_tenant_roles`** only; **`users.role`** may remain for **non-tenant** concepts (`customer`, `provider_owner`) or be deprecated in favor of explicit mappings—**pick one strategy and document it**.

**Recommended low-churn path:**

1. **Dual-read period:** if `user_tenant_roles` has rows for `(user, tenant)`, use them for admin section checks; else fall back to legacy `users.role` **only for the legacy default tenant**.  
2. **Backfill:** for each existing `superadmin`, insert `tenant_superadmin` on the **legacy tenant**; for section admins, insert scoped rows.  
3. **Cutover:** remove fallback once all admins have tenant rows; **global_superadmin** remains a small explicit set (optional separate flag or single global table).

### 7.7 Cross-tenant browsing and booking rules (v1 — simple and safe)

**Web**

- **Active tenant** = **resolved from `Host`** (§7.1). Customer on UK site sees **UK index, UK search, UK providers only**—**no silent mixing** of ZA inventory into UK HTML/SEO surface.  
- **Deep links** always set active tenant from link host; share URLs stay **tenant-canonical** for SEO.

**Mobile**

- **Default active tenant** = §12.0 order (deep link → last active → bootstrap).  
- **v1 recommendation:** **Single active tenant at a time** for browse/search; **no global mixed search index** until infra is ready. User **explicitly switches market** (picker or “Shop in United Kingdom”) to change active tenant—reduces accidental checkout in wrong currency/PSP.  
- **Banner:** If `last_active_tenant ≠ preferred_home_tenant` (or device locale differs), show non-blocking **“You’re shopping in {market}”** with **switch** CTA.

**Booking creation**

- **`bookings.tenant_id`** = **`providers.tenant_id`** for the booked provider (must match active tenant for customer flows unless a **future** cross-tenant catalog is introduced).  
- Server rejects booking if client-supplied tenant does not match provider’s tenant.  
- **Service / visit addresses** (customer location, delivery, mobile service area): validated per **§6.2.2** against **booking tenant** and provider rules—saved addresses from another tenant are **not** implicitly valid.

**Search (within v1)**

- **Tenant-partitioned indexes:** Search queries **always filter `tenant_id = active_tenant`**. Easiest operationally: same DB, **leading index** `(tenant_id, …)` on search vectors or geospatial queries.  
- **Cross-tenant “explore the world”** search is **not** required for v1; add later as an **explicit** product with **per-tenant result sections** and **tenant-labelled** navigation to checkout.

**Coherent history**

- **Account → Bookings** API: `WHERE customer_id = :user` **across tenants**, ordered by date; each row includes `tenant_id`, currency, and **deep link** to the correct domain for **manage/cancel** actions for that booking.

### 7.8 Booking actions when active tenant ≠ booking tenant (normative)

**Problem:** A user’s **active tenant** (hostname / last app market) can differ from an existing booking’s **`bookings.tenant_id`** (e.g. opened “my bookings” on `.co.za`, taps a **UK** booking).

| Surface | Read booking detail | Mutate (cancel, reschedule, pay balance, dispute) |
|---------|---------------------|-----------------------------------------------------|
| **Web** | **Allowed** if authenticated customer owns row; UI **MUST** show **booking tenant** badge and use **booking tenant** canonical domain for **pay/manage** links where possible. | **MUST** either (a) require user on **hostname** that resolves to **`booking.tenant_id`**, or (b) use a **server route** that loads booking by id, sets context from **`booking.tenant_id`**, and performs mutation **without** trusting session active tenant, or (c) one-time **signed** deep link with booking scope. **Forbidden:** apply mutation using only **active tenant** from `Host` if it **≠** `booking.tenant_id`. |
| **Mobile** | Same as web; **deep link from email** (§12.7) **MUST** switch **active tenant** to booking tenant **or** open WebView/checkout on **booking tenant** domain **before** payment capture. | Same **(a)(b)(c)** as web; **never** send mutation to an API that scopes only by **client-supplied** active tenant. |

**Provider app:** Provider operations **always** scope by **`providers.tenant_id`** / staff membership — **ignore** customer **active tenant** (§12.6).

### 7.9 Concurrency, races, impersonation, and analytics conflicts

**Tenant switch + async requests**

- **Rule:** On **active tenant** change, **cancel or ignore** in-flight **catalog/search** responses whose resolved tenant does not match **current** active tenant (compare `tenant_id` on response metadata or request id). **Cart** cleared per §12.7.  
- **Implementation:** AbortController / request sequence numbers on mobile; web router navigation cancels prior fetches.

**Double-submit / idempotent booking**

- **Rule:** Booking and payment creates **MUST** use **idempotency keys** scoped at minimum by **`user_id` + tenant + client intent`** to avoid duplicate rows when retries cross regions.

**Admin / support impersonation**

- **Rule:** If impersonation exists, **every** mutating action **MUST** log **`actor_user_id`**, **`target_tenant_id`**, **`target_user_id`** (if any), and **booking id** in **`tenant_audit_log`** (or equivalent). **Never** widen RLS solely because actor is admin without **explicit** tenant target.

**Provider user in two tenants**

- **Rule:** Same human may have **two provider rows** in two tenants (§6.7). **Session** for provider app **MUST** resolve **provider_id → tenant_id** server-side; **no** “global provider dashboard” without explicit product and **per-tenant** authorization.

**Analytics attribution conflicts**

- **Rule:** Funnel events use **`active_tenant`**; **purchase/refund** events use **`booking_tenant`** **only** for money. Dashboards **MUST NOT** sum `active_tenant` revenue across tenants for P&L. **Conflict case** (user browses UK, completes ZA booking via link): **money → ZA**; funnel may show UK **browse** + ZA **convert** — document as **expected**, not an error.

---

## 8. RLS model

### 8.1 Principles

- **Every tenant-bound table:** `tenant_id NOT NULL` (end state; see **§6.6**) + RLS.  
- **Policies** compare row `tenant_id` to **trusted** tenant context.  
- **Secrets:** no policy allows `authenticated` read on `tenant_secrets`.

### 8.2 Example policy template

```sql
alter table public.providers enable row level security;

create policy providers_select_same_tenant
on public.providers for select
using (
  tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
);

create policy providers_write_tenant_admin
on public.providers for all
using (
  tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  and exists (
    select 1 from public.user_tenant_roles r
    where r.user_id = auth.uid()
      and r.tenant_id = public.providers.tenant_id
      and r.is_active = true
      and r.role in ('tenant_superadmin','admin_platform_config')
  )
)
with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
```

**Implementation note:** Set `app.current_tenant_id` in a thin **Postgres RPC wrapper** or **Supabase transaction** from trusted server code for paths that use user JWT + RLS. For pure Next API routes using **service role**, RLS may be bypassed—**those routes must filter `tenant_id` explicitly** (document as “trusted server paths”).

### 8.3 Global superadmin

Either:

- **A)** Separate service-role-only admin APIs (simplest), or  
- **B)** RLS exception for `global_superadmin` via membership table—**heavier**.

**Recommendation:** **A** for v1: global operations use **explicit** service-role routes with **extra guard** + audit.

### 8.4 Customer reads across tenants (bookings, reviews, wallet)

**Problem:** If **all** `SELECT` policies require `row.tenant_id = app.current_tenant_id`, a customer **cannot** list UK bookings while the web session is on ZA host.

**v1 pattern (decisive):**

- **Marketplace tables** (`providers`, public catalog): remain **tenant-scoped** to **active tenant** (host or enforced `tenant_id` on API).  
- **Customer-owned booking rows:** allow `SELECT` where **`customer_id = auth.uid()`** regardless of session tenant (optionally still **restrict columns** if sensitive). **Writes** (cancel, reschedule) validate **`booking.tenant_id`** matches the **tenant context of the mutation** (e.g. user opened booking detail via that tenant’s domain or app switched to that tenant) **or** use a **booking-scoped token** path that loads booking first then sets tenant from row.  
- **Aggregated “my account”** routes: prefer **Next.js API + service role** with **explicit** `auth.getUser()` then `WHERE customer_id = user` and **per-row `tenant_id`** in response—simplest to audit.

**Never** use this pattern for **admin** or **provider_staff** lists—those stay **tenant-admin-scoped**.

### 8.5 RLS vs API enforcement (single picture)

| Layer | Responsibility |
|-------|------------------|
| **RLS** | **Last-line defense** in Postgres for **direct** client access and mistakes; policies **MUST** eventually match §6.6 for tenant-bound tables. |
| **Next.js Route Handlers / server actions** | **Primary** enforcement for most flows today: resolve tenant (§7.1), **`eq('tenant_id', …)`** on queries, **booking-first** mutations (NN-5). **Service role** bypasses RLS → **mandatory** explicit filters (**§8.2**). |
| **Expo apps** | No direct tenant trust; **Bearer** + server validation. |

**Invariant:** If a route uses **service role**, treat **RLS as off** for that path — the **handler** is the policy.

### 8.6 Common pitfalls

- **Pitfall — “RLS is enough”:** Service-role **list** endpoints without `tenant_id` filter → **cross-tenant leak**. **Fix:** lint/review rule for `.from(` + service client.  
- **Pitfall — `app.current_tenant_id` stale in transaction:** Set tenant session variable **per request** inside the same DB transaction as the query.  
- **Pitfall — Customer booking list via PostgREST:** If policy uses only `app.current_tenant_id`, **cross-tenant account view breaks**. **Fix:** §8.4 **trusted API** pattern or **separate** `SELECT` policy on `customer_id = auth.uid()`.  
- **Pitfall — Admin reads booking on wrong tenant:** Admin UI **must** pass **booking id** through server that checks **`bookings.tenant_id`** ∈ actor’s `user_tenant_roles`.

---

## 9. Domain and SEO strategy

### 9.1 Canonical URLs

- **Each page’s canonical** = **that tenant’s primary domain** + path.  
- **Do not** cross-domain canonical to `.com` unless the page is truly **global-only** and duplicated intentionally (rare).

### 9.2 hreflang

- Emit `hreflang` **only** where you have **true locale alternates** (same entity, different language/country URL).  
- If `.co.za` and `.co.uk` are **different markets** (not translations of same inventory), **do not** pretend they are `x-default` alternates of the same SKU—use **separate indexing** with consistent branding.

**Pragmatic default:**  
- `x-default` → **global `.com`** (if it’s the international landing).  
- Country sites: `en-ZA` → `.co.za`, `en-GB` → `.co.uk`, etc., **only for pages that are intentional alternates**.

### 9.3 Sitemaps and robots

- **`/sitemap.xml` per hostname** (or single route that emits URLs for **current tenant only**).  
- **`robots.txt` per tenant**: disallow staging, thin pages, or markets under legal hold.  
- **Avoid** one mega-sitemap listing all country URLs on one domain (duplicate signals).

### 9.4 Structured data

- `Organization` / `LocalBusiness` JSON-LD **per tenant** (address, area served).  
- **Provider** structured data uses **tenant domain** as `@id` base.

### 9.5 Duplicate content prevention

- Unique copy per market where possible.  
- No copy-paste category trees without **localized slugs** or **tenant-scoped URLs**.  
- Use **noindex** for parameterized duplicates (filters, session IDs).

### 9.6 Geo / language

- `html lang` from tenant default + user preference.  
- **Geo targeting** is primarily **domain + content**; avoid over-relying on IP auto-redirects (bad for SEO); use **banner suggestion** pattern.

### 9.7 Domain and environment operations (Vercel and non-prod)

**Production domains**

- Map **each apex + `www`** (and any marketing aliases) to the **same Vercel project** in Vercel **Domains**; point DNS (registrar) to Vercel as instructed (A/CNAME).
- **TLS:** Let Vercel issue and renew certificates per hostname; avoid custom cert management unless enterprise policy requires it.
- **Canonical host policy:** Decide per tenant whether `www` redirects to apex or vice versa; enforce **one** primary hostname per tenant in `tenant_domains.is_primary` and redirect consistently (308) for SEO.

**Preview / staging**

- **Preview deployments** (`*.vercel.app` or branch previews) must map to either:
  - a dedicated **`sandbox`** (or `disabled` for indexing) tenant, or  
  - **noindex** everywhere + `robots.txt` disallow (see below).
- **Do not** let staging URLs leak into production sitemaps or canonicals.

**Indexing and tenant lifecycle**

- **`lifecycle = sandbox`:** default **`noindex`** on HTML + `X-Robots-Tag` where applicable; sitemap empty or absent; `robots.txt` disallow all or disallow marketing paths—**product must choose one standard** and apply across all sandbox hostnames.
- **`lifecycle = suspended` / `disabled`:** maintenance or hard block at edge; **noindex**; no sitemap.
- **Non-production tenants** (preview, internal): never emit `hreflang` to production domains.

**Operational checklist**

- Register **OAuth redirect URIs** (Google Calendar, Outlook, etc.) for every production hostname that initiates OAuth.
- Keep a **single table** (`tenant_domains`) as source of truth for which hostnames are valid; edge resolution fails closed for unknown hosts.

#### 9.7.1 Next.js on Vercel (hosting & edge — implementation specifics)

These notes **narrow** §11.1 for the **actual** stack (Next.js App Router on Vercel); architecture is unchanged.

| Concern | Practice |
|---------|----------|
| **Project shape** | **One** Vercel project per deployed web app; **multiple** production domains on that project map to **multiple** `tenant_domains` rows (§9.7). |
| **Tenant resolution** | Implement **`Host` → tenant** in **middleware** or **`proxy.ts`** (existing pattern); on Vercel, prefer **`x-forwarded-host`** only as specified in **§7.1** (first hop from the platform edge, not arbitrary clients). |
| **Internal headers** | Set **`x-tenant-id` / `x-tenant-slug`** for downstream Server Components and Route Handlers; **never** accept those from external clients as authority (§13.2). |
| **Preview / branch URLs** | Map **`*.vercel.app`** to a **sandbox** tenant or **noindex** (§9.7); **do not** inherit production `tenant_id` by default. |
| **Caching** | Use **`Vary: Host`** (§14.1) on shared cache paths; ISR / `fetch` cache keys **must** include **tenant** when responses differ by market. |
| **Env vs secrets** | **Deployment** env vars (e.g. `NEXT_PUBLIC_*`, feature toggles) are **not** tenant secrets; **PSP keys** live in **`tenant_secrets`** (or provider rows) per §6.1 / §10. |
| **Regional execution** | Default Vercel region is usually sufficient for **edge middleware**; **long DB sessions** run in **Node** route handlers. Pick regions consciously if **data residency** becomes a requirement (outside this spec’s default). |

### 9.8 SEO vs logged-in cross-border users

- **Indexed pages** remain **per-tenant** (each domain’s catalog, categories, provider profiles)—**no** requirement to SEO-merge cross-border inventory.  
- A traveler from another country **still** uses the **local domain** for local SEO relevance; their **account** is global **behind** login.  
- **Logged-in** views (e.g. “my bookings”) may be **noindex** if on a generic path; **booking detail** links for actions should use **booking tenant’s** canonical domain where possible.

---

## 10. Payments and integration strategy

### 10.0 Two payment rails (do not conflate)

| Rail | Who collects | Typical UX | Configuration split |
|------|----------------|------------|------------------------|
| **Platform-collected online** | Beautonomi (marketplace checkout, holds, subscriptions) | Customer pays on web/app checkout | **Tenant** defines **allowed gateway families** + **default**; orchestrator picks adapter; secrets in **`tenant_secrets`** |
| **Provider-collected in-person / POS** | Provider (terminal, in-salon card, cash policy) | Provider app / terminal | **Tenant** defines **allowed POS / in-person families** + **default** where platform mediates webhooks; **provider** toggles **enabled methods** **inside** tenant allow-list (e.g. “Yoco enabled”, “cash enabled”) |

**Rules**

- **Tenant config** = **policy and allow-list**: which **gateway families** (e.g. `paystack`, `stripe`, `yoco`) are **permitted** in this market, and the **default** family for online vs in-person when multiple are allowed.
- **Provider config** = **eligibility within policy**: which **methods** or **provider-specific integrations** are **on**, subject to tenant allow-list (e.g. provider cannot enable Stripe in a tenant that only allows Paystack).
- Shared app logic **never** assumes a single global PSP: call **`PaymentOrchestrator.forRail(tenantId, rail)`** where `rail` is `online_checkout` | `inperson_pos` (names aligned to code).

### 10.1 Payment gateway abstraction (required)

**Ports (conceptual):**

```ts
type TenantId = string;
type PaymentRail = "online_checkout" | "inperson_pos";

interface PaymentGateway {
  readonly id: "paystack" | "stripe" | "yoco" | string;
  readonly railFamilies: PaymentRail[]; // which rails this adapter can serve
  createCheckoutSession(input: CheckoutInput & { tenantId: TenantId }): Promise<CheckoutResult>;
  verifyWebhook(req: WebhookRequest): Promise<WebhookEvent>;
  refund(input: RefundInput & { tenantId: TenantId }): Promise<RefundResult>;
}

interface PaymentGatewayRegistry {
  forTenantAndRail(tenantId: TenantId, rail: PaymentRail): PaymentGateway[]; // ordered: primary, fallback
}
```

**Config in `tenant_settings.settings.payments` (public-facing flags only):**

```json
{
  "payments": {
    "online_checkout": {
      "allowed_gateway_families": ["paystack", "stripe"],
      "default_gateway_family": "paystack"
    },
    "inperson_pos": {
      "allowed_pos_families": ["yoco"],
      "default_pos_family": "yoco"
    }
  }
}
```

**Provider-side overlay (example, stored on provider or `provider_payment_preferences`):**

```json
{
  "enabled_online_methods": ["card"],
  "enabled_inperson_methods": ["yoco_terminal", "cash"],
  "gateway_family_preferences": { "inperson_pos": "yoco" }
}
```

Validation: **reject** provider preferences that reference a **family** not in **tenant** `allowed_*_families`.

**Secrets:** only in `tenant_secrets` (platform-mediated keys) or **provider-owned** integration rows for true provider-direct PSP accounts—**never** in `NEXT_PUBLIC_*` or public `tenant_settings`.

### 10.2 Gateway selection

1. Resolve **`tenant_id` for payment** = **`booking.tenant_id`** for booking checkout (after booking exists) or **active tenant** for holds/cart **before** booking is finalized—**must** match provider’s tenant at commit time. Web: also from `Host` for pre-booking flows; it should equal active tenant.  
2. Determine **rail** (`online_checkout` vs `inperson_pos`).  
3. Load **tenant** allow-list + default for **that** `tenant_id`.  
4. Merge **provider** enabled methods / preferences where applicable; **intersect** with tenant allow-list.  
5. Select **primary** adapter; if disabled or unhealthy (**feature flag**, §20.1), **fallback** only within **same rail** and **still** within tenant allow-list.

### 10.3 Webhooks

- **Route:** e.g. `/api/webhooks/payments/[gateway]` **or** single route that inspects signature headers.  
- **Resolve tenant** by:  
  - **Preferred:** gateway account id / webhook id → stored mapping table, or  
  - **Subdomain per tenant** (more DNS), or  
  - **Path prefix** `/api/webhooks/stripe/[tenant_slug]` (simple, explicit).  

**Verification:** HMAC/signature using **that tenant’s** secret only.

### 10.4 Idempotency and reconciliation

- Store **raw webhook events** with `event_id` unique per `(tenant_id, gateway, event_id)`.  
- Processing is **idempotent**; ledger updates use **unique constraints** on provider transaction IDs **scoped by tenant**.  
- Nightly **reconciliation jobs** per tenant: gateway report vs `booking_payments` / `finance_transactions`.

### 10.5 Avoid hardcoding PSP in shared logic

- **`lib/payments/*`:** split into **`adapters/`** (paystack, stripe, yoco) + **`orchestrator.ts`** (select gateway).  
- Shared code operates on **normalized types** (`Money`, `PaymentIntent`, `Refund`).

### 10.6 Non-payment integrations (capability model + config)

**Authoritative metadata:** `integration_capabilities` (§6.5) defines **`integration_key`**, **`scope`**, **`secret_owner`**, **`fallback_allowed`**, and documented **public** config hints.

**Effective configuration (merge order):**

1. **Global platform default** (env / `platform_settings` / `platform_secrets`) — only where `fallback_allowed = true` on that capability.  
2. **Tenant override** — `tenant_settings` (public) + `tenant_secrets` (private).  
3. **Provider overlay** — only for rows where `scope = provider` (e.g. SMS), or provider-specific OAuth tokens; still **scoped under** a `tenant_id` on the provider row.

**Concrete mapping (see §6.5 table):** payments (online vs POS), maps, messaging (push vs SMS), analytics, KYC/fraud, calendar—each has explicit **scope** and **secret_owner**; implement validators so code cannot attach a tenant secret to a `provider`-scoped capability without an explicit design change.

**Server-only rule:** Any module that needs secrets runs **only** in Route Handlers / server actions / trusted server paths with **no** secret export to `NEXT_PUBLIC_*`.

### 10.7 Travelers, bookings, and financial isolation

**Hard rules**

- **Every booking** has **exactly one `tenant_id`** for its entire lifecycle.  
- **Online checkout** for that booking uses **that tenant’s** PSP config, **tax rules**, and **compliance** (§10.2).  
- **Refunds, chargebacks, disputes, invoices, and internal ledger postings** remain **scoped to booking tenant**; reporting rolls up **per tenant** and **globally** by summing tenants without merging ledgers.  
- **Customer wallet / store credit** (if any): **balance is per `(user_id, tenant_id)`** (§5.2). A traveler’s UK credit **does not** apply to ZA checkout unless product builds an explicit **cross-tenant** product with legal sign-off—**not v1**.

**Narrative for support**

- “One account, many trips”: support sees **global identity** but each booking card shows **market (tenant)** for **who gets paged** (tenant ops) and **which PSP** to check.

### 10.8 Implementation notes (payments)

- **Webhook tenant resolution** **MUST** be implemented **before** handler branches on business logic (§10.3); add **integration test** per gateway with **wrong** secret.  
- **Orchestrator** entry point **SHOULD** accept **`tenantId: UUID`** + **`rail`** only; **gateway family** comes from **merged** tenant + provider config — **not** from client string.  
- **DB:** `payment_id` / PSP ids **SHOULD** be **unique per `(tenant_id, gateway, external_id)`** once schema allows (§10.4).

### 10.9 Common pitfalls (payments)

- Using **active tenant** for **refund** on an existing booking → **wrong PSP**. **Always** `booking.tenant_id`.  
- Single webhook URL without tenant mapping → **ambiguous secret**. **Fix:** path prefix or account mapping table.  
- **POS** and **online** sharing one adapter instance → **wrong rail**. **Fix:** `forTenantAndRail` (§10.1).

---

## 11. Web app implications

### 11.1 Edge / middleware / proxy

- **Single choke point** (existing `proxy.ts` or middleware): normalize host → load `tenant_domains` (cached) → set **internal headers** `x-tenant-id`, `x-tenant-slug`.  
- **Lifecycle:** if `disabled`/`suspended`, return static maintenance or 403 per policy.  
- **Vercel deployment details:** **§9.7.1**.

### 11.2 `metadataBase`, sitemap, robots

- Replace **single** `NEXT_PUBLIC_SITE_URL` assumptions with **tenant-derived base URL** from resolved tenant primary domain.

### 11.3 Admin UI

- **Tenant context** from host (same as customer site for that domain).  
- **Optional:** global admin on separate hostname (`admin.beautonomi.com`) with **tenant picker** + membership check—only if needed; else **country domain admin** is simpler.

#### 11.3.1 Superadmin and back-office portal (`/admin`) — multi-tenant coverage

**Code anchor (today):** Next.js app routes under **`apps/web/src/app/admin/**`**; shell layout allows **`ALL_ADMIN_ROLES`** (`superadmin`, section **`admin_*`**, `support_agent`, `admin_support`, etc.—see `lib/admin-sections.ts`). Many **control-plane** pages additionally require **`superadmin`** only. This subsection **does not** replace that code; it states **how the portal must behave** once multi-tenant data exists.

**Tenant resolution (same rules as marketplace):**

- **Preferred:** Admin used on a **tenant’s primary hostname** (e.g. `admin` path or subdomain policy per product)—**`Host` → `tenant_id`** via §11.1 / §7.1.  
- **Alternative:** **Internal-only** hostname + **server-trusted** tenant picker (selection stored **server-side** or validated on each request)—**never** trust a client-only `tenant_id` for **mutations** (NN-2).  
- **Legacy `default_tenant`:** **not** a silent fallback for admin after cutover (NN-8, §6.2).

**Role mapping (align UI with §4.2 / §7.6):**

| Today (`users.role` pattern) | End state |
|------------------------------|-----------|
| **`superadmin`** (global-style) | Split: **`tenant_superadmin`** per tenant **or** small **`global_superadmin`** set for **explicit** cross-tenant tooling (§4.2, §8.3). |
| **`admin_finance`**, **`admin_trust`**, **`admin_content`**, … | **`user_tenant_roles`** rows **per tenant**; nav sections in `ADMIN_SECTION_ROLES` stay **conceptually** the same but **scoped** by `tenant_id`. |
| **`support_agent`**, **`admin_support`** | Tenant-scoped support queues where data is tenant-bound; **platform** queue for pure auth per §13.4. |

**Portal surfaces → tenant scope (normative checklist):**

Use this when migrating `/api/admin/*` and pages: **every** list/detail **MUST** apply the correct scope; **`global_superadmin`** bypass **only** on routes **listed in §8.3** + **audit** (§6.4).

| Portal area (illustrative — matches current nav sections) | Scope | Rule |
|-----------------------------------------------------------|-------|------|
| **Overview / dashboard / reports** (`/admin/dashboard`, `/admin/reports/*`, `/admin/analytics`, revenue, bookings reports, provider reports, customers reports, gift-card reports, Yoco reconciliation) | **Resolved admin `tenant_id`** | Aggregate **only** rows with that `tenant_id`. **Global** rollups across tenants = **`global_superadmin`** + dedicated audited routes **only**. |
| **Providers & operations** (`/admin/providers`, `/admin/bookings`, service zones, fees, addons, catalog ops, gods-eye) | **Tenant** | **Open-by-id** flows **MUST** validate **`providers.tenant_id`** or **`bookings.tenant_id`** ∈ actor’s `user_tenant_roles` (§7.8 pattern for booking). |
| **Finance** (`/admin/finance`, `/admin/payouts`, `/admin/refunds`, `/admin/disputes`, `/admin/billing`, platform fees) | **Booking / payout tenant** | Money paths **follow booking or payout row `tenant_id`** (NN-4, §10.7); admin host tenant must **match** or use **global** audited path. |
| **Users & trust** (`/admin/users`, verifications, user-reports, security) | **Global identity + tenant-scoped actions** | **Profile** is global (§5.0); **moderation / trust actions** on marketplace data **scoped** to **that data’s `tenant_id`**; export/delete jobs per tenant (§5.1). |
| **Content & catalog** (`/admin/content`, global categories, learning, custom fields) | **Mixed** | **Tenant** CMS / legal / marketing copy per domain; **true global reference** (e.g. ISO codes) stays unscoped **only** where it is not a market identifier (§6.3 for keys that **are** market identifiers). |
| **E-commerce** (products, returns, gift cards) | **Tenant** | Promos, gift cards, SKUs — **tenant-scoped** (§5.2, §6.8 W2). |
| **Marketing & comms** (notifications, templates, broadcast, automations, loyalty, gamification) | **Tenant** | Template **keys** and sends **per tenant** (§6.8 W3); links use tenant base URL (§11.5). |
| **Integrations & dev** (webhooks, API keys, Mapbox, Sumsub, Amplitude admin, control-plane integrations) | **`integration_capabilities`** (§6.5) | **Tenant** secrets in **`tenant_secrets`** where `secret_owner = tenant`; **platform** env only where `scope = global` and **`fallback_allowed`** — migrate toward tenant rows as markets go live (§10.6). |
| **Operations** (monitoring, system health, audit logs UI, maintenance, control-plane modules — ads, ranking, safety, AI, on-demand) | **Read** may be platform-wide; **mutations** **tenant-scoped** where they affect market config | **Kill switches** §14.6 + **§20.1**; **tenant_audit_log** §6.4 for admin writes. |
| **Platform config** (feature flags UI, app version, referrals, team permissions, settings) | **§20.1** + **tenant_settings** | Global default **+** tenant override; **team permissions** → `user_tenant_roles` per tenant (§7.6). |

**`/api/admin/*` handlers:**

- **Same** trust model as §7.1 / NN-2: resolve **`tenant_id`** from **Host** / internal context **before** applying body params.  
- **Service-role** admin routes: §8.5–8.6 — **explicit** `tenant_id` filter on every query.  
- **Cross-tenant search** (e.g. user lookup by email across tenants): **`global_superadmin` only** + **audit** + rate limits; **not** available to `tenant_superadmin`.

**Relation to provider portal:** Provider-facing **`/provider`** and **`/api/provider/*`** use **`provider_id`**, not customer active tenant (Appendix B). **Superadmin** acting on a provider **without** a provider row **requires** explicit `provider_id` + tenant check (Appendix B.2) — admin UI should use **booking/provider id** resolution, not “assume my host tenant.”

#### 11.3.2 `/api/admin` route enumeration (maintenance)

- **Full sorted list:** **Appendix C** — **233** `route.ts` entries under `apps/web/src/app/api/admin/` (as of spec **v2.6.4**).  
- **Summary:** **Appendix C §C.1** — counts by **first path segment** after `/api/admin/` (e.g. `content` 26, `control-plane` 16).  
- **Regeneration:** Run the PowerShell snippet in **Appendix C** to refresh `docs/_admin_api_routes_snapshot.txt`, then `node docs/scripts/insert-appendix-c-admin-routes.mjs` to re-embed the appendix (keeps **§C.1** counts and **§C.2** list in sync).  
- **Use in delivery:** Tick off **tenant filter / audit** per route during migration; **high-count** prefixes (`content`, `control-plane`, `providers`, `users`, `service-zones`) warrant **batch** refactors and shared middleware.

### 11.4 Cron jobs

- Jobs iterate **active tenants** or query by `tenant_id` on rows; **never** assume single country.  
- Pass `tenant_id` into job payload for fan-out.

### 11.5 CORS, mobile API, and embeds

- **CORS:** Extend allowlists (e.g. existing dev origins in `proxy.ts` patterns) so **production** Customer/Provider app WebViews or local dev still work; any **origin allowlist** must be reviewed when adding country domains (usually API is same origin as web; mobile uses Bearer tokens—confirm actual CORS needs per route).  
- **Email / SMS / push deep links:** Notification and cron-generated links must use **tenant-aware base URL** (`tenant_domains` primary or per-tenant setting), not a single global `NEXT_PUBLIC_SITE_URL` default.  
- **Third-party embeds** (maps, chat widgets): load only integrations **enabled** for the resolved tenant (§10.6).

### 11.6 Search, discovery, and featured placements (v1)

**Index model**

- **Operational default:** Search indexes and list queries are **partitioned by `tenant_id`** in the database (leading index `(tenant_id, …)`). **Each request** passes **active tenant** (from host); **no unfiltered cross-tenant** catalog queries in v1.

**Airbnb-like “feel” without global index (v1)**

- **Conversion is always tenant-local:** User discovers on **UK** site → all results `tenant_id = UK` → checkout **UK**.  
- **Cross-border discovery** is achieved by **user navigation** (switch market / open other domain / deep link)—not by blending inventories in one SERP.  
- **Featured placements, ranking, ads:** Configured **per tenant**; a provider in ZA never appears in UK home **unless** they have a **UK tenant provider row** (§6.7).

**Future (explicit phase 2+ optional)**

- **Federated search:** API returns **sections** per tenant with clear **labels**; each result links to **tenant-scoped** URL; still **one checkout tenant per booking**.

---

## 12. Mobile app implications (one Customer, one Provider)

### 12.0 Runtime tenant resolution order (normative)

Resolve **active tenant** in this **strict order**; stop at the first step that yields a **valid** tenant (known hostname mapping + tenant `active` / not `disabled`):

1. **Deep link host** — If the app was opened via a universal/app link, use the **URL’s hostname** to resolve tenant (same mapping as web `tenant_domains`). Invalid or unknown host → fall through.  
2. **Last active tenant** — If persisted secure storage contains a `tenant_id` (or slug) from a prior session, use it **only after** a lightweight validity check (e.g. tenant still exists and `lifecycle` allows app use); if stale or suspended/disabled → fall through.  
3. **Public bootstrap / discovery** — Call **`GET /api/public/tenant-context`** (or config bundle with host header if web API expects `Host`) using **default API base** or **first-run country picker** result; this step establishes tenant when there is no deep link and no valid last tenant.  
4. **Privileged actions** — For **admin**, **payout**, **sensitive provider settings**, or **cross-tenant** surfaces: **always** revalidate **`user_tenant_roles`** (or equivalent) **server-side** on each request; **never** trust only the client’s cached `tenant_id`.

**Implication:** Client-held `tenant_id` is a **hint** for UX and public reads; **authorization** and **writes** are anchored on **server-resolved tenant** + **membership**.

### 12.1 Deep linking

- **Add all production hostnames** to `associatedDomains` / Android intent filters (same as today’s pattern, expanded).  
- Incoming URL host → resolve tenant (client calls **`GET /api/public/tenant-context`** with appropriate host context or uses an embedded hostname → tenant map from bootstrap).

### 12.2 Bootstrap

1. Apply **§12.0 resolution order** to determine candidate tenant.  
2. Fetch **tenant public bundle** (settings, locale, legal version, flags) for that tenant.  
3. Store `activeTenantId` in memory + secure storage.

### 12.3 Auth callbacks

- OAuth redirect URIs registered for **all** domains **or** single auth domain with **state** carrying intended tenant—**simplest** is multi-domain redirects matching web.

### 12.4 Region / tenant switching

- Explicit UX; on switch: **clear** React Query/SWR caches, **invalidate** auth-dependent queries, **refetch** config bundle, **reset** navigation stacks where needed.  
- **Cart / draft booking:** Apply **§12.7 wrong-market cart protection** on every switch—**same rule on web** when hostname or explicit market change implies a new **active tenant**.

### 12.5 Minimize complexity

- **No** second navigation tree per tenant.  
- **One** API client wrapper: `withTenantHeaders(getTenantId())` for mobile calls where server expects header (or embed in path for read-only public APIs).

### 12.6 Travelers and session continuity

- **Auth session is global** — Logging in once keeps the same refresh/access pattern; **changing active tenant does not** log the user out.  
- **Active tenant switch** (§12.4) updates **browse/search** context only; **tokens** remain identity-scoped.  
- **Booking history:** **Account** tab may call **`GET /api/me/bookings`** (or equivalent) returning **all tenants**; UI groups or badges **tenant name + currency**.  
- **Provider / admin flows** (provider app): **tenant** comes from **provider’s `tenant_id`** and **`user_tenant_roles`**—**not** from customer active tenant; a user who is both customer and provider sees **strict separation** in app mode or shell.

### 12.7 UX: market switch, checkout safety, and wrong-market prevention

- **Market switcher:** Explicit entry in nav; on select, set **active tenant**, refetch config (§12.4), show toast **“You’re now shopping in {United Kingdom} — prices in GBP”**.  
- **Banner:** When device locale or SIM country **≠** active tenant locale, show **non-blocking** banner: **“Looks like you’re in {X}. Shop in {X}?”** (deep link to that tenant’s domain or in-app switch).  
- **Checkout confirmation:** Second line showing **market**, **currency**, and **tax/PSP** summary from **active/booking tenant** before pay—reduces wrong-market mistakes.  
- **Deep link from email:** Open **booking tenant** context for that booking’s **manage** flow even if user’s last active tenant was elsewhere (resolve tenant from **booking id** server-side).

**Wrong-market cart / draft booking protection (v1 — simplest safe behavior):**

- If **active tenant** changes (explicit switch, deep link to another host, or web navigation to another tenant domain), any **in-progress checkout cart**, **draft booking**, or **unpaid hold** that was built under a **different** `tenant_id` **must** be **cleared or abandoned**—or the user shown a **blocking confirmation**: **“Switching market clears your cart”** with **Continue** / **Cancel**.  
- **No silent migration** of cart line items, selected services, applied promos, or addresses across tenants in v1 (prices, PSP, tax, catalog, and `provider_id` validity all change).  
- **Future:** An explicit **“Move cart to {other market}”** product requires **re-pricing**, **re-validation** against the target tenant’s catalog, and **new** consent if needed—**not** v1.

### 12.8 Currency and language messaging

- **Display currency** follows **active tenant** defaults unless user picks a **supported** display option **and** product explicitly supports display conversion (optional); **charged currency** is always **booking tenant settlement currency**.  
- If **home tenant** suggests ZAR but user shops UK, show small helper text: **“You’ll pay in GBP (UK)”**—avoid silent assumptions.

### 12.9 Implementation notes & pitfalls (mobile)

- **Implementation:** Persist **`last_active_tenant_id`** only **after** successful **tenant-context** validation; on **401** from tenant-scoped route, **invalidate** cached tenant and rerun §12.0.  
- **Pitfall — Stale cache after switch:** User switches tenant but **React Query** still shows prior catalog → **violates** NN-6 visually. **Fix:** `queryClient.removeQueries()` for marketplace namespaces on switch (§12.4).  
- **Pitfall — Booking email link:** Opens app in **wrong** active tenant → user taps pay and hits **wrong** PSP context. **Fix:** §12.7 deep link resolves **booking tenant** **before** checkout UI.  
- **Pitfall — Provider mode:** Customer **active tenant** bleeds into provider shell. **Fix:** separate query client subtree or **hard** navigation reset when switching **app role** (§12.6).

---

## 13. API contract changes

### 13.1 New / updated endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/public/tenant-context` | Host → tenant slug, locale, currency, legal versions, public integration flags |
| `GET/PATCH /api/admin/tenant/settings` | Tenant-scoped settings (replaces implicit global for that host) |
| `POST /api/webhooks/payments/:gateway` | Signature verify + idempotent dispatch |
| `GET /api/me/bookings` (or equivalent) | **Cross-tenant account view:** `WHERE customer_id = user` with **per-row `tenant_id`**, deep links to correct domain; **writes** use **§7.8** + **§8.4** (never active-tenant-only scope) |

**Existing `/api/admin/*`:** **Appendix C** lists **every** path; **all** must follow **§11.3.1** (resolved admin tenant, **`global_superadmin`** rules, service-role filters §8.6). **Cross-tenant** admin search = **explicit** audited endpoints only (see **`/api/admin/search`**, **`/api/admin/users/search`** in Appendix C).

### 13.2 Headers (internal, set by edge)

- `x-tenant-id` (UUID)  
- `x-tenant-slug`  

**Clients must not** be the sole source of truth for these on mutating admin routes.

### 13.3 Errors

Standardize: `TENANT_NOT_RESOLVED`, `TENANT_INACTIVE`, `TENANT_FORBIDDEN`, `LEGAL_REACCEPT_REQUIRED`.

### 13.4 Notifications, support, and CRM context

**Notifications**

- **Booking lifecycle** (confirm, remind, change, cancel): template + link base URL + PSP callbacks use **`booking.tenant_id`** (booking tenant).  
- **Marketing / lifecycle** (win-back, newsletters): may target **`preferred_home_tenant_id`**, **`last_active_tenant`**, or **booking history tenants**—**document** rules; respect **consent** per §5.1 / **Cross-Border Customer Principles** item 8.

**Support tickets**

**v1 ownership (decisive):**

| Issue class | Owner | `tenant_id` on ticket |
|-------------|--------|------------------------|
| **Pure account / auth** | **Platform** (global queue / tooling) | **Null** or dedicated **`platform`** sentinel—**never** infer from last active tenant alone. Examples: cannot log in, MFA reset, email verification, suspected duplicate account, device-only bug with no booking. |
| **Booking-related** | **Booking-tenant support** (tenant ops / BPO / tenant admin tooling) | **`bookings.tenant_id`** for the booking under discussion. Examples: refund, reschedule, dispute, service quality, no-show, charge inquiry **when tied to a booking**. |
| **Gray area** | If a **booking id** is known → **booking tenant**; if **no booking** and issue is billing/legal wording without a transaction → **platform** first, escalate with **explicit** tenant context if product defines handoff. |

**Rules:** Customer **travel** does not route support to the wrong tenant—staff tools open **booking-related** tickets under **`bookings.tenant_id`** for operational and audit alignment with the CRM dimensions below.

**CRM / segmentation (minimum dimensions)**

| Dimension | Use |
|-----------|-----|
| **Global customer id** | Deduplicate user across tenants. |
| **`customer_home_tenant`** | Personalization, marketing baseline (optional field). |
| **`last_active_tenant`** | Session/app context (event property, refreshed on switch). |
| **`booking_tenant`** | Revenue attribution, NPS after **that** trip, PSP reconciliation. |
| **`provider_tenant`** | Provider commercial reporting (unchanged). |

---

## 14. Caching, jobs, and observability

### 14.1 Cache keys

Include **`tenant_id`** and, where relevant, **`locale`**, **`currency`**, **`domain`**.  
Examples:

- CDN: `Vary: Host`  
- App cache: `key = ${tenantId}:${locale}:${route}:${paramsHash}`

### 14.2 Background work

- Queue messages carry **`tenant_id`**.  
- Webhooks carry **`tenant_id`** after resolution, before handler logic.  
- **Time-based jobs** (reminders, SLA timers) that are **booking-scoped** resolve **timezone and “local day” boundaries** per **§7.3.2** from **`bookings.tenant_id`**, not the platform default region.

### 14.3 Observability

- Structured logs: `tenant_id`, `tenant_slug`, `domain`, `gateway`, `integration`.  
- Metrics grouped by tenant for error rate, payment success, webhook failures.

### 14.4 Supabase Storage

- **Object paths:** Prefix with `tenant_id` (e.g. `/{tenant_id}/providers/{provider_id}/…`) so lifecycle and audits are straightforward.  
- **Policies:** If buckets are shared, RLS on `storage.objects` must enforce **tenant** (via object path prefix or metadata) for non-public assets.  
- **Public assets:** Per-tenant branding (logos) may use public buckets with **immutable URLs**; still tag tenant in path for cache invalidation on rebrand.

### 14.5 Realtime (Supabase Realtime)

- **Channel names** include `tenant_id` (e.g. `tenant:{id}:provider:{id}`) to avoid cross-tenant leakage.  
- **Authorize subscriptions** server-side or via RLS-aligned payloads; do not rely on obscurity of channel IDs.

### 14.6 Incident response and feature kill switch

- **Disable tenant** at edge (`lifecycle` + block in proxy) is the fastest **kill switch** for a bad deploy or payment incident in one market.  
- **Feature-flagged** kills (PSP, product surfaces) **follow §20.1**: tenant-scoped flags **override** global defaults for that market only.  
- Runbooks should list **tenant slug**, **domains**, **primary PSP**, and **on-call** escalation per major tenant.

### 14.7 Analytics and reporting (cross-tenant customers)

**Identity**

- Use **stable `user_id`** (or hashed id in third-party tools) for **cross-tenant** user journeys.  
- **Do not** count the same person as **two customers** when they book in two tenants—**one user**, **multiple tenant touchpoints**.

**Required event / dashboard dimensions**

- **`booking_tenant`** (or `transaction_tenant`) — **GMV, bookings, cancellations, refunds, PSP errors** roll up **here** for P&L.  
- **`active_tenant`** — Funnel **where** the session browsed (may equal booking tenant at conversion).  
- **`customer_home_tenant`** (optional user property) — Segmentation only; **never** used as sole attribution for money.  
- **`provider_tenant`** — Provider-side metrics unchanged.

**Roll-ups**

- **Tenant dashboards:** filter `booking_tenant = X`.  
- **Global dashboard:** sum across tenants; **unique users** = distinct `user_id` (not sum of per-tenant uniques).  
- **NPS / CSAT:** attach **`booking_tenant`** to survey triggered by **that** trip; optional second survey keyed to **active_tenant** for site UX.

**Attribution conflict (explicit):** When **`active_tenant` ≠ `booking_tenant`** on a conversion event, **both** properties **MUST** be set. **Downstream rule:** **Finance** uses **`booking_tenant`** only; **Product funnel** may slice by either dimension **but must label** the report (“where they paid” vs “where they browsed”).

---

## 15. Testing matrix (additions)

| ID | Area | Case | Expected |
|----|------|------|----------|
| PAY-T1 | Webhooks | Wrong tenant secret | 401, no DB side effects |
| PAY-T2 | Webhooks | Duplicate event id | Idempotent skip |
| PAY-T3 | Checkout | UK tenant | Stripe adapter used |
| PAY-T4 | Checkout | ZA tenant | Paystack/Yoco per config |
| PAY-T5 | Rails | Online checkout vs in-person POS | Correct adapter + secrets per rail; no cross-rail fallback |
| PAY-T6 | Provider prefs | Provider enables family outside tenant allow-list | 400 / validation error; no write |
| INT-T1 | Maps | Tenant without token | Feature off, no secret leak |
| INT-T2 | Calendar OAuth | Callback on `.co.uk` | Redirect URI valid |
| SEO-T1 | Canonical | Same path on two domains | Different canonicals |
| SEO-T2 | Sitemap | `.co.za` | Only ZA URLs |
| SEO-T3 | hreflang | Misconfigured alternates | Validator clean |
| MOB-T1 | Deep link | `.co.uk` link | Correct tenant bootstrap |
| MOB-T2 | Switch tenant | ZA→UK | Cache cleared, no stale data |
| MOB-T3 | Resolution | Cold start, no deep link | §12.0: last active tenant if still valid → else `tenant-context` / bootstrap → valid tenant |
| MOB-T4 | Admin API | Cached tenant_id tampered | Server rejects; membership revalidated |
| ENV-T1 | Staging | `sandbox` tenant / preview URL | `noindex`, no production hreflang |
| ENV-T2 | Vercel | New country domain added | DNS + cert active; `tenant_domains` row before go-live |
| RLS-T1 | DB | Cross-tenant select | Denied/empty |
| ADM-T1 | API | UK admin → ZA mutation | 403 |
| ADM-T2 | Audit | Tenant admin change | Row with tenant_id |
| ADM-T3 | Admin API | `tenant_superadmin` lists bookings on host tenant A | **No** rows from tenant B; **403** or empty |
| ADM-T4 | Admin UI | Open booking id from tenant B while admin context A | **403** or forced context switch per §7.8 / §11.3.1 |
| JOB-T1 | Cron | Reminders | Scoped per tenant rows |
| AUTH-T1 | Supabase Auth | Magic link from `.co.uk` | Redirect / continue URL allowed; lands on UK tenant |
| AUTH-T2 | Password reset | User on tenant A, opens link on tenant B domain | Still works if URL allowed; session tenant follows host after login |
| STOR-T1 | Storage | User A reads object path for tenant B | Denied |
| RT-T1 | Realtime | Subscribe without tenant match | Denied or no events |
| LEG-T1 | Legal | Terms version bump for tenant | Re-accept gate if product requires |
| DSR-T1 | Privacy | Export request | Output only that tenant’s data for that user |
| ROLE-T1 | Admin | Legacy `users.role` only user | During dual-read: only default tenant; after cutover: migrated rows required |
| XBR-T1 | Customer | ZA user books on UK domain | Booking `tenant_id` = UK; UK PSP; same `user_id` |
| XBR-T2 | Customer | UK user books on ZA domain | Booking `tenant_id` = ZA |
| XBR-T3 | Account | List “my bookings” | Rows from multiple tenants; each labeled; actions use booking tenant context |
| XBR-T4 | Wallet | Credit in tenant A | Not applied at checkout in tenant B (v1) |
| XBR-T5 | RLS/API | Customer reads own booking in other tenant | Allowed per §8.4 pattern; admin still blocked |
| XBR-T6 | Mobile | Switch ZA → UK | Session preserved; browse UK only; checkout GBP |
| XBR-T7 | Notif | Booking reminder | Link + template tenant = booking tenant |
| XBR-T8 | Analytics | One user, two tenant bookings | GMV splits by `booking_tenant`; one MAU |
| XBR-T9 | Mutation | Cancel UK booking while browsing ZA host | **403** or redirect unless §7.8 **(b)/(c)** path used; no mutation under ZA `tenant_id` alone |
| RACE-T1 | Mobile / web | Switch tenant during in-flight search | Stale results discarded; UI shows only **current** active tenant data |
| SRC-T1 | Search | UK home search | Results only `tenant_id` UK; no ZA leakage |
| CART-T1 | Cart / checkout | Active tenant switch mid-flow | Prior-tenant cart/draft cleared or confirmed discard; **no** cross-tenant line items without re-build (§12.7) |
| CART-T2 | Web | Navigate ZA domain → UK domain with items in cart | Same as CART-T1; session/store does not leak priced cart |
| ADDR-T1 | Saved addresses | Address saved in tenant A | Not auto-eligible in tenant B checkout until user selects + server validates §6.2.2 |
| ADDR-T2 | Checkout | Address fails booking tenant / provider geofence | 400 / inline error; booking not created |
| REV-T1 | Reviews | Same brand, two `providers` rows (ZA vs UK) | Public profile shows **only** reviews for **that** `provider_id`; counts **not** merged across tenants |
| FAV-T1 | Favorites | Favorite in ZA tenant | Does **not** appear in UK browse; user may create separate UK favorite (§5.2) |
| SUP-T1 | Support | Login failure (no booking) | Routed to **platform** queue; ticket not attributed to random `last_active_tenant` |
| SUP-T2 | Support | Refund on booking | Ticket `tenant_id` = **`bookings.tenant_id`**; tenant tooling only |
| TZ-T1 | Scheduling | Slot picker for UK booking | Availability labels use **booking tenant** TZ unless UI states otherwise (§7.3.2) |
| TZ-T2 | Policy | Cancel 24h before | Cutoff computed in **booking tenant** policy TZ; reminder jobs consistent |
| TZ-T3 | Documents | Invoice PDF date line | Business date aligns with **booking tenant** unless dual-labeled for regulation |

---

## 16. Rollout plan (low blast radius)

1. **Ship tables + seed one `legacy` tenant**; map current production domain → **`tenant_domains`**; **no behavior change** initially. Treat seed id as **§6.2 / NN-8** migration aid—remove implicit reliance as soon as **Host** resolution is live for all production hostnames.  
2. **Edge resolution + headers** + `tenant-context` endpoint; feature-flagged consumers.  
3. **Backfill `tenant_id`**; dual-read (old + new) where needed.  
4. **Enable RLS** table-by-table behind flags; monitor.  
5. **Payment adapter** behind flag; start with **one** new country (UK) on Stripe.  
6. **Admin scoping** for new roles; migrate existing superadmin to `user_tenant_roles`; **`/admin`** + **`/api/admin/*`** per **§11.3.1**.  
7. **SEO** per domain hardening before marketing launch per country.  
8. **Cross-border customer paths:** `my bookings` API, §8.4 RLS or service routes, mobile market switcher + checkout confirmation (§12.7) + **§12.7 cart discard** on tenant switch.  
9. **Saved addresses model (§6.2.2)** + **§5.0** customer field classification in APIs (global vs `per_tenant` blocks) before scaling traveler traffic.  
10. **Analytics** event schema: `booking_tenant`, `active_tenant`, optional `customer_home_tenant` (§14.7).

---

## 17. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Unique constraint migrations | Planned downtime or **new column + backfill + swap** |
| JWT tenant stale | **No** long-lived tenant in JWT; Host + membership |
| Cache bleed | `Vary: Host`, tenant in keys |
| Webhook mis-routing | Explicit path or mapping table |
| RLS + service routes | Document bypass list; enforce filters in code |
| Auth redirect misconfiguration | Checklist per new domain; smoke test magic link + OAuth on launch |
| `user_tenant_roles` drift vs `users.role` | Dual-read telemetry; migration dashboard before cutover |
| Storage path migration | One-off script + backfill; verify RLS before exposing bucket |
| Data residency | Single Supabase region = one legal posture; document in privacy policy per tenant |
| Wrong-market checkout | §12.7 confirmation + tenant badge; server validates `provider.tenant_id` vs session |
| Wrong-market cart bleed | §12.7 discard-on-switch; no silent cross-tenant cart migration (v1) |
| Cross-tenant support confusion | §13.4: **platform** for auth/account; **booking tenant** for booking issues; CRM dimensions mandatory |
| Analytics double-count | Distinct user for global; GMV always by **booking_tenant** |
| Admin portal cross-tenant leak | §11.3.1 checklist + **ADM-T3/T4**; service-role `/api/admin/*` explicit `tenant_id` (§8.6) |

---

## 18. Acceptance criteria

- Cross-tenant isolation proven in automated tests + manual pen-test spot checks.  
- Country domains index with correct canonical/hreflang/sitemap policy.  
- **Payments:** platform **online checkout** vs **in-person/POS** rails are implemented distinctly; **tenant** allow-lists and defaults; **provider** methods only within allow-list; webhooks verified with correct tenant (or provider) secrets.  
- **Integrations:** `integration_capabilities` seeded; public vs private config split enforced; `fallback_allowed` respected per capability.  
- Mobile apps: one binary; **§12.0 resolution order** implemented; multi-domain deep links; safe tenant switch.  
- **Migration end state (§6.6):** tenant-bound tables **`tenant_id NOT NULL`**, tenant-aware indexes and uniques, no creates without resolved tenant.  
- Audit trail for all tenant-admin mutations.  
- No secrets in public JSON or `NEXT_PUBLIC_*`.  
- **Non-prod / sandbox:** no indexing leakage (see §9.7).  
- **Auth:** all production domains (and required schemes) on Supabase redirect allowlist; email/link flows validated per tenant (§7.5).  
- **Storage & Realtime:** tenant isolation verified (§14.4–14.5).  
- **Notifications / crons:** outbound links use tenant base URL (§11.5).  
- **Cross-border customers:** **Cross-Border Customer Principles** satisfied; one user may hold bookings in **multiple tenants**; **booking / payment / refund** isolation per §10.7; **search** tenant-partitioned per §11.6; **account list** coherent per §7.7 / §8.4; **mobile** traveler UX per §12.6–12.8.  
- **Customer data model:** §5.0 respected in schema and APIs—**global profile** vs **tenant-scoped** consents/preferences/commerce rows are not conflated.  
- **Saved addresses:** §6.2.2 **per-tenant** saved addresses (or equivalent) + **booking-time validation** against **booking tenant** and provider rules.  
- **Favorites & reviews:** No default **cross-tenant** merge of ratings or favorites for the same real-world brand (§5.2); separate `providers` rows ⇒ separate public surfaces.  
- **Support routing:** §13.4 **v1 ownership**—platform for **account/auth**; **booking-tenant** queue for **booking-linked** issues.  
- **Cart isolation:** §12.7—tenant switch **clears or confirm-abandons** cross-tenant draft checkout; no silent migration in v1.  
- **Timezone:** §7.3.2—availability, policy cutoffs, reminders, and default invoice/local scheduling copy follow **booking tenant** timezone unless UI explicitly shows another.  
- **Analytics:** §14.7 dimensions implemented for core funnel and revenue reports.  
- **Tests:** Matrix §15 includes **CART-**, **ADDR-**, **REV-**, **FAV-**, **SUP-**, **TZ-**, **XBR-T9**, **RACE-T1**, **ADM-T3/T4** cases for the above (automate where feasible).
- **Edge cases:** §7.8–§7.9 behaviors covered by tests or runbooks (booking mutation across hosts, tenant-switch races, analytics dual dimensions).
- **Superadmin / back-office:** **§11.3.1** satisfied — `/admin` and **`/api/admin/*`** respect **resolved admin tenant**; **global_superadmin** cross-tenant paths **audited**; finance admin views align with **booking / payout `tenant_id`** (NN-4).

---

## 19. Recommended migration sequence

1. `tenants`, `tenant_domains`, `tenant_settings`, `tenant_secrets`, `user_tenant_roles`  
2. `integration_capabilities` + seed rows (§6.5)  
3. Seed + domain map + `GET /api/public/tenant-context`  
4. Add nullable `tenant_id` to wave-1 tables; backfill; **leading** indexes on `(tenant_id, …)`  
5. Fix **composite uniques** to include `tenant_id`; then **`NOT NULL`** on `tenant_id` for tenant-bound tables (§6.6)  
6. RLS policies + trusted `app.current_tenant_id` path (if used)  
7. Payment orchestrator **by rail** (`online_checkout` / `inperson_pos`) + webhook routes + idempotency tables  
8. Tenant allow-list vs provider enablement validation in provider payment APIs  
9. Integration merge logic (global fallback only where `fallback_allowed`) + secret split  
10. Admin API guard migration (`user_tenant_roles`)  
11. SEO route updates + §9.7 preview/sandbox behavior  
12. Mobile `app.json` domains + §12.0 bootstrap order  
13. Supabase Auth redirect URLs + email template base URLs per tenant (§7.5)  
14. Storage path convention + policies (§14.4)  
15. Realtime channel naming + authorization (§14.5)  
16. `users.role` → `user_tenant_roles` backfill and dual-read removal (§7.6)  
17. **Cross-border customer APIs** — aggregated bookings list, §8.4 RLS or trusted server routes; `preferred_home_tenant_id` optional column (§6.2.1)  
18. **Analytics** — emit §14.7 dimensions on core events  
19. **Saved addresses (§6.2.2)** — tenant-scoped customer address rows + **booking-time** validation against **booking tenant** / provider service area.  
20. **Cart / draft checkout (§12.7)** — clear or confirm-abandon on **active tenant** change (web hostname change + mobile switch).  
21. **Timezone alignment (§7.3.2)** — reminder crons, cancellation policy evaluation, and default “local” invoice lines use **`bookings.tenant_id` → tenant timezone** (store UTC; convert consistently).

---

## 20. Monorepo-safe implementation guidance

- **Additive modules only:** `packages/tenant` or `apps/web/src/lib/tenant/` with `resolveTenant()`, `requireTenant()`, `getEffectiveSettings()`.  
- **Wrappers:** existing `getPublicConfigBundle` gains optional `tenantId` resolved from host—**signature extension**, not rewrite.  
- **Feature flags:** see **§20.1** for merge order; store per-tenant overrides in `tenant_feature_flags` or reuse `feature_flags` with nullable `tenant_id`.  
- **Avoid** moving entire app folders; **isolate** payment code behind `adapters/`.  
- **Compat:** read legacy **`platform_settings`** only as **global default** during migration—same rule as **§6.2** / **NN-8**: **not** a permanent substitute for **`tenant_settings`** once a row exists for that tenant.  
- **PR sizing:** vertical slices per **tenant + surface** (e.g. “UK domain + Stripe webhook only”).
- **Cross-border default:** implement **global customer identity** + **tenant-scoped bookings/money** first; **defer** global mixed search (§11.6 phase 2) until v1 stable.

### 20.1 Feature flag evaluation order (normative)

When a capability is gated by flags (product, payments, integrations, kill switches), evaluate in **strict** order; **first explicit win** at each layer unless the flag definition says “merge”:

| Precedence | Source | Rule |
|------------|--------|------|
| **1 — Global default** | `platform_settings`, env, `feature_flags` rows with **`tenant_id` null** | Baseline for all tenants unless overridden. |
| **2 — Tenant override** | `tenant_settings`, `tenant_feature_flags`, or `feature_flags` with **`tenant_id` set** | **Wins** over global for that tenant only. |
| **3 — User override (optional)** | `users` / `user_preferences` / per-session only | **Allowed only** where product explicitly documents it (e.g. beta opt-in). **Must not** override **tenant** or **booking** financial boundaries (PSP, tax, legal gates). **If unused, omit this layer.** |

**Conflict:** Tenant A flag on + global off → **on** for tenant A. **No** “user turns on feature in tenant B catalog” without server validation against **tenant B** entitlement.

---

## 21. Completeness addenda (v2.2+)

The following are **explicitly in scope** for a production rollout; earlier sections remain authoritative—this section only closes common gaps. **Cross-border customer behavior** is specified in **Cross-Border Customer Principles** and §7–§14 (v2.3). **Appendix B (v2.4)** extends the codebase snapshot to **provider app + provider web/API**. **v2.5** adds **§5.0** customer field classification, **§6.2.2** saved addresses, **§7.3.2** booking-tenant timezone, **§12.7** cart isolation, decisive **§13.4** support ownership, tightened **§5.2** reviews/favorites rules, and matching **§15 / §18** tests and acceptance. **v2.6** adds **Authoritative index**, **Non-negotiable rules (NN)**, **§7.8–7.9** edge cases, **§8.5–8.6** / **§10.8–10.9** / **§12.9** implementation + pitfalls, **§14.7** attribution clarification, **§21.1** residual risks, and tests **XBR-T9**, **RACE-T1**. **v2.6.1** expands **§21.1.2** with explicit **spec enforcement limits** (CI/review, nullable migration, legal/TZ, third-party analytics governance, impersonation gap). **v2.6.2** adds **Document maintenance** (top), **NN-8** + **§6.2** legacy-tenant rule, **§20.1** feature-flag precedence, **§9.7.1** Vercel/Next specifics, fixes **§10.7–10.9** order, and tightens **§20** compat wording. **v2.6.3** adds **§11.3.1** superadmin **`/admin`** portal coverage (aligned to `lib/admin-sections` + multi-tenant rules). **v2.6.4** adds **Appendix C** — full **`/api/admin`** route inventory (regenerated from the repo) — plus **§11.3.2** maintenance notes and **§13.1** pointers for cross-tenant admin search paths.

| Topic | Requirement |
|-------|-------------|
| **Payouts** | Online PSP (Stripe Connect, Paystack transfers, etc.) follows **same tenant** and **rail** rules as checkout (§10); provider onboarding for payouts must not expose PSPs disallowed by tenant. |
| **Subscriptions / SaaS** | Provider platform billing (if per market) uses **tenant** plan codes or tenant-scoped product IDs—avoid one global Paystack plan for all countries unless intentional. |
| **Wallet / ledger** | If customers hold balance: either **one wallet per (user, tenant)** or single wallet with strict currency rules—document and enforce in schema; do not silently convert currencies. |
| **Search / discovery APIs** | Default `country` or region params become **derived from resolved tenant**; do not default to a single hardcoded country in public routes. |
| **Rate limits** | Optional **per-tenant** rate limits for public APIs and webhooks to contain abuse in one market. |
| **Attribution / deep links (Singular, etc.)** | Link domains and campaign URLs should match **tenant primary domain** where marketing is localized. |
| **Breaking API changes** | Publish a short **changelog** for mobile and partners: new headers, tenant-scoped errors, stricter admin checks. |
| **Cross-border customers (v2.3)** | **Cross-Border Customer Principles** + §7.3–7.7, §8.4, §10.7, §11.3.1, §11.6, §12.6–12.8, §13.4, §14.7; **§5.2** commerce scoping; optional **`preferred_home_tenant_id`** (§6.2.1). |

### 21.1 Residual risks & explicit non-goals (v2.6)

#### 21.1.1 Technical residual risks (ongoing vigilance)

| Risk | Why it remains | Mitigation |
|------|----------------|------------|
| **Service-role footguns** | Bypasses RLS | Code review + automated grep; §8.5–8.6; **NN-6** |
| **Webhook spoofing / mis-routing** | External attack surface | Signature + tenant mapping tests **PAY-T1**; idempotency **PAY-T2** |
| **JWT / session confusion** | Multi-domain auth | §7.2, **AUTH-T1/T2** |

#### 21.1.2 What the spec cannot enforce — org mitigations (required)

These items are **not closed by writing the spec**; they need **process, governance, legal, or product** ownership. Document owners in **platform + security + legal + data** RACI.

| Gap | Why the spec is insufficient | **Mitigation (do this)** |
|-----|------------------------------|---------------------------|
| **Operational discipline (NN + service role)** | **NN** (§NN) and §8.5–8.6 are **normative text**, not executable guards. The document **does not** run in CI and cannot block a bad merge by itself. | **Mandatory** PR checklist: tenant filter on every service-role query path; **ESLint/custom lint** (e.g. ban `getSupabaseAdmin().from(...)` without adjacent `tenant_id` / documented exception); periodic **audit grep**; train reviewers on §8.6 pitfalls. |
| **Legacy schema — nullable `tenant_id` transition** | Until **§6.6** end state (`tenant_id NOT NULL` on tenant-bound tables), **any** code path that omits `.eq('tenant_id', …)` can attach or read the **wrong** tenant during migration. The spec allows **transition nulls**; that window is inherently risky. | **Shorten** nullable phase; **feature flags** per wave; **integration tests** per table wave; **TypeScript / codegen** requiring `tenantId` on inserts; **DB constraints** as soon as backfill completes; monitor **null `tenant_id`** row counts to zero before calling migration done. |
| **Legal / tax nuance vs booking-tenant timezone** | **§7.3.2** anchors scheduling, cutoffs, and default invoice “business” wording to **booking tenant** TZ; **regulated markets** may still require **customer-local** dates/times or dual disclosure on consumer-facing documents. The spec permits **dual-label** UX but is **not** exhaustive legal copy. | **Per-tenant legal sign-off** on templates (email, PDF, in-app); product + legal **runbook** listing which surfaces show **booking TZ**, **customer local**, or **both**; revisit when entering new jurisdictions. |
| **Third-party tools (Amplitude, BI, warehouses)** | Even with **§14.7** dimensions, vendors and analysts can **misconfigure** dashboards (e.g. sum revenue by `active_tenant`, duplicate users across tenants, wrong filters). **Application code** alone does not govern external tools. | **Analytics governance:** event schema contract + **review** of new dashboards; **semantic layer** rules (“GMV always `booking_tenant`”); **access controls** on tenant-level reports; periodic **audit** of top executive dashboards against §14.7. |
| **Impersonation product surface vs §7.9 logging** | **§7.9** mandates **audit fields** when impersonation exists. If the product **does not** ship impersonation UX, there is nothing to log; if it ships **without** tooling, there is an **implementation gap** — not ambiguity in the spec. | **Product decision:** either (a) **no impersonation** in v1 — document “N/A” in security runbook, or (b) impersonation **blocked until** `tenant_audit_log` (or equivalent) + UI + **§7.9** fields are **shipped and tested**. |

**Relation to §14.7:** The “browse ≠ pay tenant” analytics case is specified in **§7.9** and **§14.7**; **21.1.2** row **Third-party tools** is the **organizational** half of the same problem (tools built wrong despite good events).

**Explicit non-goals for this spec** (do not implement as “tenant features” without a new ADR):

- **Cross-tenant wallet balance** merge or auto-conversion (v1).  
- **Global mixed SERP** without labeled sections (v1).  
- **Single `providers` row** spanning multiple tenants for marketplace purposes.  
- **Customer `tenant_id`** as permanent sole JWT claim (§7.2).

---

## Key changes from original spec

| Topic | Strengthened |
|--------|----------------|
| **Tenant definition** | Explicit default: **tenant = country market**; optional EU-style tenant called out without new role types. |
| **Terminology (v2.1)** | **§0:** Tenant = durable admin/isolation boundary; **no** `country_superadmin` / `regional_superadmin` role names; multi-country = still a **tenant**. |
| **Auth / JWT** | **Explicit decision:** do **not** rely on permanent `tenant_id` in JWT; Host + membership + request context. |
| **Payments** | Full **gateway abstraction**, per-tenant config/secrets, webhook resolution strategies, **idempotency + reconciliation**; **v2.1:** **online vs POS rails**, tenant **allow-lists** vs provider **enabled methods**. |
| **Integrations** | **Global vs tenant vs fallback**, public vs private config, **server-only** secret execution; **v2.1:** **`integration_capabilities`** table + concrete rows for payments/maps/messaging/analytics/KYC/calendar. |
| **Admin roles** | **tenant_superadmin** as country superadmin; optional **global_superadmin**; section admins **scoped by tenant** via `user_tenant_roles`. |
| **SEO** | **Canonical, hreflang, sitemap, robots, structured data, duplicate content** guidance made concrete; **v2.1:** **§9.7** Vercel, TLS, preview, sandbox **noindex**. |
| **Mobile** | **Tenant bootstrap, auth callbacks, switching, cache invalidation**, multi-domain links—explicit; **v2.1:** **§12.0 normative resolution order** + privileged revalidation. |
| **Monorepo** | **Additive wrappers, phased rollout, feature flags, avoid rewrites** called out as first-class. |
| **Ops** | **Cache keys, jobs, webhooks, observability** with tenant dimensions. |
| **Schema** | **Tenant lifecycle**, **audit log**, **tenant-aware unique constraints** called out explicitly; **v2.1:** **§6.6 end state**, **§6.7** provider/catalog tenancy, **§6.5** integration registry. |
| **Completeness (v2.2)** | **§5.1** i18n/tax/legal/DSR; **§6.8–6.9** table waves & tenant FK lifecycle; **§7.5–7.6** Auth multi-domain + role migration; **§11.5** CORS & notification links; **§14.4–14.6** Storage, Realtime, incidents; **§21** payouts/wallet/search/rate limits/attribution/API changelog; expanded **§15**, **§17**, **§18**, **§19**. |
| **Cross-border / Airbnb-style (v2.3)** | **Cross-Border Customer Principles** (normative); **global customer** vs **tenant admin/provider** vs **booking tenant**; **§5.2** reviews/loyalty/wallet/promo scoping; **§7.3.1** home vs active vs booking; **§7.7** v1 browse/search/booking rules; **§8.4** customer cross-tenant booking reads; **§9.8** SEO vs logged-in traveler; **§10.7** financial isolation; **§11.6** tenant-partitioned search; **§12.6–12.8** traveler mobile UX; **§13.4** notifications/support/CRM; **§14.7** analytics dimensions; legal/consent split **§5.1**; tests **XBR-***, **SRC-T1**. |
| **Appendix A** | **Customer app + web** implementation snapshot vs this spec (aligned / partial / not built); refresh when major routes or schema change. |
| **Appendix B (v2.4)** | **Provider app + provider web/API** snapshot: **`provider_id`** resolution, **`/provider`** + **`/api/provider/*`**, config-bundle/deep links, **superadmin** gap, **`providers.tenant_id`** target. |
| **Precision pass (v2.5)** | **§5.0** global vs tenant customer fields; **§5.0.3** / **§5.2** profile vs commerce + reviews/favorites **no cross-tenant public merge**; **§6.2.2** saved addresses; **§7.3.2** booking-tenant TZ; **§12.4+12.7** cart discard on switch; **§13.4** platform vs booking-tenant support; **§15–§18** new **CART/ADDR/REV/FAV/SUP/TZ** tests + acceptance; **§16–§19** rollout/migration hooks. |
| **Architecture editorial (v2.6)** | **Authoritative index** + **NN** rules table; **§3** deduped; **§7.8–7.9** booking mutations + races/impersonation/analytics; **§8.5–8.6**, **§10.8–10.9**, **§12.9**; **§14.7** dual attribution; **§21.1** residual risks; **XBR-T9**, **RACE-T1**. |
| **Governance & limits (v2.6.1)** | **§21.1.2** — NN/service-role **not** self-enforcing in CI; nullable **`tenant_id`** transition risk; **legal vs §7.3.2 TZ** sign-off; **Amplitude/BI** governance; **impersonation** product vs §7.9 logging gap + RACI note. |
| **Cleanup & ops detail (v2.6.2)** | **Document maintenance** rule; **Authoritative index** rows (**NN-8**, **§20.1**); **§6.2** + **§6.6** legacy tenant ≠ permanent fallback; **§9.7.1** Vercel/Next; **§10.7→10.9** numeric order; **§20.1** flag precedence; **§11.1** → §9.7.1 pointer. |
| **Admin portal (v2.6.3)** | **§11.3.1** — **`/admin`** / `ALL_ADMIN_ROLES` / section admins; portal-area → **tenant** scope table; `/api/admin/*` + **global_superadmin** cross-tenant rules; link to Appendix B provider superadmin gap. |
| **Admin `/api/admin` inventory (v2.6.4)** | **Appendix C** — full route list + **§C.1** prefix counts (from repo); **§11.3.2** maintenance; **§13.1** cross-tenant admin search paths (`/api/admin/search`, `/api/admin/users/search`, etc.). |

---

## Appendix A — Codebase alignment (customer app & web)

**Purpose:** Verify the spec **covers** real implementation gaps. This appendix is a **snapshot** of `apps/customer` + `apps/web` against the design. **Provider** is in **Appendix B**.

**Status legend:** **Aligned** = behavior already matches intent or needs only `tenant_id` on rows later | **Partial** = right shape, wrong defaults or missing wiring | **Not built** = spec calls for it, code absent.

### A.1 Already aligned or close

| Area | Evidence | Spec refs |
|------|-----------|-----------|
| **Global customer identity** | Single Supabase auth + `users`; one account for all API calls | Cross-Border Principles, §7.3 |
| **Cross-tenant booking list (API shape)** | `GET /api/me/bookings` filters **`customer_id` only** (no country/tenant filter)—so **all** a user’s bookings are returned once `tenant_id` exists on rows | §7.7, §8.4, §13.1 |
| **Mobile → web API** | `createApiClient` + Bearer token; `credentials: omit` | §7.5, packages/api |
| **i18n on customer** | `@beautonomi/i18n`, phone country pickers | §5.1, §12.8 (UX layering) |
| **Public home API has country param** | `GET /api/public/home?country=` defaults **`ZA`** | §11.6 (today’s param; spec: derive from **active tenant** later) |

### A.2 Partial — needs tenant / market wiring

| Area | Evidence | Gap vs spec |
|------|-----------|-------------|
| **Customer home feed** | `useHomeData` calls `/api/public/home` **without** `country` query; server resolves market from **`Host`** / **`X-Active-Market-Country`** (mobile) / geo / `DEFAULT_MARKET_COUNTRY` — still **ISO2**, not DB tenant slug yet | §7.3.1, §11.6: full **tenant** resolution when `tenants` + `tenant_domains` exist |
| **Booking flow defaults** | `book.tsx` uses **`country: "ZA"`** in multiple address paths | §7.7: default address country should follow **active tenant** / user locale, not hardcoded ZA |
| **Config bundle** | `fetchConfigBundle` → `/api/public/config-bundle?platform=&environment=` only; **no** tenant/region | §10.6, §12.2: tenant-aware **effective config** |
| **Third-party / maintenance** | `third-party-config`, `maintenance` use `APP_URL` only | §11.5: links and flags should respect **resolved tenant** when multi-market |
| **Superadmin `/admin` + `/api/admin/*`** | `apps/web/src/app/admin/**`, `ALL_ADMIN_ROLES` / section roles in `lib/admin-sections.ts`; tenant context **not** derived from **`Host`** today | §11.3.1: every admin list/mutation needs **explicit `tenant_id`** scope + §7.6 role migration |

### A.3 Not built yet (spec is target architecture)

| Area | Evidence | Spec refs |
|------|-----------|-----------|
| **`tenant_id` in DB** | No `tenant_id` in `apps/web/supabase/migrations` at audit time | §6, §6.6 |
| **Edge tenant resolution** | No `x-tenant-id` / `resolveTenant` in web `src` | §7.1, §11.1 |
| **`GET /api/public/tenant-context`** | **Partial:** returns `countryCode`, `source`, `host` for active-market discovery (bridge until `tenant_domains` + slug in DB) | §12.0, §13.1 |
| **`tenants` / `tenant_domains` tables** | Not in migrations (spec drafts only) | §6.1 |
| **Multi-domain app links (customer)** | `app.json` **beautonomi.com** / **www** only | §9.7, §12.1 |
| **Single `APP_URL` build** | `EXPO_PUBLIC_APP_URL` → one Next origin; **no** `Host` header on API calls from mobile | §12.0, §12.5: add **`X-Active-Tenant-Id`** or validated slug header once server enforces |
| **SEO `metadataBase`** | Web `layout.tsx` uses **`NEXT_PUBLIC_SITE_URL`** fallback single domain | §11.2 |
| **Analytics dimensions** | Customer `analytics.ts` optional `country`; **no** systematic `booking_tenant` / `active_tenant` | §14.7 |

### A.4 `packages/api` / shared client

| Topic | Today | Spec expectation |
|-------|--------|------------------|
| Headers | `Authorization`, `Content-Type` | Optional **`X-Active-Tenant-Id`** (or slug) for mobile after trust model §7.1 is implemented server-side |
| `baseUrl` | Single string | Remains **one** web deployment URL; **tenant** is context header/query, not a second origin (unless product later splits APIs) |

### A.5 Provider app (customer appendix)

Provider is covered in **Appendix B** (this section intentionally omitted provider detail).

### A.6 Conclusion

- The **spec is ahead of the code**: it **does** cater for customer + web multi-tenant and cross-border behavior; most items are **design targets**, not current behavior.  
- **Highest-impact customer/web deltas** for cross-border v1: (1) **stop defaulting ZA** on mobile home + booking when `country`/tenant can be inferred, (2) add **tenant resolution + `tenant_id` on bookings/providers**, (3) **config-bundle + public APIs** keyed by active tenant, (4) **append multi-domain** app links, (5) **emit §14.7** dimensions in web + app analytics.

---

## Appendix B — Codebase alignment (provider app & provider web/API)

**Scope:** `apps/provider` (Expo) and provider-facing surfaces in `apps/web` (`src/app/provider/**`, `src/app/api/provider/**`). Same snapshot style as Appendix A.

### B.1 Already aligned or close

| Area | Evidence | Spec refs |
|------|-----------|-----------|
| **Provider scoped by `provider_id`** | `/api/provider/*` routes resolve **`getProviderIdForUser`** (owner or active staff) and filter **`bookings`**, reports, locations, etc. by **`provider_id`** | §6.7 (each provider row is one commercial entity); future **`providers.tenant_id`** attaches market |
| **No client-chosen provider impersonation** | Mobile uses Bearer token; provider id comes from **DB link** to user, not from arbitrary header | §7.1 trust model (contrast with untrusted `tenant_id` in body) |
| **Single backend URL** | `EXPO_PUBLIC_APP_URL` + `createApiClient` (same pattern as customer) | §12.5, Appendix A.4 |
| **Config bundle** | `apps/provider/src/lib/config-bundle.ts` → `/api/public/config-bundle?platform=provider` (and env) | Same **partial** as customer: **no tenant** in query yet |
| **Deep link host (single market today)** | Android: `https://beautonomi.com/provider`; iOS associated domains: `beautonomi.com`, `www` | §9.7, §12.1 — **extend** for `*.co.za` / `*.co.uk` etc. |
| **Provider web portal** | Next.js routes under **`/provider`** in same app as customer marketplace; `proxy.ts` guards provider role | §11.1 — tenant context will eventually come from **`Host`** for **both** customer and provider paths on that hostname |

### B.2 Partial — multi-tenant / cross-market gaps

| Area | Evidence | Gap vs spec |
|------|-----------|-------------|
| **No `tenant_id` on providers or API** | Migrations lack `tenant_id`; provider APIs do not filter or validate tenant | §6.2, §6.7 — add column + enforce **booking/provider tenant** on writes |
| **Superadmin on provider APIs** | e.g. `GET /api/provider/bookings` allows **`superadmin`** in `requireRoleInApi`, then **`getProviderIdForUser`** — if user has **no** provider/staff row → **`Provider not found` (404)** | §4.2, §8.3, **§11.3.1** (relation to marketplace admin): **tenant_superadmin** / tooling needs explicit **`provider_id`** + tenant check + audit—**not** wired today for superadmin-without-provider |
| **Calendar OAuth credentials** | `platform_secrets` singleton + env fallback; `redirect` uses request origin | §10.6, §9.7 — must register **all** provider-portal hostnames; **per-tenant** secrets per spec |
| **Payouts / Yoco / Paystack** | Provider routes under `/api/provider/...` assume **one** platform payment story | §10.0–10.7 — orchestrator + **tenant** allow-list |
| **Locations `country`** | Provider adds locations with **address country** field (e.g. `add.tsx` comment) — not same as **market tenant** | §6.7: operational address can differ from **onboarding tenant**; rules TBD in product |

### B.3 Not built yet (spec is target)

| Area | Evidence | Spec refs |
|------|-----------|-----------|
| **`X-Active-Tenant-Id` / edge tenant** | Provider mobile does not send tenant header; web provider pages rely on **session + role**, not host-derived tenant table | §11.1, §12.6 |
| **Separate provider binaries per country** | Single Expo app `com.beautonomi.partner` | §1 — **one binary**; correct |
| **Provider “switch market”** | No UX for one user managing **two** `providers` rows in two tenants (would be **two accounts** or future org switcher) | §6.7 cross-tenant expansion = **separate provider records**; app today assumes **one** provider context per login |

### B.4 Provider web (`/provider` in `apps/web`)

| Topic | Today | Spec expectation |
|-------|--------|------------------|
| **URL space** | `/provider`, `/provider/onboarding`, etc. on **whatever host** serves the app | Each **country domain** that offers provider portal should serve same routes; **tenant** from **Host** |
| **SEO** | Provider pages may inherit root `metadataBase` | §11.2 — **tenant-derived** metadata where provider portal is public |
| **Embed** | `pathname === "/provider/embed"` in layout | If embed is used cross-domain, **iframe origin** and **tenant** must stay consistent |

### B.5 Highest-impact provider deltas (multi-market v1)

1. **`providers.tenant_id` NOT NULL** after backfill; all **`/api/provider/*`** validate `provider.tenant_id` against **resolved request tenant** when request is host-based (web) or against **declared active tenant** (mobile) once trusted header exists.  
2. **`tenant_superadmin`**: `provider_id` query (or body) + **`user_tenant_roles`** check for **that provider’s tenant** — fix **superadmin 404** on provider APIs where needed.  
3. **Multi-domain** `app.json` intent filters + associated domains for **each** production hostname that serves `/provider`.  
4. **Payment / POS / payout** routes: use **PaymentOrchestrator** + **booking/provider tenant** (§10).  
5. **Config bundle** for `platform=provider` includes **tenant** slice (branding, flags, PSP availability).

### B.6 Conclusion

- Provider stack is **strongly scoped by `provider_id`** today — that matches the spec’s **commercial boundary** once **`tenant_id`** is added to `providers`.  
- **Customer “active tenant” must not** drive provider APIs; **provider tenant** = **`providers.tenant_id`** (§12.6).  
- **Gaps:** no tenant columns, no host-based tenant enforcement on provider web, **superadmin** provider API story incomplete (**§11.3.1** for marketplace **`/admin`** counterpart), **multi-domain** deep links for provider app, **global** platform secrets for calendar/payments instead of **tenant_secrets**.

---

## Appendix C — `/api/admin` route inventory (generated)

**Purpose:** Single checklist of **every** Next.js Route Handler under `apps/web/src/app/api/admin/**/route.ts` for tenancy migration, security review, and **§11.3.1** audit coverage.

**Normative behavior:** Does **not** change **§11.3.1** — each path **must** still resolve **`tenant_id`** (or **explicit `global_superadmin`** cross-tenant rules) per NN-2 and §8.6.

**Regenerate** (repository root):

```powershell
$adminRoot = (Resolve-Path 'apps\web\src\app\api\admin').Path
Get-ChildItem -LiteralPath $adminRoot -Recurse -Filter 'route.ts' | ForEach-Object {
  $dir = $_.Directory.FullName
  $sub = $dir.Substring($adminRoot.Length).Replace('\','/').TrimStart('/')
  if ($sub) { '/api/admin/' + $sub } else { '/api/admin' }
} | Sort-Object -Unique | Set-Content -Encoding utf8 docs/_admin_api_routes_snapshot.txt
```

```bash
node docs/scripts/insert-appendix-c-admin-routes.mjs
```

**Conventions:** `[id]`, `[code]`, `[txId]`, etc. are **dynamic segments** (Next.js); actual HTTP paths use concrete values.

### C.1 Count by top-level segment

| Prefix | Route files |
|--------|-------------|
| `account-security-copy` | 1 |
| `activity` | 1 |
| `addons` | 2 |
| `analytics` | 2 |
| `api-keys` | 2 |
| `app-version` | 1 |
| `audit-logs` | 1 |
| `automations` | 2 |
| `bookings` | 7 |
| `broadcast` | 4 |
| `catalog` | 6 |
| `content` | 26 |
| `control-plane` | 16 |
| `custom-fields` | 2 |
| `dashboard` | 1 |
| `disputes` | 2 |
| `email-templates` | 2 |
| `explore` | 2 |
| `export` | 8 |
| `feature-flags` | 2 |
| `fees` | 3 |
| `finance` | 2 |
| `gamification` | 5 |
| `gift-cards` | 3 |
| `gods-eye` | 6 |
| `impersonation` | 2 |
| `integrations` | 1 |
| `invoices` | 2 |
| `iso-codes` | 10 |
| `loyalty` | 3 |
| `maintenance` | 1 |
| `maintenance-notify` | 1 |
| `mapbox` | 3 |
| `monitoring` | 2 |
| `nav-counts` | 1 |
| `notification-templates` | 2 |
| `notifications` | 5 |
| `payment-safety-copy` | 1 |
| `payments` | 1 |
| `payouts` | 6 |
| `plans` | 1 |
| `platform-fees` | 1 |
| `platform-zones` | 2 |
| `pricing-plans` | 1 |
| `product-orders` | 1 |
| `product-returns` | 2 |
| `promotions` | 3 |
| `provider-subscriptions` | 1 |
| `providers` | 8 |
| `ranking` | 2 |
| `referrals` | 3 |
| `refunds` | 2 |
| `reports` | 5 |
| `reviews` | 2 |
| `safety` | 1 |
| `search` | 1 |
| `security` | 1 |
| `service-zones` | 12 |
| `settings` | 3 |
| `sms-templates` | 2 |
| `staff` | 3 |
| `subscription-metrics` | 1 |
| `subscription-plans` | 1 |
| `support-ticket-assignees` | 1 |
| `support-tickets` | 4 |
| `system-health` | 1 |
| `taxes` | 1 |
| `travel-fees` | 1 |
| `user-reports` | 2 |
| `users` | 9 |
| `verifications` | 3 |
| `webhooks` | 5 |
| **Total** | **236** |

### C.2 Full path list (alphabetical)

```text
/api/admin/account-security-copy
/api/admin/activity
/api/admin/addons
/api/admin/addons/[id]
/api/admin/analytics
/api/admin/analytics/previous-software
/api/admin/api-keys
/api/admin/api-keys/[id]
/api/admin/app-version
/api/admin/audit-logs
/api/admin/automations
/api/admin/automations/stats
/api/admin/bookings
/api/admin/bookings/[id]
/api/admin/bookings/[id]/cancel
/api/admin/bookings/[id]/dispute
/api/admin/bookings/[id]/dispute/resolve
/api/admin/bookings/[id]/refund
/api/admin/bookings/bulk
/api/admin/broadcast/email
/api/admin/broadcast/history
/api/admin/broadcast/push
/api/admin/broadcast/sms
/api/admin/catalog/categories
/api/admin/catalog/categories/[id]
/api/admin/catalog/global-categories
/api/admin/catalog/global-categories/[id]
/api/admin/catalog/services
/api/admin/catalog/services/[id]
/api/admin/content/about-us
/api/admin/content/about-us/[id]
/api/admin/content/app-links
/api/admin/content/app-links/[id]
/api/admin/content/faqs
/api/admin/content/faqs/[id]
/api/admin/content/featured-cities
/api/admin/content/featured-cities/[id]
/api/admin/content/footer-links
/api/admin/content/footer-links/[id]
/api/admin/content/footer-settings
/api/admin/content/footer-settings/[id]
/api/admin/content/learning/articles
/api/admin/content/learning/articles/[id]
/api/admin/content/learning/categories
/api/admin/content/learning/categories/[id]
/api/admin/content/learning/featured
/api/admin/content/learning/homepage
/api/admin/content/pages
/api/admin/content/pages/[id]
/api/admin/content/preference-options
/api/admin/content/preference-options/[id]
/api/admin/content/profile-questions
/api/admin/content/profile-questions/[id]
/api/admin/content/resources
/api/admin/content/resources/[id]
/api/admin/control-plane/config-change-log
/api/admin/control-plane/flags-preview
/api/admin/control-plane/integrations/aura
/api/admin/control-plane/integrations/gemini
/api/admin/control-plane/integrations/sumsub
/api/admin/control-plane/modules/ads
/api/admin/control-plane/modules/ads/packs
/api/admin/control-plane/modules/ai
/api/admin/control-plane/modules/ai/entitlements
/api/admin/control-plane/modules/ai/templates
/api/admin/control-plane/modules/ai/templates/[id]
/api/admin/control-plane/modules/ai/usage
/api/admin/control-plane/modules/distance
/api/admin/control-plane/modules/on-demand
/api/admin/control-plane/modules/ranking
/api/admin/control-plane/modules/safety
/api/admin/custom-fields
/api/admin/custom-fields/[id]
/api/admin/dashboard
/api/admin/disputes
/api/admin/disputes/[id]
/api/admin/email-templates
/api/admin/email-templates/[id]
/api/admin/explore/posts
/api/admin/explore/posts/[id]
/api/admin/export/analytics
/api/admin/export/audit-logs
/api/admin/export/bookings
/api/admin/export/finance
/api/admin/export/providers
/api/admin/export/reviews
/api/admin/export/transactions
/api/admin/export/users
/api/admin/feature-flags
/api/admin/feature-flags/[id]
/api/admin/fees/adjustments
/api/admin/fees/configs
/api/admin/fees/reconciliations
/api/admin/finance/summary
/api/admin/finance/transactions
/api/admin/gamification/backfill
/api/admin/gamification/badges
/api/admin/gamification/badges/[id]
/api/admin/gamification/point-rules
/api/admin/gamification/providers/[id]/recalculate
/api/admin/gift-cards
/api/admin/gift-cards/[id]
/api/admin/gift-cards/metrics
/api/admin/gods-eye
/api/admin/gods-eye/audit
/api/admin/gods-eye/booking/[id]/track
/api/admin/gods-eye/config
/api/admin/gods-eye/map-state
/api/admin/gods-eye/retention
/api/admin/impersonation/check
/api/admin/impersonation/end
/api/admin/integrations/amplitude
/api/admin/invoices
/api/admin/invoices/[id]
/api/admin/iso-codes/countries
/api/admin/iso-codes/countries/[code]
/api/admin/iso-codes/currencies
/api/admin/iso-codes/currencies/[code]
/api/admin/iso-codes/languages
/api/admin/iso-codes/languages/[code]
/api/admin/iso-codes/locales
/api/admin/iso-codes/locales/[code]
/api/admin/iso-codes/timezones
/api/admin/iso-codes/timezones/[code]
/api/admin/loyalty/milestones
/api/admin/loyalty/milestones/[id]
/api/admin/loyalty/rules
/api/admin/maintenance
/api/admin/maintenance-notify
/api/admin/mapbox/config
/api/admin/mapbox/service-zones
/api/admin/mapbox/service-zones/[id]
/api/admin/monitoring/errors
/api/admin/monitoring/health
/api/admin/nav-counts
/api/admin/notifications/config
/api/admin/notifications/logs
/api/admin/notifications/send
/api/admin/notifications/templates
/api/admin/notifications/templates/[id]
/api/admin/notification-templates
/api/admin/notification-templates/[id]
/api/admin/payments/[txId]/refund
/api/admin/payment-safety-copy
/api/admin/payouts
/api/admin/payouts/[id]/approve
/api/admin/payouts/[id]/initiate-transfer
/api/admin/payouts/[id]/mark-failed
/api/admin/payouts/[id]/mark-paid
/api/admin/payouts/[id]/reject
/api/admin/plans
/api/admin/platform-fees
/api/admin/platform-zones
/api/admin/platform-zones/[id]
/api/admin/pricing-plans
/api/admin/product-orders
/api/admin/product-returns
/api/admin/product-returns/[id]
/api/admin/promotions
/api/admin/promotions/[id]
/api/admin/promotions/[id]/redemptions
/api/admin/providers
/api/admin/providers/[id]
/api/admin/providers/[id]/distance-settings
/api/admin/providers/[id]/overrides
/api/admin/providers/[id]/payout-accounts
/api/admin/providers/[id]/status
/api/admin/providers/[id]/verify
/api/admin/providers/bulk
/api/admin/provider-subscriptions
/api/admin/ranking/recompute
/api/admin/ranking/scores
/api/admin/referrals
/api/admin/referrals/faqs
/api/admin/referrals/faqs/[id]
/api/admin/refunds
/api/admin/refunds/[id]
/api/admin/reports/bookings
/api/admin/reports/customers
/api/admin/reports/providers
/api/admin/reports/revenue
/api/admin/reports/yoco-reconciliation
/api/admin/reviews
/api/admin/reviews/[id]
/api/admin/safety/logs
/api/admin/search
/api/admin/security
/api/admin/service-zones
/api/admin/service-zones/[id]
/api/admin/service-zones/[id]/exclude
/api/admin/service-zones/[id]/exclusions/[exclusionId]
/api/admin/service-zones/[id]/include
/api/admin/service-zones/[id]/inclusions/[inclusionId]
/api/admin/service-zones/[id]/publish
/api/admin/service-zones/[id]/rollout-summary
/api/admin/service-zones/areas/geometry
/api/admin/service-zones/areas/postal-codes
/api/admin/service-zones/areas/search
/api/admin/service-zones/clone
/api/admin/settings
/api/admin/settings/sales
/api/admin/settings/section-permissions
/api/admin/sms-templates
/api/admin/sms-templates/[id]
/api/admin/staff
/api/admin/staff/[id]
/api/admin/staff/[id]/reset-password
/api/admin/subscription-metrics
/api/admin/subscription-plans
/api/admin/support-ticket-assignees
/api/admin/support-tickets
/api/admin/support-tickets/[id]
/api/admin/support-tickets/[id]/messages
/api/admin/support-tickets/[id]/notes
/api/admin/system-health
/api/admin/taxes
/api/admin/travel-fees
/api/admin/user-reports
/api/admin/user-reports/[id]
/api/admin/users
/api/admin/users/[id]
/api/admin/users/[id]/bookings
/api/admin/users/[id]/export
/api/admin/users/[id]/impersonate
/api/admin/users/[id]/password
/api/admin/users/[id]/role
/api/admin/users/bulk
/api/admin/users/search
/api/admin/verifications
/api/admin/verifications/[id]
/api/admin/verifications/[id]/view
/api/admin/webhooks/endpoints
/api/admin/webhooks/endpoints/[id]
/api/admin/webhooks/endpoints/[id]/test
/api/admin/webhooks/failures
/api/admin/webhooks/failures/[id]/retry
```

---

## Related docs

- [GLOBAL_EXPANSION_GUIDE.md](./GLOBAL_EXPANSION_GUIDE.md) — broader expansion notes grounded in the current codebase.
