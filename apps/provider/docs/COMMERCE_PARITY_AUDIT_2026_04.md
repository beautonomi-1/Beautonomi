# Commerce parity gap sweep — April 2026

Generated during §Provider-audit / §Customer-audit 2026-04 (D2). This doc
summarises the commerce-surface audit we ran across provider mobile /
provider web / customer mobile / web, lists the critical gaps that were
fixed in this engagement, and the non-critical gaps that remain as
follow-ups so future contributors have a single place to look.

## Critical fixes landed in this pass

| App | Area | Issue | Fix |
| --- | --- | --- | --- |
| provider mobile | catalogue / service detail | could not delete a service on mobile (web supported it) | Added a destructive "Delete service" button in `more/catalogue/[id].tsx` with confirm + haptic |
| provider mobile | products quick-add modal | barcode typed in the quick modal was silently dropped on save | Included `barcode` in create/update payload in `more/products.tsx` |
| provider mobile | product returns | approve flow hardcoded `return_method: "drop_off"` | Added drop-off / ship-back selector wired into the approve call in `more/product-returns.tsx` |
| customer mobile | product detail | non-variant products with stock tracking disabled rendered as "Sold out" | Respected `track_stock_quantity` in `product-detail.tsx`; also surfaced reviews summary + recent comments |
| customer mobile | checkout | authenticated users hit `HOLD_OWNERSHIP` 403 when consuming a guest hold | Relaxed ownership in `booking-holds/[id]/consume` + friendlier copy in `book-checkout.tsx` |
| provider mobile | calendar | TDZ crash on initial render (`Cannot convert undefined value to object`) | Moved `staffList` ahead of `getHoursForDay`, added ErrorBoundary wrapper |
| provider mobile | clients | "Message" button alerted "Customer not found" for walk-ins | New `is_registered` flag from `/api/provider/clients`; button disabled with a clear hint when unregistered |
| provider mobile | sales | no search / filters; only a single empty state | SearchBar + date range filters + contextual empty states in `(tabs)/sales.tsx` |
| provider mobile | new booking | NaN amounts when inputs were blank; wall-clock drift across DST | `safeNum()` helper for all numeric math; `buildZonedIsoForWallClock` for all date/time construction |
| customer app | home header | used 40×40 favicon tile; no visible brand | Shipped `BeautonomiWordmark` (SVG glyph + wordmark text) and used it in the home header |

## Non-critical gaps / follow-ups

Tracked so they can be picked up in a focused PR rather than bolted onto this
release:

### Provider mobile
- ~~**Catalogue**: web supports bulk enable/disable, advanced pricing, service
  add-ons reordering. Mobile covers single-service edit + add-ons/variants CRUD
  but lacks bulk operations and drag-reorder. Non-blocking.~~
  **Partially fixed 2026-04** — `more/catalogue/index.tsx` now has bulk-select
  mode with bulk activate/deactivate, plus up/down reorder wired to new
  `PATCH /api/provider/services/[id]/reorder` and
  `PATCH /api/provider/services/[id]/variants/[variantId]/reorder`. Advanced
  pricing (special / student / senior) and true drag-gesture reorder are
  deferred; the drag gesture specifically requires adding
  `react-native-draggable-flatlist` as a dep and is UX polish on top of the
  functional up/down arrows that already work.
- ~~**Products**: the full `product-form` screen has feature parity with web; the
  `products.tsx` quick-add modal intentionally exposes a subset (name, brand,
  category, supplier, barcode, description). Low-priority: consider adding
  `retail_price` / `tax_rate` / `track_stock_quantity` to the quick modal.~~
  **Fixed 2026-04** — the quick-add modal in `more/products.tsx` now exposes
  a "Track stock quantity" toggle (non-variant branch only, since variants
  manage their own qty) and a "Tax rate (%)" numeric input. Both are
  forwarded in create + update payloads; the full `product-form.tsx` keeps
  the reference-data picker.
- ~~**Shipping**: `shipping-config.tsx` covers delivery/collection toggles, fees,
  thresholds, radius, estimated days, notes. Web additionally exposes
  `collection_notes` on the provider UI — only the public `/api/public/products/shipping-config`
  endpoint currently reads that field. Add the input the next time we touch
  shipping settings.~~ **Fixed 2026-04** — `collection_notes` is now wired end-to-end:
  Zod schema on `PUT /api/provider/shipping-config` accepts it, provider web
  (`/provider/ecommerce/shipping`) and provider mobile
  (`more/settings/shipping-config.tsx`) both render a labelled textarea inside
  the collection card, and the customer mobile PDP + checkout already consume
  `collection_notes` from the public shipping-config endpoint.

