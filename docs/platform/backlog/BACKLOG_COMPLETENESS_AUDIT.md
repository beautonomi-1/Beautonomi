# Backlog Completeness Audit

**Date:** 2026-04-05 (updated: high-risk engineering pass)  
**Method:** Codebase inspection, cross-reference with `BOOKING_DOMAIN_AUDIT.md`, `BOOKING_FIX_PLAN.md`, and prior entitlement/availability work. Not all surfaces (admin SPA, every mobile screen) were exercised in a running app.

---

## 1. Executive Summary

The Beautonomi platform has a **strong server-authoritative core** for customer web booking (`validateBooking`, `create_booking_with_locking`, conflict checks, package entitlement RPCs). **Gaps cluster** where **multiple booking surfaces** (customer web, provider web, provider mobile, customer mobile) **do not share one orchestration layer**, and where **product expectations** (package-first journey, group + variants + products, calendar UX parity) **outpace** incremental UI wiring.

**Cross-cutting risks**

| Risk | Why it matters |
|------|----------------|
| **Step graph vs server rules** | Customer flow uses `effectiveStepOrder` and `STEP_ORDER`; provider create may bypass steps the customer must complete. |
| **Calendar truth** | Bookings, holds, blocks, shifts, and external calendars are **different tables/pipelines**; visual layers must not imply availability that APIs do not enforce. |
| **Identity** | Clients vs `users` vs booking `customer_id` — dedupe and “signed up later” linking are **high trust** surfaces. |
| **Notifications** | “Staff not found” class errors usually mean **ID resolution** (route param vs `provider_staff`) or **timing**, not messaging copy. |

**Fixes already landed in repo (recent)** — see `BOOKING_DOMAIN_AUDIT.md` and migrations **437/438**: prepaid entitlements, atomic redeem with booking insert, cancel restore, order→entitlement hook, package credit picker on payment step, chained duration helpers for availability math.

**This audit** classifies backlog items **1–20** as: implemented / partial / blocked / needs product decision, with **evidence** and **recommended source of truth**.

---

## 2. Dependency and Surface Map

| Surface | Role | Key paths (non-exhaustive) |
|---------|------|----------------------------|
| **Customer web booking** | Primary checkout | `apps/web/src/app/booking/**`, `POST /api/public/bookings` |
| **Provider web** | Operations, settings, calendar | `apps/web/src/app/provider/**`, `apps/web/src/app/api/provider/**` |
| **Provider mobile** | Tabs, settings, calendar | `apps/provider/app/**` |
| **Customer mobile** | Search, booking detail, market | `apps/customer/**` |
| **Admin** | Control plane, secrets, users | `apps/web/src/app/admin/**` |
| **Backend** | Rules, RPCs, RLS | `apps/web/src/app/api/**`, `supabase/migrations/**` |
| **Notifications** | Email/push/in-app | `apps/web/src/lib/notifications/**` |
| **Integrations** | Paystack, calendar OAuth, maps | `apps/web/src/lib/calendar/**`, `calendar-integration` pages |

**Entities:** `bookings`, `booking_services`, `booking_holds`, `provider_staff`, `availability_blocks`, `time_blocks`, `staff_time_off`, `staff_days_off`, `service_packages`, `customer_package_entitlements`, `resources`, `product_orders`, `users`, provider client lists.

---

## 3. Item-by-Item Domain Assessment

### 1 — Packages flow incorrect (routing, staff, entitlement)

| Aspect | Assessment |
|--------|------------|
| **Intended behavior** | Package-aware journey: select or deep-link package → services constrained by `service_package_items` → staff → availability → pay with optional entitlement. |
| **Evidence** | `STEP_ORDER` always starts at **`services`** (`booking-flow.tsx`). `?package=` only **reorders** rows on packages step and **auto-applies** `selectedPackage` when **all** package services are already selected (`useEffect` ~556–615). **No** jump to packages-first without traversing services/venue. |
| **Staff** | Per-service `staffId` enforced in `canProceed` for `services` step. Package does not change staff model. |
| **Entitlement / pricing** | Server: `validate-booking.ts` + `create_booking_with_locking` (438). UI: `step-payment` entitlement dropdown + `customer_package_entitlement_id`. |
| **Classification** | **Improved** — `?package=` / `?package_id=` prefills via **`@beautonomi/utils`** (`resolvePackageOfferingsFromFlatMenu` + provider **`/services`** menu, same resolver as **customer native** `book/index.tsx`). Staff defaults to **`any`** on web until refined. **Still** services → venue → packages in web `STEP_ORDER`; true “package-first” step routing is a product decision. |

### 1.1 — Provider appointment bookings incomplete

