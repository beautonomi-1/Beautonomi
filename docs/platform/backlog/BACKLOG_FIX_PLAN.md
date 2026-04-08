# Backlog Fix Plan

Prioritized by **customer harm**, **provider operations**, **booking/calendar integrity**, **data integrity**, **mobile UX**, **effort**, and **dependencies**.

---

## Tier A — Do first (high harm, feasible engineering)

| Priority | Item | Action | Effort | Depends on |
|----------|------|--------|--------|------------|
| A1 | **11 Staff notifications** | **Done (partial):** shifts routes resolve `provider_staff.id` **or** `user_id`. **Next:** trace booking → notify templates for any remaining “not found” copy | M | None |
| A2 | **1 Package journey** | **Done (partial):** `?package=` / `?package_id=` **prefills** via **`@beautonomi/utils`** (web + customer native). **Optional product:** packages-first **step order** | L–XL | Product (optional) |
| A3 | **19 Group booking** | Scope doc: which combinations supported v1; align `validateBooking` + UI | XL | Product |
| A4 | **6 Resource validation** | Capture failing payload from UI; align Zod + form | S–M | Repro |

---

## Tier B — Booking / calendar integrity

| Priority | Item | Action | Effort |
|----------|------|--------|--------|
| B1 | **1.1 Provider appointments** | Shared validation helper or explicit parity checklist | L |
| B2 | **9–10 Shifts/blocks** | **Partial:** day grid horizontal scroll + header sync; **legend** + blocked/shift semantics still verify | M |
| B3 | **8 Calendar connect** | Staging OAuth test; document sync direction vs availability | M |
| B4 | **18 Grid UX** | **Done (partial):** staff columns fixed width + horizontal scroll + header sync. **Next:** DnD rules, slot-click parity | M–L |

---

## Tier C — Mobile / UX

| Priority | Item | Action | Effort |
|----------|------|--------|--------|
| C1 | **4 Search focus** | **Improved:** focus-on-expand + `blurOnSubmit`; **device QA** to close | S |
| C2 | **2 Sticky CTA** | Visual regression short viewport | S |

---

## Tier D — Trust / ops / content

| Priority | Item | Action | Effort |
|----------|------|--------|--------|
| D1 | **14 Tickets email** | Code calls `notifySupportTicketCreated` + template `support_ticket_created` — **E2E:** create → mailhog / provider logs | S |
| D2 | **15 Help** | Link audit | S |
| D3 | **7 Cancellation** | Optional: show summary earlier (product) | S |

---

## Tier E — Requires product / legal / large architecture

| Priority | Item | Why deferred |
|----------|------|--------------|
| E1 | **5 Service zones** | Tenant policy: optional vs required |
| E1 | **17 Client dedupe / signup** | Identity merge rules |
| E2 | **18 DnD calendar** | Conflict rules + undo |
| E3 | **13 Subscription** | Billing vendor truth |

---

## Already completed (reference)

- **437/438** migrations: entitlements, atomic redeem, cancel restore  
- **Order → entitlement** for package-linked products  
- **Payment step** entitlement picker  
- **Chained duration** helpers (`blocked-window-minutes.ts`)  
- **InlineSearch** unused `useWindowDimensions` removed  
- **Package URL prefill** (`@beautonomi/utils` + `booking-flow` + customer `book/index`) + **vitest** in `packages/utils`  
- **Shifts API** staff id **or** user id resolution  
- **Provider web calendar** multi-staff horizontal scroll + header sync  
- **InlineSearch** focus-on-expand + `blurOnSubmit`  

---

## Suggested sprint breakdown

1. **Sprint 1:** A1 **notify pipeline** trace + A4 resource repro + C1 **device** mobile QA  
2. **Sprint 2:** B1 provider parity + optional **package-first** step (product)  
3. **Sprint 3:** B2 shift/block **legend** + B3 calendar connect staging  
4. **Sprint 4:** A3 group scope (if approved) + E2 DnD spec  

---

*Update this plan when backlog items close or priorities change.*