### Customer mobile
- ~~**Product reviews**: we now show rating + recent reviews summary on PDP. A
  future pass should add a full reviews list screen ("See all reviews") with
  sort filters (highest / lowest / helpful) — the API (`/api/products/[id]/reviews`)
  already supports them.~~ **Fixed 2026-04** — new
  `app/(app)/product-reviews.tsx` screen paginates the full list with sort
  chips (Newest / Highest / Lowest / Most helpful), rating summary card with
  distribution bars, and provider-response rendering. PDP preview block adds
  a "See all N reviews" CTA when there are more than the 3 previewed.
- ~~**Product tracking URL**: we display `tracking_number` text. No backend field
  currently stores a tracking URL / carrier, so we can't deep-link yet. If
  that data becomes available, make the field tappable to open the carrier
  tracking page.~~ **Fixed 2026-04** — added `product_orders.tracking_url`
  column (migration `521_product_orders_tracking_url.sql`), accepted by
  `PATCH /api/provider/product-orders/[id]` (with URL validation + empty
  string = clear), captured by the shipped sheet in provider mobile
  (`more/product-orders.tsx`) and provider web
  (`/provider/ecommerce/orders`). Customer mobile
  (`product-order-detail.tsx`) and customer web (`account-settings/orders/[id]`)
  render the row as a tappable link when the URL is present and fall back
  to the existing tracking-number-only display otherwise.
- ~~**Returns**: customer `request-return.tsx` already supports reason + photos +
  descriptions. Non-critical: add a "my returns" dashboard so customers can
  see status without opening each order.~~ **Fixed 2026-04** — dashboard
  already shipped at `app/(app)/my-returns.tsx` with list, status chips,
  cancel, escalate, and pull-to-refresh. Linked from account settings.

### Web / cross-cutting
- ~~`/api/me/loyalty/balance` was hitting 401 on mobile because the Next route
  wasn't receiving the `NextRequest` object. Fixed in this pass. Audit other
  `/api/me/*` endpoints for the same signature bug when we next touch that
  area.~~ **Fixed / verified 2026-04** — swept every handler under
  `apps/web/src/app/api/me/**/route.ts` and confirmed each one accepts
  `NextRequest` (or equivalent `req`) and forwards it to
  `getSupabaseServer(request)`. No other routes were silently running the
  anonymous client.

## Booking-flow synergy sweep — 2026-04

Follow-up audit focused on customer↔provider booking parity (permissions,
availability, notifications). Fixes applied this pass:

- **Permissions parity for service lifecycle** — `POST /api/provider/bookings/[id]/start-service`
  and `.../complete-service` only called `requireRoleInApi` (role tier), while
  `PATCH /api/provider/bookings/[id]` already used
  `requirePermission('edit_appointments')`. A staff account with
  `edit_appointments` disabled could therefore still start or complete a
  booking from the mobile app (and trigger loyalty point awards + stock
  deduction as a side effect). Both routes now call `requirePermission` so
  the policy matrix is enforced identically across web PATCH and mobile
  start/complete POSTs.
- **`POST /api/location/validate` Bearer forwarding** — the mobile booking
  flow hits this endpoint to compute travel fees before creating a hold. It
  was calling `getSupabaseServer()` with no request, so the Authorization
  header was dropped and the query fell back to the anon client. Fixed to
  `getSupabaseServer(request)` to match the rest of the `/api/*` surface.

Findings documented but intentionally **deferred** (not blocking release):

- ~~**`reschedule-core.ts` is uncalled.** `executeReschedule` was added to
  unify `POST /api/me/bookings/[id]/reschedule`, `PATCH /api/provider/bookings/[id]`,
  and `POST /api/portal/booking/reschedule`, but none of the three routes
  actually import it. All three still duplicate the logic. Drift risk is
  real — next time we touch reschedule we should route all three through
  `executeReschedule` and delete the per-route copies.~~
  **Fixed 2026-04 (synergy sweep round 2)** — `POST /api/me/bookings/[id]/reschedule`
  and `POST /api/portal/booking/reschedule` now delegate to
  `executeReschedule`. Each route keeps only the surface-specific pre/post
  flight (ownership + group-contact gating on customer; token validation
  on portal; Amplitude tracking on customer), and maps the typed
  `RescheduleCoreError` to HTTP via the new shared
  `httpStatusForRescheduleError` helper. The ~400 lines of duplicated
  availability + conflict + booking_services cascade logic are gone.
  `PATCH /api/provider/bookings/[id]` is a separate, multi-field update
  path (status + staff + price + services in one body) and deliberately
  keeps its own reschedule branch for now — it's the next candidate for a
  focused extraction but was out of scope for this touch.
  `/api/me/group-bookings/[id]/reschedule` intentionally does **not** use
  the core engine: group bookings shift every participant preserving
  per-booking offsets, which doesn't fit the single-booking model.