| Aspect | Assessment |
|--------|------------|
| **Evidence** | `apps/web/src/app/api/provider/bookings/route.ts` uses `create_booking_with_locking` with constructed `p_booking_services`; variant/product matrices differ from `validateBooking` path. |
| **Classification** | **Partial** — operational booking creation exists; **parity** with customer `validateBooking` (variants, products, geo, package) requires explicit matrix. |

### 2 — Sticky Continue CTA

| **Evidence** | `BookingActionBar` is `fixed bottom-0` with safe-area padding; hidden on `payment` (payment has own sticky footer). |
| **Classification** | **Implemented** for non-payment steps; **verify** on smallest viewports that main content `pb-*` reserves space and nothing is covered. |

### 3 — Learning hub (customer vs provider)

| **Evidence** | No dedicated `learning` module found under `docs/platform` in this pass; likely lives under app routes or CMS. |
| **Classification** | **Needs dedicated route audit** — treat as **not validated** in this document. |

### 4 — Mobile search loses focus after one letter

| **Evidence** | `InlineSearch.tsx`: controlled `TextInput`, debounced fetch, `Modal`. Removed `useWindowDimensions()`; removed `autoFocus` in favor of **`useEffect` focus when `expanded`**; **`blurOnSubmit={false}`**; `FlatList` already uses **`keyboardShouldPersistTaps="handled"`**. |
| **Classification** | **Improved** — **device retest on iOS/Android** still required to close this item. |

### 5 — Provider portal should not need service zones

| **Evidence** | Provider app lists Service Zones (`apps/provider/.../settings/index.tsx`). Web errors not reproduced in static read. |
| **Classification** | **Product + backend** — either **optional** zones with graceful empty state, or **hide** when `at_home` not used. |

### 6 — Resource validation failed (update/add)

| **Evidence** | `apps/web/src/app/api/provider/resources/[id]/route.ts` uses Zod `resourceTypeEnum`. |
| **Classification** | **Needs failing payload + response** — classify as **investigation** (likely strict enum vs UI sending legacy values). |

### 7 — Cancellation policy for customer

| **Evidence** | `step-payment.tsx` fetches policy, checkbox gate. `step-your-info.tsx` shows summary. |
| **Classification** | **Implemented** on web payment; **extend** to other commitment points if product requires. |

### 8 — Connect calendar issues

| **Evidence** | Web `provider/settings/calendar-integration`, `calendar-sync.ts`, admin secrets. |
| **Classification** | **Integration-heavy** — auth, token refresh, sync direction; **blocked** without OAuth env + staging tests. |

### 9 — Shifts not visible on calendar

| **Evidence** | Shifts API returns 404 text “Staff member not found” when staff row missing (`staff/[id]/shifts/route.ts`). |
| **Classification** | **Partial** — data + API exist; **UI layer** must render shift segments with correct staff/timezone keys. |

### 10 — Blocked periods not visible

| **Evidence** | `availability_blocks`, `time_blocks`, public availability merge in provider calendar code. |
| **Classification** | **Partial** — same as 9: **rendering/legend** vs **data**. |

### 11 — Staff notifications “staff member not found”

| **Evidence** | APIs return that string when `provider_staff` lookup fails. |
| **Classification** | **Partial** — **`GET/POST /api/provider/staff/[id]/shifts`** and **`DELETE .../shifts/[scheduleId]`** now resolve `id` as either **`provider_staff.id`** or **`provider_staff.user_id`** (`resolveProviderStaffRowId`). Remaining “not found” in **push/email copy** still needs **notification pipeline** tracing (see `notify-provider-team`, booking triggers). |

### 12 — Team notification preferences

| **Classification** | **Needs schema + UI audit** — not completed in this pass. |

### 13 — Provider subscription error

| **Classification** | **Billing + gating** — inspect subscription routes and provider lockout; **staging** required. |

### 14 — Ticket email confirmation

| **Evidence** | `POST /api/me/support-tickets` calls **`notifySupportTicketCreated`** with channels `["email","push"]` using template **`support_ticket_created`** (`notification-service.ts`). Failures are **logged**; **delivery** is not guaranteed without observability. |
| **Classification** | **Code path exists** — **production proof** requires template registration + mail provider logs / Mailhog in staging. |

### 15 — Help centre / contact

| **Classification** | **Content + routing** audit — **not completed** in this pass. |

### 16 — Delete client not immediate

| **Classification** | **Eventual consistency** — optimistic UI + cache invalidation pattern review on provider clients list. |

### 17 — Client address autosuggest / geocode / dedupe

| **Classification** | **Cross-surface** — map provider, `users`, booking address; **signup link** via phone/email — **policy** required. |

