# Learning Center authoring

How to write and manage Learning Center articles, including embedded **app mockups** that render as live React components on the public site.

## Article body formats

- **HTML** (`content_format: html`) — default for new articles in the admin Vite SPA. Use the visual editor.
- **Markdown** (`content_format: markdown`) — legacy; converted on the public site via `marked`.

Hero image (`image_url`) is separate from inline images in the body.

## Embedded app mockups

Mockups are **code-rendered** React components (phone/browser frames with representative UI). They stay accurate as the product evolves because they reuse the same mockup library as marketing pages.

### Marker syntax (stored in `learning_articles.body`)

```html
<div data-learn-mockup="provider-mobile-calendar" data-caption="Your day in the provider app"></div>
```

- `data-learn-mockup` — required; must be a valid id from `@beautonomi/learning-mockups` (`MOCKUP_CATALOG`).
- `data-caption` — optional; shown under the mockup on the public site. If omitted, the catalog label is used.

### Available mockup ids

| Id | Label | Platform |
|----|-------|----------|
| `provider-mobile-calendar` | Provider — Bookings (day view) | provider-mobile |
| `provider-mobile-bookings-overview` | Provider — Bookings overview | provider-mobile |
| `provider-mobile-services` | Provider — Services catalogue | provider-mobile |
| `provider-mobile-messages` | Provider — Messages inbox | provider-mobile |
| `provider-mobile-house-calls` | Provider — House call appointment | provider-mobile |
| `provider-mobile-dashboard` | Provider — Dashboard | provider-mobile |
| `provider-mobile-finance` | Provider — Finance & payouts | provider-mobile |
| `provider-mobile-packages` | Provider — Packages & memberships | provider-mobile |
| `provider-mobile-more` | Provider — More menu | provider-mobile |
| `customer-mobile-home` | Customer — Home discovery | customer-mobile |
| `customer-mobile-bookings` | Customer — Bookings list | customer-mobile |
| `customer-mobile-chats` | Customer — Chats | customer-mobile |
| `customer-mobile-shop` | Customer — Shop | customer-mobile |
| `customer-mobile-wallet` | Customer — Wallet & rewards | customer-mobile |
| `customer-mobile-profile` | Customer — Profile & account | customer-mobile |
| `customer-mobile-on-demand` | Customer — On-demand request | customer-mobile |
| `provider-web-dashboard` | Provider web — Dashboard | provider-web |
| `provider-web-calendar` | Provider web — Calendar | provider-web |
| `provider-web-finance` | Provider web — Finance & payouts | provider-web |
| `provider-web-orders` | Provider web — Product orders | provider-web |
| `provider-web-clients` | Provider web — Clients (CRM) | provider-web |
| `provider-web-team` | Provider web — Team & permissions | provider-web |
| `provider-web-reports` | Provider web — Reports & analytics | provider-web |
| `provider-web-catalogue` | Provider web — Catalogue | provider-web |
| `provider-web-settings` | Provider web — Settings hub | provider-web |
| `provider-web-marketing` | Provider web — Marketing | provider-web |
| `customer-web-booking` | Customer web — Booking flow | customer-web |
| `customer-web-account` | Customer web — Account hub | customer-web |
| `customer-web-shop` | Customer web — Shop | customer-web |
| `customer-web-manage-bookings` | Customer web — Booking detail | customer-web |

Source of truth: `packages/learning-mockups/src/catalog.ts`.

## Admin editors

### Vite SPA (`apps/admin-web` → Learning articles)

1. Create or edit an article with **HTML** body format.
2. Place the cursor where the mockup should appear.
3. Click **Mockup** in the toolbar (learning editor variant).
4. Pick a mockup by number from the list; optionally add a caption.
5. Save — the editor stores a `div[data-learn-mockup]` marker. A labeled placeholder block appears in the editor; the **live mockup renders on beautonomi.com**.

**Important:** Do not paste raw mockup HTML into the visual editor without the Mockup button — TipTap will strip unknown nodes. The custom `LearnMockup` node preserves markers on edit/save.

### Next.js admin CMS (`/admin/content/learning`)

The body field is a raw HTML textarea. Paste the marker snippet directly:

```html
<div data-learn-mockup="customer-mobile-home" data-caption="Customer app tabs"></div>
```

## Public rendering

1. Article HTML is sanitized (`learn-article-html.ts`) — mockup markers on `div` are allowed.
2. `LearnArticleBody` splits HTML on markers and injects components from `MOCKUP_REGISTRY`.
3. Unknown ids are omitted safely (no script execution).

## Seeding migrations

Use idempotent `UPDATE ... WHERE body NOT LIKE '%data-learn-mockup="..."%'` when injecting markers in SQL migrations. See `698_learning_center_mockups_and_accuracy.sql`, `699_learning_center_mockup_coverage.sql` (platform guides), `700_learning_center_full_content_refresh.sql` (conceptual overviews + gap articles), and `701_learning_center_internal_training_and_admin_search.sql` (internal runbooks + admin search RPC).

## Internal training & intelligent support

Internal articles (`is_internal = true`) are runbooks for the support/ops team. They are **excluded** from the public `/learn` site and only readable inside the admin SPA.

- **Knowledge base reader** (`apps/admin-web` → Overview → **Knowledge base**, `/admin/knowledge-base`): any admin/support role can browse and read every published article, including internal runbooks. Mockup markers render as labelled placeholders with a "View live" link (the interactive React mockups only run on `/learn`).
- **Support desk article linking** (`/admin/support-tickets/:id` → reply composer → **Help articles**): searches the knowledge base (audience-aware) and inserts a public `/learn/article/{slug}` link into the reply. Internal runbooks are searchable when composing an **internal note** but cannot be inserted into customer-facing replies.
- **Search backend:** `search_learning_articles_admin(p_query, p_limit, p_offset, p_audience, p_include_internal)` — `SECURITY DEFINER`, granted to `service_role` only. Mirrors the public RPC but includes internal/audience-filtered results. Surfaced via `GET /api/admin/learning/search`, `GET /api/admin/learning/browse`, and `GET /api/admin/learning/articles/[slug]` (all gated by the `overview` admin section, i.e. every admin role).
- When writing an internal runbook, end with a **"Reference for replies"** section linking the public articles support should share with users, so the desk stays consistent.

## Homepage sections

Managed via **Learning homepage** in admin (`learning_homepage_sections`):

- `hero`, `cta_cards`, `platform_guides`, `featured_articles`
- `video_library` — `{ title, videos: [{ title, url, description? }] }`
- `platform_updates` — `{ title, article_ids: [uuid, ...] }` — links to update articles

## Content accuracy checklist

When writing mobile guides, verify against live apps:

- **Customer app tabs:** Home, Search, Bookings, Cart, Chats, Profile (Saved/wishlists via Profile or Home header — not a bottom tab).
- **Provider app tabs:** Dashboard, Clients, Chats, Bookings, More.
- **Customer checkout:** Paystack for online card payments (wallet, gift card, pay-at-venue when enabled).
- **Provider in-person POS:** Yoco under More → Yoco payments (web: Settings → Yoco).
- **Web booking URLs:** `/book/[provider]` often continues into canonical `/booking` checkout.
- **Terminology:** Use "House call" for at-home appointments; nav labels say "Bookings" not "Appointments".