- ~~**Provider mobile group-bookings cannot attach `package_id`.** Web sends
  `package_id` via `GroupBookingDialog` (migration 520, API accepts it) but
  `apps/provider/app/(app)/(tabs)/more/group-bookings.tsx` has no package
  picker at all. Porting the picker is a UX-scope task (fetch
  `/api/provider/packages`, pre-fill pricing/items, render in the create
  sheet); not a crash, not a regression, but a parity gap.~~
  **Fixed 2026-04 (packages round 3)** — mobile create sheet now loads
  `/api/provider/packages` (scoped to `selectedLocationId` when present),
  renders an optional "Package" row above the Service chips, and opens a
  dedicated picker `BottomSheet` listing each active package with its
  service/product counts, price, and discount badge. Selecting a package
  adopts the first service's `offering_id` as the group's `service_id`,
  sums the package service durations into `duration_minutes`, and
  pre-fills the title. The POST payload includes `package_id` so the
  `group_bookings` row links back to the `service_packages` catalog for
  reporting/discount math. The detail sheet also shows the attached
  package name so providers can visually confirm the link.
  **Extended 2026-04 (packages round 4 — mid-edit parity)** — the edit
  sheet in `more/group-bookings.tsx` now also renders the package picker:
  `editForm` tracks `packageId` + `originalPackageId`, the Package row
  opens the existing picker `BottomSheet` reused for the edit path, and
  a detach option (sentinel → `package_id: null`) is rendered when a
  package is currently attached. `handleSaveEdit` only includes
  `package_id` in the PATCH body when it actually changed to avoid no-op
  writes, and `/api/provider/group-bookings/[id]` already allow-lists
  `package_id` with null-to-detach semantics. Timing / duration is not
  auto-rewritten on mid-edit package swap — matches web portal
  (`GroupBookingDialog`) behaviour: swapping the link on an existing
  booking only re-targets reporting/discount math, it does not
  silently reshape the schedule of already-attached participants.
- ~~**Provider mobile bookings list has no realtime refresh.** The calendar
  screen subscribes to `postgres_changes` on `bookings`, so a new online
  booking appears automatically. `more/bookings/index.tsx` only refreshes
  on mount / pull-to-refresh. If a customer books while the provider is
  staring at the list tab, the booking shows up on Calendar first.
  Non-blocking — pull-to-refresh works — but worth wiring a focus-effect
  or channel subscription on next touch.~~
  **Fixed 2026-04 (synergy sweep round 2)** — `more/bookings/index.tsx`
  now mirrors the calendar subscription: a `useFocusEffect` refresh on
  re-focus (covers the common "returned from a detail page" case) plus a
  Supabase `postgres_changes` channel on `bookings` filtered by
  `provider_id` that schedules a debounced 400ms refresh on any insert /
  update / delete. New online bookings now appear on both surfaces in the
  same beat, and the channel is torn down on unmount / provider change.
- ~~**`notifyProviderNewBooking` targets `providers.user_id` only.** If the
  provider has multiple staff logins and only the primary owner's OneSignal
  subscription is registered, other staff won't get a push. Email/in-app
  feed still reach them via the broader notification pipeline; mobile push
  parity for multi-staff teams is a follow-up.~~
  **Fixed 2026-04 (synergy sweep round 2)** — added a
  `resolveProviderRecipients(providerId, ownerUserId)` helper in
  `notification-service.ts` that fans push + in-app notifications to the
  whole provider team (owner + active `provider_staff.user_id` via the
  existing `getProviderTeamUserIds`). Applied to every booking-lifecycle
  and customer-context notification site:
  `provider_booking_request`, `provider_booking_cancelled`,
  `provider_booking_rescheduled`, `provider_booking_time_changed`,
  `provider_booking_date_changed`, `provider_new_customer`,
  `provider_recurring_customer`, `provider_preferred_customer`,
  `provider_dispute_opened`, `provider_dispute_resolved`,
  `provider_special_instructions`, `allergy_alert_provider`,
  `provider_weather_alert`. Helper falls back to the owner id if the
  resolver fails, so a transient DB hiccup never silently drops the push.