### 18 — Calendar scroll / slot click / drag-drop

| **Evidence** | Web `CalendarGrid` + `CalendarDesktopWithDnd`. |
| **Classification** | **Partial** — **multi-staff day view**: fixed-width staff columns (`STAFF_DAY_COLUMN_LAYOUT`), **`min-w-max`** grid row, **header ↔ body `scrollLeft` sync** so horizontal scroll reaches all staff. **DnD** and **direct slot click** behavior unchanged; still needs product rules for **mutation safety** and any remaining gaps. |

### 19 — Group booking incomplete

| **Evidence** | Server has group paths; UI uses first-service staff for availability; **variants/products/packages** for participants not aligned. |
| **Classification** | **High gap** — **product + backend** alignment. |

### 20 — Provider appointment freeze / missing fields

| **Classification** | **Partial** — correlate with **loading states**, **RPC errors**, and **missing provider_id**; needs profiling. |

---

## 4. Booking / Calendar / Notification / Client Integrity Assessment

- **Booking:** Single source of truth for **creation** should remain **`validateBooking` + `create_booking_with_locking`** for customer web; provider path should **reuse** or **explicitly duplicate** rules with **same conflict semantics**.
- **Calendar:** **Display** = operational; **availability** = `calculateAvailableSlots` / public slug / holds — **documented drift** in domain audit.
- **Notifications:** Resolve **staff user id** from `provider_staff` + linked `users`; never trust client-only labels.
- **Clients:** Server-side **dedupe** rules and **merge** on signup must be documented where implemented.

---

## 5. Scenario Coverage Assessment

See **`BACKLOG_SCENARIO_CHECKLIST.md`**.

---

## 6. Findings and Gaps (prioritized themes)

1. **Package-first journey** — **prefill** from `?package=` is implemented; **step order** still services-first; product may still want **packages-first** routing.
2. **Group × variants × products × packages** — server partially supports; UI and validation matrix incomplete.
3. **Provider vs customer booking parity** — risk of **silent** divergence.
4. **Calendar UX** — **horizontal staff scroll + header sync** improved; **DnD** and **availability truth** still separate concerns.
5. **Mobile search focus** — focus + `keyboardShouldPersistTaps` hardening; **device retest** mandatory.

---

## 7. Fixes Applied (this program)

| Fix | Where |
|-----|--------|
| Removed unused `useWindowDimensions()` from customer `InlineSearch` | `apps/customer/src/components/InlineSearch.tsx` |
| **Package deep-link prefill** — shared `@beautonomi/utils` + web `booking-flow.tsx` + customer `book/index.tsx` | `packages/utils/src/booking/*` |
| **Unit tests** for package line → cart mapping | `packages/utils/src/booking/*.test.ts` |
| **Staff route param resolution** — `provider_staff.id` **or** `user_id` for shifts APIs | `apps/web/src/lib/provider/resolve-provider-staff-id.ts`, `staff/.../shifts/route.ts`, `.../shifts/[scheduleId]/route.ts` |
| **Calendar** — fixed staff column width, `min-w-max` grid, **synced horizontal scroll** between header and body | `CalendarGrid.tsx`, `StaffColumn.tsx`, `StaffHeader.tsx`, `constants.ts` |
| **Mobile search** — `expanded` focus effect + `blurOnSubmit` (FlatList already `keyboardShouldPersistTaps`) | `apps/customer/src/components/InlineSearch.tsx` |

---

## 8. Blockers Requiring Product / Architecture Decisions

| Decision | Options | Impact |
|----------|---------|--------|
| Package-first vs services-first | Skip services step when `?package=` + auto-select offerings vs force manual | Whole `booking-flow` graph |
| Group booking scope | Full cart per participant vs primary-only | `validateBooking`, UI, pricing |
| Calendar DnD | Allowed moves, conflict resolution, undo | Provider calendar + API |
| Service zones | Required vs optional vs hidden by tenant | Provider app + API |
| Client = user linking | Merge rules, PII | DB + GDPR |

---

## 9. Production Readiness Verdict Per Item

