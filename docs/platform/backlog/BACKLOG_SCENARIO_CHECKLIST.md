# Backlog Scenario Checklist

Use this for QA and release gates. **Status:** ✓ implemented / ⚠ partial / ✗ gap / — not tested.

## 1 — Packages flow

| Scenario | Expected | Status | Risk if wrong | Blocker |
|----------|----------|--------|----------------|---------|
| Open `/book?slug=x` | Loads services step | ✓ | — | — |
| Open with `?package=UUID` | Package metadata applies **when services already match package items** | ⚠ | User confused — thinks package-first | **No auto-jump to packages step** |
| Select package on packages step | `selectedPackage` set; discount in totals | ✓ | Wrong price | — |
| Pay with prepaid entitlement | `customer_package_entitlement_id` + `package_id`; RPC redeems | ✓ (post-438) | Double charge or orphan booking | Migration 438 |
| Staff any + calendar | `providerId` on `/api/availability` | ✓ | Empty slots | — |

## 1.1 — Provider appointment

| Scenario | Expected | Status |
|----------|----------|--------|
| Create with variant offering | Correct `offering_id` on line | ⚠ |
| Attach product | `booking_products` + stock | ⚠ |
| At-home | Address/geo if required | ⚠ |

## 2 — Sticky CTA

| Scenario | Expected | Status |
|----------|----------|--------|
| Short viewport | Continue visible, content scrolls above bar | ⚠ verify |
| Payment step | Payment sticky footer, not `BookingActionBar` | ✓ |

## 3 — Learning hub

| Scenario | Expected | Status |
|----------|----------|--------|
| Provider vs customer article set | Role filter | — |

## 4 — Mobile search focus

| Scenario | Expected | Status |
|----------|----------|--------|
| Type continuously in InlineSearch | Focus retained | ⚠ retest after hook removal |
| Suggestions open | Keyboard stays | ⚠ |

## 5 — Service zones

| Scenario | Expected | Status |
|----------|----------|--------|
| Provider without zones | No hard error; at-home still configurable | ⚠ |

## 6 — Resources

| Scenario | Expected | Status |
|----------|----------|--------|
| PATCH valid type | 200 | ⚠ need failing payload |

## 7 — Cancellation policy

| Scenario | Expected | Status |
|----------|----------|--------|
| Payment step | Checkbox + policy text | ✓ |
| Early step | Summary on your-info optional | ⚠ |

## 8 — Calendar connect

| Scenario | Expected | Status |
|----------|----------|--------|
| OAuth callback | Connection row + refresh | — staging |

## 9 — Shifts on calendar

| Scenario | Expected | Status |
|----------|----------|--------|
| Valid staff id | Shifts load | ✓ API |
| Invalid id | Clear error (not silent) | ⚠ |

## 10 — Blocked periods

| Scenario | Expected | Status |
|----------|----------|--------|
| Block overlaps booking attempt | Conflict or UI warning | S validate |

## 11 — Staff notifications

| Scenario | Expected | Status |
|----------|----------|--------|
| Booking assigned to staff A | A receives notification | ⚠ |
| Deleted staff id | No “not found” user-facing; log + fallback | ✗ |

## 12 — Team prefs

| Scenario | Expected | Status |
|----------|----------|--------|
| Disable email | No email sent | — |

## 13 — Subscription

| Scenario | Expected | Status |
|----------|----------|--------|
| Past due | Grace vs lockout per product | — |

## 14 — Tickets

| Scenario | Expected | Status |
|----------|----------|--------|
| Submit ticket | Email receipt | — trace |

## 15 — Help

| Scenario | Expected | Status |
|----------|----------|--------|
| Help link | 200, correct tenant | — |

## 16 — Delete client

| Scenario | Expected | Status |
|----------|----------|--------|
| Delete then list | Row gone | ⚠ |

## 17 — Client geocode / dedupe

| Scenario | Expected | Status |
|----------|----------|--------|
| Same phone later signs up | Linked or merged per policy | — |

## 18 — Calendar UX

| Scenario | Expected | Status |
|----------|----------|--------|
| Horizontal scroll all staff | Scroll works | ⚠ |
| Tap slot | Create/edit | ⚠ |
| Drag booking | Updates time + conflict check | ✗ |

## 19 — Group booking

| Scenario | Expected | Status |
|----------|----------|--------|
| Primary + participants | All lines validated | ⚠ |
| Package on group | Product rule | ✗ |

## 20 — Provider freeze

| Scenario | Expected | Status |
|----------|----------|--------|
| Slow RPC | Loading state, no white screen | ⚠ |