- **Booking create does not auto-open a conversation.** Both sides can
  message each other, but the conversation is created lazily when either
  party first taps "Message". This matches the old behaviour; deferred
  because messaging today works on-demand.
- ~~**`safeNum` / `buildZonedIsoForWallClock` are app-local.** Provider uses
  `apps/provider/src/lib/tz.ts`; customer never imports it. Duplication
  risk if the helper ever gains a timezone edge-case fix; promote to
  `@beautonomi/utils` next time we touch either.~~
  **Fixed 2026-04 (synergy sweep round 2)** — both helpers now live in
  `@beautonomi/utils` (`packages/utils/src/safeNum.ts`,
  `packages/utils/src/buildZonedIsoForWallClock.ts`) with dedicated unit
  tests covering NaN / Infinity / empty-string coercion and
  SAST/UTC/legacy `GMT+2` zone conversions. `apps/provider/src/lib/tz.ts`
  became a thin re-export so every existing `@/lib/tz` call site keeps
  working, and the provider's new-booking screen imports `safeNum`
  directly from `@beautonomi/utils` instead of re-defining it inline.
  Customer app can now reuse the same coercion / tz math when it gains
  provider-tz-aware slot selection in a future drop.

## Mobile onboarding verification — 2026-04

Verified end-to-end that both mobile onboarding flows are functional and
route → API contracts match:

- **Customer onboarding** (`apps/customer/app/(app)/onboarding/index.tsx`) —
  6-step wizard (name → photo → DOB → phone/OTP → address → beauty
  preferences) backed by `/api/me/profile` (PATCH), `/api/me/avatar`
  (POST), `/api/me/phone/verify` (POST), `/api/me/addresses` (POST),
  `/api/me/beauty-preferences` (POST), and `/api/me/onboarding/complete`
  (POST). Gate in `apps/customer/app/index.tsx` calls `/api/me/portal`
  + `/api/me/onboarding/complete` GET + `/api/me/profile-completion`
  and treats non-customer roles as complete so cross-role users don't
  loop. Payload shape validated against the route Zod schemas — each
  endpoint accepts what the wizard posts.
- **Provider onboarding** (`apps/provider/app/(app)/onboarding/wizard.tsx`
  + `src/features/provider-onboarding/*`) — 14-step wizard (team size →
  identity/phone-verify → business → payment → software → payroll →
  location → photos → zones → categories → services → hours → review →
  plan). Drafts persisted to `/api/provider/onboarding/draft`,
  pre-filled from `/api/me/profile`, photo uploads via `/api/upload`
  (FormData), zone suggestions via `/api/provider/onboarding/suggest-zones`,
  categories via `/api/public/categories/global`, and final submit to
  `/api/provider/onboarding` (POST). Client-side `validateStep` matches
  the Zod schema on the submit route; `buildSubmitPayload` fills every
  nullable field the server expects.
- **Photos step polish** — `Step8Photos` was upgraded in this pass to
  show previews + per-slot "Replace" / remove actions for thumbnail +
  avatar, plus an "Add" button with inline `ActivityIndicator` and
  close-badges on gallery thumbnails. Previously the step was three
  unlabelled buttons with no confirmation that the upload succeeded.
- **Typecheck** — `pnpm --filter customer exec tsc --noEmit` and
  `pnpm --filter provider exec tsc --noEmit` both exit 0 with the
  onboarding changes in place.

## Acceptance checklist used for the audit

- Provider web ↔ provider mobile: compare the set of CRUD verbs and flags each
  resource exposes (services, add-ons, variants, products, variants, returns,
  shipping). Flag anything the web UI can do that mobile cannot.
- Customer web ↔ customer mobile: compare the product detail experience,
  checkout, post-purchase (tracking, returns, reviews).
- Null-safety: any screen that does numeric math on user input must survive
  blank inputs without emitting `NaN` to the server.
- Timezone-safety: any screen that converts a picked wall-clock time into UTC
  for the server must go through the shared helper, not ad-hoc `Date`
  construction.
- Auth boundaries: any `/api/me/*` or `/api/provider/*` route must accept the
  `NextRequest` so the server session is attached to the supabase client.