| Item | Verdict |
|------|---------|
| 1 Packages flow | **Improved** — URL prefill + **server** 437/438; **package-first step order** still optional product work. |
| 1.1 Provider appointments | **Conditional** — verify parity matrix. |
| 2 Sticky CTA | **Largely ready** — regression-test mobile. |
| 3 Learning hub | **Unknown** — route audit needed. |
| 4 Search focus | **Improved** — **confirm on devices** after focus/`keyboardShouldPersistTaps` changes. |
| 5 Service zones | **Needs product rule**. |
| 6 Resources | **Needs failing case**. |
| 7 Cancellation policy | **Ready** on web payment path. |
| 8 Calendar connect | **Staging + OAuth**. |
| 9–10 Shifts/blocks visible | **UI** completion. |
| 11 Staff notifications | **High priority** — shifts API **ID resolution** fixed; **notify** path still verify end-to-end. |
| 12 Team prefs | **Audit** pending. |
| 13 Subscription | **Billing** staging. |
| 14 Tickets email | **Trace** — `notifySupportTicketCreated` + template **`support_ticket_created`**; verify delivery in env. |
| 15 Help | **Content** audit. |
| 16 Delete client | **UX** + API contract. |
| 17 Client geo/dedupe | **Policy** + implementation. |
| 18 Calendar UX | **Improved** horizontal staff scroll + header sync; **DnD** still spec + phased delivery. |
| 19 Group | **Major** alignment. |
| 20 Provider freeze | **Debug** + parity. |

---

## 10. Recommended Execution Order

See **`BACKLOG_FIX_PLAN.md`**.

---

## Confidence

| Area | Confidence |
|------|------------|
| Customer web booking structure | **High** |
| Entitlement / RPC migrations | **High** (code review) |
| Package step routing limitation | **High** |
| Provider mobile search focus | **Medium** (one fix applied) |
| Full calendar / notification / ticket traces | **Low** without runtime |

---

## Appendix A — Exemplar findings (full template)

Use this shape for each backlog item in issue trackers / PRs.

### Finding A — Package journey is services-first despite package deep link

- **Severity:** High  
- **Backlog item:** 1  
- **Affected surfaces:** Customer web `booking-flow.tsx`, `step-packages.tsx`, `step-service-selection.tsx`  
- **Affected actors:** Customer  
- **Scenario:** User opens booking with `?package=<uuid>` expecting to start on package selection or package-constrained services; flow still begins at **services**; `?package=` only **auto-skips** packages step when `selectedPackage` already matches after services are chosen.  
- **Evidence:** `STEP_ORDER` starts with `services`; `useEffect` at ~556–615 applies package when **all** package service IDs are in `selectedServices`; `useEffect` ~617–625 auto-advances **from** packages step when package already applied.  
- **Root cause:** No URL-driven **initial step index** to `packages` or package-driven **service prefill**; product intent not fully encoded.  
- **Risk:** Drop-off, mismatch with marketing links, “package flow broken” reports.  
- **Recommended fix:** Product decision: (a) document services-first + deep-link behavior, or (b) add `initialStep`/`package_first` that loads package items and pre-selects offerings (with staff defaults).  
- **Recommended source of truth:** `service_package_items` + `validateBooking` package rules.  
- **Confidence:** High  
- **Blocker type:** Product (then engineering)

### Finding B — Staff notification “not found” class errors

- **Severity:** Critical  
- **Backlog item:** 11  
- **Affected surfaces:** Provider/staff APIs, notification pipelines  
- **Affected actors:** Staff, provider ops  
- **Scenario:** Notification pipeline resolves staff by id from booking payload; id does not exist or is synthetic/public id not normalized.  
- **Evidence:** `apps/web/src/app/api/provider/staff/[id]/shifts/route.ts` returns `notFoundResponse("Staff member not found")` when lookup fails.  
- **Root cause:** Divergence between **booking_services.staff_id**, **public synthetic ids**, and **notification recipient** resolution.  
- **Risk:** Missed alerts, wrong assignee, support tickets.  
- **Recommended fix:** Single helper: `resolveStaffUserForNotification(provider_staff_id)`; log when null; never send user-visible “not found” in customer-facing paths.  
- **Recommended source of truth:** `provider_staff` + linked `users`; same normalization as `validate-booking`.  
- **Confidence:** Medium (exact notify path not traced in this pass)  
- **Blocker type:** Backend + data

### Finding C — Mobile InlineSearch focus loss

- **Severity:** Medium  
- **Backlog item:** 4  
- **Affected surfaces:** Customer app `InlineSearch.tsx`  
- **Affected actors:** Customer  
- **Scenario:** User types first character; input loses focus or suggestions break.  
- **Evidence:** Controlled input + debounced fetch + `Modal`; unused `useWindowDimensions()` caused **extra re-renders** (removed).  
- **Root cause:** Re-render churn + possible keyboard/Modal interaction.  
- **Risk:** Search abandonment.  
- **Recommended fix:** Device QA; consider `keyboardShouldPersistTaps="handled"` on outer `Pressable`, avoid parent remount keys.  
- **Recommended source of truth:** N/A (UX)  
- **Confidence:** Medium  
- **Blocker type:** Mobile QA (none / product if design changes)

