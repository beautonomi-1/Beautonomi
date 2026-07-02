# Super Admin Portal — Redesign & Improvement Blueprint

Status: Proposal (audit + blueprint only — no code changes)
Scope: Restructure and standardize the existing portal (navigation, information architecture, page patterns, states). No net-new backend.
Portal: `apps/admin-web` (Vite + React SPA at `/admin`), backed by `apps/web/src/app/api/admin/*` (~220 route handlers) and 732 Supabase migrations.
Audience: Platform owners / super admins, section admins, support and provider-ops staff.

> Terminology note that shapes everything below: in this platform, **"tenant" = a regional market instance** (e.g. `za` = South Africa), *not* a per-customer B2B organisation. The marketplace participants are **providers** and **customers**. The generic "Tenants & Organisations = customer accounts" model in typical B2B SaaS does **not** map here; the real centre of gravity is Providers, Customers, Operations, Finance, and Platform configuration. The IA in this document is designed around the actual domain.

---

## A. Executive Summary

### What is wrong with the current experience
The portal is **functionally strong but architecturally noisy**. It already has ~140 routes, ~220 working APIs, real RBAC, MFA, tenant scoping, and audit logging. The problem is not missing capability — it is **information architecture and consistency**:

- **12 navigation groups of wildly uneven size** — "Support" has 1 item; "Marketing & comms" has 15; "Integrations & dev" has 16. This creates scan fatigue and hides important controls.
- **Three groups whose names all contain "operations"** — "Provider Ops Hub", "Providers & operations", "Operations" — which makes it genuinely hard to know where a task lives.
- **Literal duplicate links** — `/admin/notifications` appears twice (as "Notifications" under Marketing and "OneSignal (push)" under Integrations); "WhatsApp Templates" appears twice pointing at two different routes.
- **Trust & safety scattered across 3 groups** — Disputes/User Reports/Refunds under "Providers & operations", Verifications/Audit Logs under "Users & trust", Safety logs under "Platform config".
- **A parallel "Control Plane" universe** that duplicates concepts already in the sidebar: two feature-flag surfaces, two integration surfaces, two audit surfaces. It is unclear which is authoritative.
- **Access management is mislocated** — "Admin team" and "Team permissions" (who can enter the portal and what they can do) live under "Platform config" next to feature flags and referral sources.
- **No global breadcrumbs**; deep entity pages (`bookings/:id`, `users/:id`) have no navigational context.

### What it should become
A **grouped, predictable, 13-section control centre** where any function is reachable in 2–3 clicks, trust/safety and audit are consolidated, access management has a home, and the "Control Plane" is reframed as the superadmin-only platform layer rather than a duplicate of everyday tools. The strong existing component library (`AdminPageHeader`, `AdminQueryBlock`, `AdminDataTable`, `EmptyState`, `PermissionDenied`) is standardized further with **breadcrumbs, consistent filter bars, and consistent action bars**.

### Is the current design production-ready?
**Conditionally yes.** The portal is production-*capable* today: real data, server-side RBAC (`requireAdminSection`/`requireSuperadmin`), enforced admin MFA (migration `693`), tenant isolation, and audit logging (`audit_logs`) all exist. It is **not world-class** because of navigation cognitive load, duplicate/misleading labels, and fragmented trust/audit surfaces. None of these are hard functional blockers; they are enterprise-maturity gaps. The recommended restructure is an **enhancement, not a rescue**.

### Top UX / navigation risks
1. Duplicate links (`/admin/notifications`, WhatsApp templates) erode trust — users think two features exist.
2. "Control Plane vs Settings" ambiguity — admins may edit the wrong feature-flag/integration surface.
3. Trust/audit fragmentation means an investigator must visit 3–6 places.
4. Oversized groups (Marketing 15, Integrations 16) bury critical controls.

### Top implementation risks
1. Nav is a **shared source of truth**: `apps/admin-web/src/config/nav.ts` mirrors `apps/web/.../admin/AdminShell.tsx`, guarded by `navRoutesRegression.test.ts`. Any regroup must update both and keep the regression test green.
2. RBAC sections live in `@beautonomi/admin-access` and are enforced by ~220 server routes. **Visual regrouping must be decoupled from RBAC sections** (keep each item's existing `AdminSection` for gating) to avoid touching the backend — see Section J.
3. Two authoritative-looking surfaces (Control Plane feature flags vs Settings feature flags) must be reconciled carefully to avoid changing runtime behaviour.

---

## B. Current State Audit

### B.1 Navigation issues (evidence: `apps/admin-web/src/config/nav.ts`)
- **Uneven groups**: Support (1), Users & trust (3), Operations (4), E-commerce (5), Overview (6), Content & catalog (7), Provider Ops Hub (8), Providers & operations (9), Finance (12), Platform config (16), Marketing & comms (15), Integrations & dev (16).
- **Name collisions**: `Provider Ops Hub`, `Providers & operations`, `Operations`.
- **Duplicate links**:
  - `Notifications` → `/admin/notifications` (Marketing) and `OneSignal (push)` → `/admin/notifications` (Integrations) — same route, two labels.
  - `WhatsApp Templates` → `/admin/whatsapp-content-templates` (Marketing) **and** `WhatsApp Templates` → `/admin/whatsapp/templates` (Integrations) — same label, two routes.
- **Fragmented trust/safety**: `disputes`, `user-reports`, `refunds` under Providers & operations; `verifications`, `audit-logs` under Users & trust; `control-plane/safety-logs` under Platform config.
- **Mislocated access controls**: `settings/admin-team` and `settings/team-permissions` under Platform config.
- **Reference data misfiled**: `ISO Codes` under Integrations & dev.
- **Internal help misfiled**: `Knowledge base` under Overview.
- **Parallel Control Plane duplication**:
  - Feature flags: `/admin/settings/feature-flags` vs `/admin/control-plane/feature-flags`.
  - Integrations: `/admin/integrations/*` vs `/admin/control-plane/integrations/*`.
  - Audit: `/admin/audit-logs` (`audit_logs`) vs `/admin/control-plane/audit-log` (`config_change_log`).

### B.2 Journey issues
- **No breadcrumbs**: only ad-hoc ones (e.g. `KnowledgeBaseArticlePage`) and `CpBack` in control plane. Users lose their place on detail pages.
- **Trust investigation is multi-hop**: a dispute involving a customer, provider, refund, and audit trail requires jumping between `disputes`, `users/:id`, `providers/:id`, `refunds`, and `audit-logs` with no linking.
- **Two feature-flag journeys** with unclear precedence (tenant override logic lives in DB `is_feature_enabled(key, tenant_id)`).
- **Provider verification spans two systems** (manual `user_verifications` + Sumsub `provider_verification_status`) surfaced across `verifications`, `providers/:id`, and `control-plane/integrations/sumsub` — no single "provider verification" view.

### B.3 Page structure issues
- **Good baseline**: `components/ui/AdminPageHeader.tsx`, `components/admin/AdminQueryBlock.tsx` (loading → 403 → retry → render), `components/ui/EmptyState.tsx`, `components/ui/PermissionDenied.tsx`, `components/admin/AdminDataTable.tsx`, `components/admin/AdminModal.tsx` are widely reused — consistency floor is decent.
- **Gaps**: no global breadcrumb component; filter/toolbar patterns vary per page; **saved views** do not exist; bulk actions exist server-side (`users/bulk`, `providers/bulk`, `bookings/bulk`, `payouts/bulk-approve`) but are not presented consistently in the UI.

### B.4 Factual functionality issues
- **Mostly factual**: nearly every nav item resolves to a real API + table (see Section C). This portal does **not** have a widespread "fake button" problem.
- **Ambiguity, not fakeness**: the duplicate feature-flag / integration / audit surfaces are all real but confusingly co-present.
- **Minor**: `OneSignal (push)` and `Notifications` are the same page under two names.

### B.5 Permission / security issues
- **Strong**: `requireAdminSection` / `requireSuperadmin` (`apps/web/src/lib/supabase/api-helpers.ts`); superadmin bypass via `is_superadmin()`; admin MFA enforced by default (migration `693_enforce_admin_two_factor_policy.sql`); tenant scoping via `user_tenant_roles`; frontend gating via `useAdminSectionPage`/`useSuperadminPage` + sidebar `canAccess()` filtering, protected by `authGuardRegression.test.ts`.
- **Audit fragmentation (governance risk)**: six audit stores exist — `audit_logs`, `tenant_audit_log`, `compliance_purge_audit_log`, `booking_audit_log`, `gods_eye_audit_log`, `config_change_log` — but the UI surfaces only two (`audit-logs`, `control-plane/audit-log`). No unified investigator view.
- **Minor**: `support-tickets/[id]/seen` does not write an audit entry (low risk).

### B.6 UI consistency issues
- Custom Tailwind + lucide-react library is coherent. The **inconsistencies are navigational** (labels, duplicates, grouping) and **structural** (no breadcrumbs, varied filter bars), not visual-primitive-level.

---

## C. Proposed Navigation Model

Design target: **13 top-level sections** (within the 10–13 rule), each internally coherent, with duplicates removed and trust/access/audit consolidated. Every item keeps its **existing `AdminSection` for RBAC** (the "Perm" column), so visual regrouping does **not** require backend changes.

Status legend: `existing` (route+API live today) · `rename` · `relocate` (move between groups) · `merge` (consolidate duplicates) · `future` (recommended, not yet backed — out of current scope).
Priority: P1 (do first) · P2 · P3.

### 1. Overview
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Dashboard | `/admin/dashboard` | Platform KPIs & quick links | Overview | `/api/admin/dashboard` | existing | keep as landing | P1 |
| Platform Health | `/admin/system-health` | Health checks & probes | Operations | `/api/admin/system-health`, `/api/admin/monitoring/health` | merge | Merge System Health + Monitoring into one "Platform Health" | P2 |
| Activity & Alerts | `/admin/activity` (surface existing feed) | Recent admin activity / alerts | Overview | `/api/admin/activity` | relocate | Promote header activity feed to a page | P2 |
| Analytics | `/admin/analytics` | Platform analytics | Overview (superadmin) | `/api/admin/analytics` | existing | keep | P2 |
| Geo & Devices | `/admin/analytics/geo` | Geo/device breakdown | Overview (superadmin) | `/api/admin/analytics/geo` | existing | keep | P3 |
| Reports | `/admin/reports` | Report hub | Overview | `/api/admin/reports/*` | existing | keep | P2 |

### 2. Operations
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Support Tickets | `/admin/support-tickets` | Agent queue | Support | `/api/admin/support-tickets` | relocate | Move from stand-alone "Support" group | P1 |
| Bookings | `/admin/bookings` | Booking management | Providers/Ops | `/api/admin/bookings` | existing | keep | P1 |
| Group Bookings | `/admin/group-bookings` | Multi-guest sessions | Providers/Ops | `/api/admin/group-bookings` | existing | keep | P3 |
| Gods Eye (Live Map) | `/admin/gods-eye` | Live operational map | Operations (superadmin) | `/api/admin/gods-eye` | relocate | Move from Overview to Operations | P2 |
| Market Coverage | `/admin/service-zones` | Service zones | Operations | `/api/admin/service-zones` | relocate | Move from Operations grab-bag | P2 |

### 3. Trust & Safety
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Disputes | `/admin/disputes` | Booking disputes | Providers/Ops | `/api/admin/disputes` | relocate | Consolidate here | P1 |
| Refunds | `/admin/refunds` | Refund review (wallet credits) | Finance/Ops | `/api/admin/refunds` | relocate | Show in Trust queue + link Finance | P1 |
| Reviews & Ratings | `/admin/reviews` | Review moderation | Providers/Ops | `/api/admin/reviews` | relocate | Consolidate here | P2 |
| User Reports | `/admin/user-reports` | Abuse reports | Providers/Ops | `/api/admin/user-reports` | relocate | Consolidate here | P2 |
| Identity Verifications | `/admin/verifications` | KYC review queue | Users/Trust | `/api/admin/verifications` | relocate | Move from Users & trust | P1 |
| Safety Logs | `/admin/control-plane/safety-logs` | Safety events | Ops (superadmin) | `/api/admin/safety/logs` | relocate | Move out of Control Plane | P2 |

### 4. Providers
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Providers | `/admin/providers` | Provider directory | Providers/Ops | `/api/admin/providers` | existing | keep | P1 |
| Provider Detail | `/admin/providers/:id` | Profile, services, payouts | Providers/Ops | `/api/admin/providers/[id]` | existing | add breadcrumbs | P1 |
| Staff | `/admin/staff` | Cross-provider staff | Providers/Ops | `/api/admin/staff` | existing | keep | P3 |
| Distance Settings | `/admin/providers/distance-settings` | Travel/radius defaults | Providers/Ops | `/api/admin/providers/[id]/distance-settings` | existing | keep | P3 |
| Provider Subscriptions | `/admin/provider-subscriptions` | SaaS subs | Finance (superadmin) | `/api/admin/provider-subscriptions` | existing | cross-link from Finance | P3 |
| Referral Sources | `/admin/referral-sources` | Referral taxonomy | Providers/Ops | `/api/admin/referral-sources` | relocate | Move from Platform config | P3 |

### 5. Provider Onboarding *(the Ops Hub CRM — renamed to kill "operations" collision)*
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Dashboard | `/admin/provider-ops` | Onboarding hub | ProviderOps | `/api/admin/provider-ops/dashboard` | rename | Group label → "Provider Onboarding" | P1 |
| Lead Inbox | `/admin/provider-ops/leads` | Lead pipeline | ProviderOps | `/api/admin/provider-ops/leads` | existing | keep | P2 |
| Pipeline Board | `/admin/provider-ops/pipeline` | Kanban stages | ProviderOps | `/api/admin/provider-ops/pipeline/stats` | existing | keep | P2 |
| Onboarding Tracker | `/admin/provider-ops/tracker` | Signup progress | ProviderOps | `/api/admin/provider-ops/tracker` | existing | keep | P2 |
| Activation Queue | `/admin/provider-ops/activation` | Pending activations | ProviderOps | `/api/admin/provider-ops/activation-queue` | existing | keep | P2 |
| Duplicate Review | `/admin/provider-ops/duplicates` | Merge dupes | ProviderOps | `/api/admin/provider-ops/duplicates` | existing | keep | P3 |
| Reports | `/admin/provider-ops/reports` | Funnel/dropoff | ProviderOps | `/api/admin/provider-ops/reports/*` | existing | keep | P3 |
| Settings | `/admin/provider-ops/settings` | Ops config | ProviderOps | `/api/admin/provider-ops/settings` | existing | keep | P3 |

### 6. Customers
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Customers & Users | `/admin/users` | User directory | Users/Trust | `/api/admin/users` | rename | Clarify this is end-user accounts | P1 |
| User Detail | `/admin/users/:id` | Profile, bookings, wallet | Users/Trust | `/api/admin/users/[id]` | existing | add breadcrumbs + activity tab | P1 |

### 7. Finance
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Finance Overview | `/admin/finance` | GMV/revenue/payouts | Finance | `/api/admin/finance/summary` | existing | keep | P1 |
| Payouts | `/admin/payouts` | Payout batches | Finance | `/api/admin/payouts` | existing | keep | P1 |
| Fee Management | `/admin/fees` | Fee configs | Finance | `/api/admin/fees/*` | existing | keep | P2 |
| Platform Fees | `/admin/settings/platform-fees` | Platform fee settings | Finance | `/api/admin/platform-fees` | existing | keep (sub-page) | P3 |
| Taxes | `/admin/taxes` | Tax rules | Finance | `/api/admin/taxes` | existing | keep | P3 |
| Period Locks | `/admin/period-locks` | Accounting locks | Finance | `/api/admin/finance/period-locks` | existing | keep | P3 |
| Wallet Reconciliation | `/admin/wallet-reconciliation` | Wallet recon | Finance | `/api/admin/finance/wallet-reconciliation` | existing | keep | P3 |
| Paystack Terminal | `/admin/paystack-terminal` | Terminal ops | Finance | `/api/admin/paystack-terminal/*` | existing | keep | P3 |
| Subscription Revenue | `/admin/subscription-revenue` | Sub metrics | Finance (superadmin) | `/api/admin/subscription-metrics` | existing | keep | P3 |
| Plans & Pricing | `/admin/plans` | Plan editor | Finance (superadmin) | `/api/admin/subscription-plans` | existing | keep | P2 |
| Billing | `/admin/billing` | Platform billing | Finance (superadmin) | `/api/admin/invoices` | existing | keep | P3 |

### 8. Commerce & Catalog
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| E-commerce Overview | `/admin/ecommerce` | Commerce KPIs | Ecommerce | `/api/admin/ecommerce/overview` | existing | keep | P3 |
| Product Orders | `/admin/ecommerce/orders` | Orders | Ecommerce | `/api/admin/product-orders` | existing | keep | P3 |
| Product Returns | `/admin/ecommerce/returns` | Returns | Ecommerce | `/api/admin/product-returns` | existing | keep | P3 |
| Product Catalog | `/admin/ecommerce/products` | Products | Ecommerce | `/api/admin/ecommerce/catalog` | existing | keep | P3 |
| Add-ons | `/admin/addons` | Platform add-ons | Ecommerce | `/api/admin/addons` | existing | keep | P3 |
| Service Catalog | `/admin/catalog` | Global services | Content/Catalog | `/api/admin/catalog/services` | relocate | Move from Content group | P2 |
| Global Categories | `/admin/catalog/global-categories` | Category taxonomy | Content/Catalog | `/api/admin/catalog/global-categories` | relocate | Move from Content group | P2 |
| Gift Cards | `/admin/gift-cards` | Gift card inventory | Marketing | `/api/admin/gift-cards` | relocate | Move from Marketing | P3 |

### 9. Marketing
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Ads & Campaigns | `/admin/ads` | Campaigns | Marketing (superadmin) | `/api/admin/ads/*` | existing | keep | P3 |
| Promotions | `/admin/promotions` | Discount codes | Marketing | `/api/admin/promotions` | existing | keep | P3 |
| Loyalty | `/admin/loyalty` | Loyalty rules | Marketing | `/api/admin/loyalty/*` | existing | keep | P3 |
| Gamification | `/admin/gamification/*` | Points/badges/ops | Marketing | `/api/admin/gamification/*` | merge | Collapse 3 items into one hub w/ tabs | P3 |
| Automations | `/admin/automations` | Marketing automations | Marketing | `/api/admin/automations` | existing | keep | P3 |
| Marketing Pricebook | `/admin/marketing-pricebook` | Pricebook | Marketing | `/api/admin/marketing/pricebook` | existing | keep | P3 |
| Broadcast | `/admin/broadcast` | Mass messaging | Marketing | `/api/admin/broadcast/*` | existing | keep | P3 |

### 10. Communications *(split out of overloaded "Marketing & comms")*
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Notifications | `/admin/notifications` | Push/OneSignal config | Marketing | `/api/admin/notifications/config` | merge | **Remove duplicate "OneSignal (push)" link** | P1 |
| Notification Templates | `/admin/notification-templates` | Multi-channel templates | Marketing | `/api/admin/notification-templates` | existing | keep | P3 |
| SMS Templates | `/admin/sms-templates` | SMS templates | Marketing | `/api/admin/sms-templates` | existing | keep | P3 |
| Email Templates | `/admin/email-templates` | Email templates | Marketing | `/api/admin/email-templates` | existing | keep | P3 |
| WhatsApp Content Templates | `/admin/whatsapp-content-templates` | Meta content templates | Marketing | `/api/admin/whatsapp/content-templates` | rename | Disambiguate from session templates | P1 |
| WhatsApp Sessions | `/admin/whatsapp/sessions` | Device sessions | Integrations | `/api/admin/whatsapp/sessions` | relocate | Move from Integrations | P2 |
| WhatsApp Templates | `/admin/whatsapp/templates` | Session templates | Integrations | `/api/admin/whatsapp/templates` | rename | Rename → "WhatsApp Session Templates" | P1 |

### 11. Content
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Content Hub | `/admin/content` | CMS landing | Content/Catalog | `/api/admin/content/*` | existing | keep | P3 |
| Learning Center | `/admin/content/learning` | Learning CMS | Content/Catalog | `/api/admin/content/learning/*` | existing | keep | P3 |
| CMS Resources | `/admin/content/resources` | Resources | Content/Catalog | `/api/admin/content/resources` | existing | keep | P3 |
| FAQs | `/admin/content/faqs` | FAQ content | Content/Catalog | `/api/admin/content/faqs` | existing | keep | P3 |
| Explore Feed | `/admin/explore` | Feed moderation | Content/Catalog | `/api/admin/explore/posts` | existing | keep | P3 |
| Knowledge Base | `/admin/knowledge-base` | Internal help | Overview | `/api/admin/learning/*` | relocate | Move from Overview to Content/Help | P3 |

### 12. Integrations & Developers
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Integrations Hub | `/admin/control-plane/integrations` | Integration index | Platform (superadmin) | control-plane integration configs | existing | keep as index | P2 |
| Paystack | `/admin/integrations/paystack` | Payment gateway | Integrations | `/api/admin/integrations/paystack` | existing | keep | P3 |
| Yoco Web POS | `/admin/integrations/yoco` | POS | Integrations (superadmin) | `/api/admin/integrations/yoco` | existing | keep | P3 |
| Resend | `/admin/integrations/resend` | Email | Integrations | `/api/admin/integrations/resend` | existing | keep | P3 |
| Slack | `/admin/integrations/slack` | Slack routing | Integrations | `/api/admin/integrations/slack` | existing | keep | P3 |
| Amplitude | `/admin/integrations/amplitude` | Analytics | Integrations | `/api/admin/integrations/amplitude` | existing | keep | P3 |
| Mapbox | `/admin/mapbox` | Maps config | Integrations | `/api/admin/mapbox/config` | existing | keep | P3 |
| Sumsub / Gemini / Aura / Wasender | `/admin/control-plane/integrations/*` | KYC/AI/WA configs | Platform (superadmin) | control-plane integration configs | existing | keep under hub | P2 |
| Webhooks | `/admin/webhooks` | Webhook endpoints + failures | Integrations | `/api/admin/webhooks/*` | existing | surface failures/retry | P2 |
| API Keys | `/admin/api-keys` | Key issuance/rotation | Integrations | `/api/admin/api-keys` | existing | keep | P3 |
| ISO Codes | `/admin/iso-codes` | Reference data | Integrations | `/api/admin/iso-codes/*` | relocate | Move to Platform & Access reference | P3 |

### 13. Security & Compliance
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| Security Policy | `/admin/security` | Auth/MFA/session policy | Operations | `/api/admin/security` | relocate | Move from Operations grab-bag | P1 |
| Audit Logs | `/admin/audit-logs` | Platform audit | Users/Trust | `/api/admin/audit-logs` | existing | make the unified audit home | P1 |
| Config Change Log | `/admin/control-plane/audit-log` | Config changes | Platform (superadmin) | `/api/admin/control-plane/config-change-log` | relocate | Present as a tab of Audit Logs | P2 |
| Compliance Purge | `/admin/control-plane/compliance` | GDPR purge | Platform (superadmin) | `/api/admin/compliance/purge-user` | relocate | Move from Control Plane | P2 |
| Tenant Reset | `/admin/control-plane/tenant-reset` | Destructive reset | Platform (superadmin) | `/api/admin/compliance/reset-tenant` | relocate | Keep destructive, clearly labelled | P2 |

### Platform & Access *(section 13b — superadmin platform layer + access management)*
| Item | Route | Purpose | Perm | Data / API | Status | Recommendation | Pri |
|---|---|---|---|---|---|---|---|
| General Settings | `/admin/settings` | Core platform settings | Platform | `/api/admin/settings` | existing | keep | P2 |
| Feature Flags | `/admin/settings/feature-flags` | Tenant flag toggles | Platform | `/api/admin/feature-flags` | merge | Reconcile with control-plane flags (Section D) | P1 |
| Control Plane | `/admin/control-plane/overview` | Superadmin module/env config | Platform (superadmin) | control-plane routes | rename | Reframe as "Platform (Advanced)" | P2 |
| Tenants (Markets) | `/admin/settings/tenants` | Market instances | Platform (superadmin) | `/api/admin/tenants` | rename | Label "Markets" to reflect meaning | P2 |
| Tenant Domains | `/admin/settings/tenant-domains` | Custom domains | Platform (superadmin) | `/api/admin/tenant-domains` | existing | keep | P3 |
| App Version | `/admin/settings/app-version` | Mobile version gates | Platform | `/api/admin/app-version` | existing | keep | P3 |
| Custom Fields | `/admin/settings/custom-fields` | Field definitions | Platform | `/api/admin/custom-fields` | existing | keep | P3 |
| Referral Settings | `/admin/settings/referrals` | Referral program | Platform | `/api/admin/referrals` | existing | keep | P3 |
| Admin Team | `/admin/settings/admin-team` | Portal user management | Platform (superadmin) | `/api/admin/settings/admin-team` | relocate | **Access management belongs here** | P1 |
| Roles & Permissions | `/admin/settings/team-permissions` | Section RBAC matrix | Platform (superadmin) | `/api/admin/settings/section-permissions` | relocate | Pair with Admin Team | P1 |

> To stay at 13 top-level sections, "Security & Compliance" and "Platform & Access" may be presented as two groups or as one "Platform, Security & Access" group with sub-headers. Recommended: keep them as two groups and merge a lighter section elsewhere (e.g. fold "Communications" back under Marketing with a divider) if a strict 13 cap is required. Either way, no group should exceed ~9 items.

### Items to remove / merge (explicit)
- **Remove** `OneSignal (push)` link (duplicate of `Notifications`).
- **Rename** the two "WhatsApp Templates" to `WhatsApp Content Templates` (Meta) and `WhatsApp Session Templates` (Wasender).
- **Merge** the three Gamification items into one hub with tabs.
- **Merge** System Health + Monitoring into "Platform Health".
- **Reconcile** the two feature-flag surfaces and two audit surfaces (see Section D).

---

## D. Proposed Information Architecture

### What belongs where (rationale)
- **Overview** = read-only situational awareness (KPIs, health, activity, analytics, reports). No entity CRUD.
- **Operations** = daily work queues that move bookings forward (bookings, group bookings, live map, market coverage, support tickets).
- **Trust & Safety** = everything about resolving conflict and verifying people: disputes, refunds (as resolution outcomes), reviews, user reports, identity verification, safety logs. *This is the single biggest IA win — it collapses today's 3-way scatter.*
- **Providers** = the provider entity and its lifecycle configuration.
- **Provider Onboarding** = the sales/onboarding CRM (distinct persona: `provider_ops`), renamed to remove the "operations" collision.
- **Customers** = the end-user entity.
- **Finance** = all money movement and configuration.
- **Commerce & Catalog** = product commerce + the service catalogue that defines what can be sold.
- **Marketing** / **Communications** = campaigns vs message plumbing (split to defuse the 15-item overload).
- **Content** = CMS + help/knowledge.
- **Integrations & Developers** = third-party connections + developer surfaces (webhooks, API keys).
- **Security & Compliance** = policy, unified audit, compliance/destructive ops.
- **Platform & Access** = superadmin platform layer (markets/tenants, flags, control plane) + who can access the portal (admin team, roles).

### What should move
- Disputes, Refunds, Reviews, User Reports → **Trust & Safety**.
- Verifications → **Trust & Safety** (from Users & trust).
- Safety Logs → **Trust & Safety** (from Control Plane).
- Security Policy → **Security & Compliance** (from Operations).
- Admin Team + Team Permissions → **Platform & Access** (from Platform config, presented as Access management).
- Service Catalog + Global Categories → **Commerce & Catalog** (from Content).
- Gift Cards → **Commerce & Catalog** (from Marketing).
- WhatsApp Sessions → **Communications** (from Integrations).
- ISO Codes → **Platform & Access** reference (from Integrations).
- Gods Eye → **Operations** (from Overview).
- Knowledge Base → **Content** (from Overview).

### What should merge
- Feature flags: keep **Settings → Feature Flags** as the everyday tenant-flag surface; keep **Control Plane → Feature Flags** as the environment/rollout advanced surface, but **label them distinctly** ("Feature Flags" vs "Feature Flags (Environment Rollout)") and cross-link, since both write `feature_flags` with different scopes (`tenant_id` vs env/rollout columns from migration `249`). Do not silently unify runtime behaviour.
- Audit: present **Config Change Log** (`config_change_log`) as a **tab** inside the Audit Logs page so investigators have one destination; keep the underlying tables separate.
- Gamification: one hub, three tabs.
- System Health + Monitoring → one page.

### What should be removed / hidden
- Remove the duplicate `OneSignal (push)` nav entry.
- Hide `future` items (see below) until backed.

### What should be added (as future, out of current scope)
These are recommended for enterprise maturity but require **new backend** and are therefore **explicitly out of this restructure**:
- **Access Reviews** (periodic admin-access attestation) — no table today.
- **Impersonation Log viewer** — impersonation exists (`/api/admin/users/[id]/impersonate`, `/api/admin/impersonation/*`) and is audited to `audit_logs`, but there is no dedicated viewer page.
- **Saved Views / scheduled reports** — no persistence layer today.
- **SSO configuration UI** — MFA policy exists; SSO does not.
Mark these "coming soon" only in non-production and keep them out of the production sidebar.

---

## E. Super Admin Journey Improvements

Format per journey: current issue → improved flow → pages → APIs/data → permission → audit → notification → acceptance.

### E.1 Provider Verification
- **Current issue**: verification data is split across `verifications`, `providers/:id`, and `control-plane/integrations/sumsub`; manual (`user_verifications`) vs Sumsub (`provider_verification_status`) are not unified.
- **Improved flow**: Trust & Safety → Identity Verifications queue → open case → see manual + Sumsub state in one view → Approve / Reject / Request changes → provider notified → status syncs to provider app.
- **Pages**: `verifications`, `verifications/:id`, deep-link to `providers/:id`.
- **APIs/data**: `/api/admin/verifications`, `/api/admin/verifications/[id]` (PATCH); `user_verifications`, `provider_verification_status`; `syncProviderVerificationState`.
- **Permission**: `ADMIN_SECTION_USERS_TRUST`.
- **Audit**: `writeAuditLog` on PATCH (exists).
- **Notification**: `notify-identity-verification-reviewed` + Slack/push (exists).
- **Acceptance**: reviewer sees both verification systems on one page; decision writes audit + notifies within one action.

### E.2 Escalation / Dispute Resolution
- **Current issue**: a dispute touching customer, provider, refund, and audit requires jumping across 5 unlinked pages.
- **Improved flow**: Trust & Safety → Disputes → open dispute → tabs for Booking, Customer, Provider, Payments/Refund, History (audit) → resolve (optionally issue wallet refund) → parties notified → audit recorded.
- **Pages**: `disputes`, `bookings/:id`, `users/:id`, `providers/:id`, `refunds`.
- **APIs/data**: `/api/admin/disputes/[id]` (PATCH → `issueAdminWalletRefund`); `booking_disputes`, `booking_refunds`, `payment_transactions`.
- **Permission**: `ADMIN_SECTION_PROVIDERS_OPERATIONS`.
- **Audit**: `admin.dispute.update` (exists).
- **Notification**: refund/resolution notifications.
- **Acceptance**: resolver can reach customer, provider, and payments context from the dispute without leaving it (deep links + drawers); resolution + refund is a single confirmed, audited action.

### E.3 Failed Integration / Webhook Retry
- **Current issue**: webhook failures (`/api/admin/webhooks/failures`) and Slack logs are not surfaced prominently.
- **Improved flow**: Integrations → Webhooks → Failures tab → open failure → inspect payload safely → Retry / Mark resolved → outcome confirmed → audit.
- **APIs/data**: `/api/admin/webhooks/failures`, `/api/admin/webhooks/failures/[id]/retry`; `webhook_events`.
- **Permission**: `ADMIN_SECTION_INTEGRATIONS_DEV`.
- **Audit**: add audit on retry (verify — otherwise flag as gap, no new table needed).
- **Acceptance**: an integrations admin can find, understand, retry, and confirm a failed sync in one flow.

### E.4 Feature Flag Change
- **Current issue**: two flag surfaces (settings vs control-plane), unclear precedence.
- **Improved flow**: Platform & Access → Feature Flags → filter by tenant/category → open flag → see scope (global vs tenant override) → toggle → confirm risk → audit.
- **APIs/data**: `/api/admin/feature-flags`, `/api/admin/feature-flags/[id]`; `feature_flags` with `tenant_id` override (`is_feature_enabled(key, tenant_id)`).
- **Permission**: `ADMIN_SECTION_PLATFORM_CONFIG`.
- **Audit**: `config_change_log` / `audit_logs`.
- **Acceptance**: admin can see, for a given flag, its global default and any tenant overrides in one place, and the two surfaces are clearly distinguished by label.

### E.5 Admin Access Change
- **Current issue**: access management is buried in Platform config.
- **Improved flow**: Platform & Access → Admin Team → open member → change role → confirm → audit → session impact shown.
- **APIs/data**: `/api/admin/settings/admin-team`, `/api/admin/settings/section-permissions`; `users.role`, `platform_settings.admin_section_roles`.
- **Permission**: `superadmin`.
- **Audit**: role change audited (exists via users PATCH).
- **Acceptance**: superadmin can grant/revoke portal access and section permissions from one Access area with clear confirmation and audit.

### E.6 Support Intervention
- **Current issue**: Support is a stand-alone single-item group; `seen` not audited.
- **Improved flow**: Operations → Support Tickets → filter (SLA/attention) → open → reply/note/assign → status update → audit.
- **APIs/data**: `/api/admin/support-tickets*`; `support_tickets` (+ `needs_agent_response` from migration `726`).
- **Permission**: staff roles (`SUPPORT_TICKET_STAFF_ROLES`).
- **Audit**: create/update audited; recommend auditing `seen` (minor).
- **Acceptance**: agent can triage by SLA/attention, respond, and hand off with audit.

---

## F. Page-by-Page Design Recommendations

Applies the standard: Header (title, description, primary/secondary actions, breadcrumbs, status) · Summary (metrics/alerts) · Main (right pattern) · Filters/Search · Actions (labelled, permission-protected, wired, validated, logged, confirmed, reflected) · States (loading/empty/error/permission-denied/success).

### Dashboard (`/admin/dashboard`)
- Pattern: cards + activity feed. Add "Items needing attention" (open disputes, SLA-breach tickets, pending payouts, verification queue) sourced from `/api/admin/nav-counts`. States: use `AdminQueryBlock`.

### Support Tickets (`/admin/support-tickets`)
- Pattern: table + inline detail pane (exists). Standardize filter bar (status, SLA, assignee, attention). Actions: reply/note/assign/status. Empty: "No tickets match". Keep realtime.

### Disputes (`/admin/disputes`)
- Pattern: table → detail with tabs (Booking, Customer, Provider, Payments, History). Primary action: Resolve (confirmed, may issue refund). Deep links to entities. Audit on resolve.

### Refunds (`/admin/refunds`)
- Pattern: table with status filter. Primary action: Process refund (confirmation modal clarifying it is a **wallet credit**, not bank reversal). Permission: Finance. Audit via `issueAdminWalletRefund`.

### Identity Verifications (`/admin/verifications`, `/:id`)
- Pattern: queue → case detail combining manual + Sumsub. Actions: Approve/Reject/Request changes (confirmed). Breadcrumbs. Notify + sync provider.

### Providers (`/admin/providers`, `/:id`)
- Pattern: directory table with status filter + bulk actions (`providers/bulk`); detail with tabs (Profile, Services, Payouts, Subscriptions, Verification, Activity). Breadcrumbs. Destructive status changes confirmed + audited (`providers/[id]/status`, `/verify`).

### Customers & Users (`/admin/users`, `/:id`)
- Pattern: directory + detail tabs (Profile, Bookings, Wallet, Loyalty, Support history, Activity). Sensitive actions (impersonate, reset password, wallet credit, purge) behind confirmation + audit.

### Finance Overview (`/admin/finance`)
- Pattern: metric cards + drilldowns. Period filter. Link to Payouts/Fees/Reconciliation.

### Payouts (`/admin/payouts`)
- Pattern: queue table + bulk approve (`payouts/bulk-approve`). Per-row actions (approve/reject/mark-paid/initiate-transfer) confirmed + audited. Readiness checks (`validate-provider-payout-readiness`).

### Feature Flags (`/admin/settings/feature-flags`)
- Pattern: table grouped by category. Show scope (global vs tenant override). Toggle confirmed for high-impact flags. Distinct from Control Plane flag surface by label.

### Audit Logs (`/admin/audit-logs`)
- Pattern: filterable timeline/table (actor, action, entity, risk, date). Add **Config Changes** tab (`config_change_log`). Export via `/api/admin/export/audit-logs`. Read-only.

### Admin Team + Roles (`/admin/settings/admin-team`, `/team-permissions`)
- Pattern: member list + role editor; permission matrix (section × role). Superadmin only. Changes confirmed + audited.

### Control Plane Overview (`/admin/control-plane/overview`)
- Pattern: hub of superadmin-only advanced config. Reframe copy to "Platform (Advanced)". Keep `CpBack`; add global breadcrumbs.

### Global standards for all list pages
- Consistent toolbar: Search · Status filter · Date filter (where relevant) · Tenant/market filter (superadmin) · (future) Saved views.
- Consistent empty/loading/error via `AdminQueryBlock` + `EmptyState`.

---

## G. Backend & Factual Functionality Requirements

Because scope = **no net-new backend**, this section is mostly a confirmation that the redesign rides on existing APIs, plus small wiring/consolidation items.

### Already exists (no change needed)
- **APIs**: all P1/P2 nav items map to live handlers under `/api/admin/*` (Section C).
- **Tables/views**: `tenants`, `feature_flags`, `audit_logs`, `booking_disputes`, `booking_refunds`, `payment_transactions`, `payouts`, `subscription_plans`, `provider_subscriptions`, `support_tickets`, `user_verifications`, `provider_verification_status`, `webhook_endpoints`/`webhook_events`, `api_keys`, `notification_templates`, integration/module config tables.
- **Permissions**: `requireAdminSection` / `requireSuperadmin` + `user_tenant_roles` scoping.
- **Audit**: `writeAuditLog` → `audit_logs`; `writeConfigChangeLog` → `config_change_log`.
- **Notifications**: notification-service + Slack/push in verification/dispute flows.

### Wiring / consolidation (frontend-only or config-only)
- Surface **webhook failures + retry** prominently (APIs already exist).
- Present **config change log as a tab** of Audit Logs (read existing endpoint).
- Distinguish the **two feature-flag surfaces** by label/scope display (read existing `tenant_id`/rollout columns).
- Remove duplicate `OneSignal (push)` nav link (no backend change).

### Small gaps to flag (verify; fix only if trivial and no new table)
- Add audit on `support-tickets/[id]/seen` and on webhook retry if not already logged.

### Out of scope (future, needs new backend — do NOT expose)
- Access Reviews table/flow; Impersonation-log viewer page; Saved Views persistence; scheduled reports; SSO config.

### Mocked / hardcoded to remove
- None material found. The portal is largely factual. The only "misleading" element is the **duplicate/renamed nav links**, addressed in Section C.

---

## H. Security & Governance Requirements

### Sensitive actions (require confirmation)
- Provider status change / suspension (`providers/[id]/status`).
- Refund / dispute resolution (`disputes/[id]`, `refunds/[id]`).
- User impersonation (`users/[id]/impersonate`).
- Password reset / role change (`users/[id]/role`, `/password`).
- Payout approve / transfer (`payouts/[id]/*`).
- Feature flag toggle (high-impact).
- Compliance purge / tenant reset (`compliance/*`).

### Step-up authentication
- Admin MFA already enforced platform-wide via `requireAdminMfaIfRequired` (migration `693`). Recommend **step-up (re-auth) prompts** specifically for: compliance purge, tenant reset, impersonation, and payout transfer. (UI/confirmation-level; no new backend required beyond existing MFA level check.)

### Audit requirements
- Keep all sensitive actions writing to `audit_logs` (already the case for most). Ensure `superadmin_bypass_used` is recorded (column exists, migration `465`).
- **Unify audit visibility**: Audit Logs page + Config Changes tab; keep specialized logs (`compliance_purge_audit_log`, `gods_eye_audit_log`, `booking_audit_log`, `tenant_audit_log`) accessible from their context.

### Export restrictions
- Exports (`/api/admin/export/*`) remain permission-gated per section; audit-log export superadmin/trust only.

### Role restrictions
- Preserve section RBAC per item (Section C "Perm" column). Visual regrouping must **not** widen access — each item keeps its current `AdminSection`.

### Tenant / market isolation
- Non-superadmin admins remain scoped by `user_tenant_roles`; superadmin scope picker persists in localStorage and invalidates queries on change (keep).

### Impersonation rules
- Impersonation start/end already audited (`/api/admin/impersonation/*`). Recommend a **future** read-only impersonation log viewer (out of scope).

---

## I. UX Standards & Component Rules

Anchor everything to the existing library; add breadcrumbs + toolbar standardization.

- **Layouts**: one shell — `components/layout/AdminChrome.tsx` (sidebar + header + `<Outlet/>`). All pages render inside it.
- **Sidebar**: grouped per the 13-section model; filter by **per-item `AdminSection`** (`canAccess`) + `superadminOnly`. No group > ~9 items. Badge counts from `/api/admin/nav-counts`.
- **Top bar**: global search, market/tenant scope (superadmin), activity/alerts, user menu.
- **Breadcrumbs**: add a global breadcrumb component; every detail page shows `Section › List › Entity`.
- **Page headers**: always `AdminPageHeader` with title, one-line description, primary action, optional secondary actions, status indicator.
- **Tables**: `AdminDataTable` with consistent toolbar (search/status/date/scope filters), row actions, and standardized bulk-action bar where bulk APIs exist.
- **Forms**: label + inline validation + disabled-until-valid submit; destructive submits use `AdminModal` confirmation.
- **Filters**: consistent order and placement; debounced search via `useDebouncedUrlParam`; state reflected in URL.
- **Modals / Drawers**: `AdminModal` for confirmations and quick actions; drawer for entity quick-view from a list.
- **Detail pages**: tabs for grouped entity info; timeline for history/audit.
- **States**: `AdminQueryBlock` (loading → 403 → retry → render); `EmptyState` for empty; `PermissionDenied` for 403; success via `adminToast`; error via `AdminRetryBlock`/`AdminMutationAlert`.
- **Destructive actions**: red styling, explicit confirmation naming the object, and (recommended) step-up for purge/reset/impersonation.
- **Bulk actions**: selection → sticky action bar → confirmation → per-item result feedback.

---

## J. Implementation Plan (for when execution is approved)

Guiding principle: **decouple visual IA from RBAC sections**. Change `NavItemConfig` to carry its own `section` (and optional `superadminOnly`), and change `AdminChrome` to filter by **item** section instead of group section. This lets us regroup visually **without touching the ~220 server routes or the `@beautonomi/admin-access` enum**.

1. **Navigation config refactor** (`apps/admin-web/src/config/nav.ts` + mirror `apps/web/.../admin/AdminShell.tsx`): implement the 13-section model; add per-item `section`; remove duplicate `OneSignal (push)`; rename WhatsApp templates; merge Gamification/Health entries. Keep `navRoutesRegression.test.ts` green.
2. **Layout / filtering** (`components/layout/AdminChrome.tsx`): filter by item section; support sub-headers within groups; cap group size.
3. **Breadcrumbs**: add a global breadcrumb component driven by route → section map; wire into `AdminChrome` and detail pages.
4. **Page header / action bar standardization**: audit pages for `AdminPageHeader` usage; add descriptions, primary/secondary actions, status indicators.
5. **Toolbar/filter standardization**: shared filter-bar component (search/status/date/scope) applied to top list pages.
6. **Trust & Safety consolidation**: move disputes/refunds/reviews/user-reports/verifications/safety-logs under the new group; add cross-links/tabs on detail pages (no data change).
7. **Audit consolidation**: add Config Changes tab to Audit Logs (reads existing endpoint).
8. **Feature-flag disambiguation**: relabel + show scope on both surfaces.
9. **States pass**: ensure every touched page uses `AdminQueryBlock` + `EmptyState` + `PermissionDenied` + success/error toasts.
10. **Tests**: update `navRoutesRegression.test.ts`, `authGuardRegression.test.ts`, smoke tests; add nav-model snapshot test.
11. **Verify**: run typecheck, lint, tests, build for `apps/admin-web` (and `apps/web` if AdminShell changes).
12. **Evidence report**: before/after nav screenshots, route coverage, test output.

### Suggested phasing
- **Phase 1 (P1)**: nav refactor + remove duplicates + Trust & Safety group + Access relocation + breadcrumbs + Support into Operations. Highest clarity gain, lowest risk.
- **Phase 2 (P2)**: audit tab, feature-flag disambiguation, webhook failures surfacing, toolbar standardization, health merge.
- **Phase 3 (P3)**: gamification hub, catalog/gift-card relocations, remaining cosmetic consistency.

---

## K. Acceptance Criteria

- **Navigation**: exactly 13 top-level sections (or ≤13); no group > ~9 items; no duplicate links; every item resolves to a real route. `navRoutesRegression.test.ts` passes.
- **Page grouping**: disputes/refunds/reviews/user-reports/verifications/safety-logs all reachable from **Trust & Safety**; admin-team/roles reachable from **Platform & Access**; security policy under **Security & Compliance**.
- **Provider workflows**: verification case shows manual + Sumsub in one view; approve/reject audited + notified; provider status change confirmed + audited.
- **Customer workflows**: user detail exposes bookings/wallet/loyalty/support/activity; sensitive actions confirmed + audited.
- **Operations workflows**: support tickets filterable by SLA/attention; bookings actions confirmed + audited.
- **Billing workflows**: refund modal clearly states wallet-credit semantics; payout actions confirmed + audited; period locks respected.
- **Integration workflows**: webhook failures visible; retry works and is audited.
- **Security workflows**: MFA enforced; destructive actions (purge/reset/impersonate) confirmed (recommended step-up); audit visible in one Audit Logs destination (+ Config Changes tab).
- **Reporting workflows**: reports reachable from Overview; exports permission-gated.
- **States**: every list/detail page shows correct loading/empty/error/permission-denied/success states.
- **Permissions**: no item grants access beyond its prior `AdminSection`; regression `authGuardRegression.test.ts` passes.

---

## L. Final Recommendation

### Production readiness (today)
- The Super Admin portal is **functionally production-capable**: real APIs, server-side RBAC, enforced MFA, tenant isolation, and audit logging are all in place.
- It is **not yet world-class** due to navigation cognitive load, duplicate/misleading labels, fragmented trust/audit, and mislocated access controls. These are **enterprise-maturity gaps, not functional blockers**.

### What must change before go-live (P1)
1. Remove duplicate nav links (`OneSignal (push)`; disambiguate WhatsApp templates).
2. Consolidate **Trust & Safety** and relocate **Access management** (Admin Team + Roles).
3. Add global **breadcrumbs**.
4. Distinguish the **two feature-flag surfaces**.
5. Move **Security Policy** into Security & Compliance; make **Audit Logs** the unified audit home.

### What can improve after go-live (P2/P3)
- Audit Config-Changes tab, webhook-failure surfacing, toolbar/saved-views standardization, gamification hub, catalog/gift-card relocations, and (future, new-backend) access reviews, impersonation-log viewer, saved views, SSO.

### Readiness scores
- **Super Admin UX readiness: ~62%** — strong components and coverage, held back by IA/navigation clarity and missing breadcrumbs.
- **Super Admin implementation readiness: ~85%** — APIs, data, permissions, and audit largely exist and are wired; work is mostly frontend restructuring.
- **Super Admin go-live readiness: ~75%** — usable in production now; ship P1 restructure to reach enterprise-grade confidence.

### Top 10 actions to reach world-class
1. Adopt the 13-section IA; enforce ≤9 items per group.
2. Create a **Trust & Safety** section (disputes, refunds, reviews, reports, verifications, safety logs).
3. Give **Access management** a home (Admin Team + Roles under Platform & Access).
4. Remove duplicate nav links and rename ambiguous ones.
5. Add global **breadcrumbs** and standardized page headers/action bars.
6. Make **Audit Logs** the single audit destination (+ Config Changes tab).
7. Disambiguate the two **feature-flag** surfaces; show flag scope (global vs tenant).
8. Reframe **Control Plane** as "Platform (Advanced)" and pull safety/compliance out of it into Security & Compliance.
9. Standardize list-page toolbars (search/status/date/scope) and bulk-action bars.
10. Add step-up confirmation for destructive superadmin actions (purge, tenant reset, impersonation).
