# Mobile Parity Contract

Source of truth for screen parity between **apps/web** (client portal) and **apps/customer** (React Native). Both platforms adhere to this contract.

Types: `packages/types/src/parity.ts`

---

## Screen Contracts Overview

| screen_id | web_route | mobile_route | auth | empty | loading | error |
|-----------|-----------|--------------|------|-------|---------|-------|
| home | / | /(app)/(tabs)/home | no | ✓ | ✓ | ✓ |
| explore | /explore | /(app)/(tabs)/explore | no | ✓ | ✓ | ✓ |
| explore_post | /explore/[id] | /(app)/explore-post | no | - | ✓ | ✓ |
| saved | /explore/saved | /(app)/account-settings/wishlists | yes | ✓ | ✓ | ✓ |
| search | /search | /(app)/(tabs)/search | no | ✓ | ✓ | ✓ |
| partner_profile | /partner-profile | /(app)/partner-profile | no | - | ✓ | ✓ |
| partner_gallery | /partner-profile/gallery | (inline) | no | ✓ | ✓ | - |
| book | /book/[slug] | /(app)/book | yes | - | ✓ | ✓ |
| book_continue | /book/continue | /(app)/book-checkout | yes | - | ✓ | ✓ |
| bookings | /account-settings/bookings | /(app)/(tabs)/bookings | yes | ✓ | ✓ | ✓ |
| booking_detail | /account-settings/bookings/[id] | /(app)/booking-detail | yes | - | ✓ | ✓ |
| booking_reschedule | /account-settings/bookings/[id]/reschedule | /(app)/book | yes | - | ✓ | ✓ |
| booking_review | /account-settings/bookings/[id]/review | /(app)/review-write | yes | - | ✓ | ✓ |
| chats | /inbox | /(app)/(tabs)/chats | yes | ✓ | ✓ | ✓ |
| profile | /profile | /(app)/(tabs)/profile | yes | - | ✓ | ✓ |
| account_settings | /account-settings | /(app)/account-settings | yes | - | ✓ | ✓ |
| account_personal_info | /account-settings/personal-info | .../personal-info | yes | - | ✓ | ✓ |
| account_wishlists | /account-settings/wishlists | .../wishlists | yes | ✓ | ✓ | ✓ |
| account_messages | /account-settings/messages | .../messages | yes | ✓ | ✓ | ✓ |
| account_notifications | /account-settings/notifications | .../notifications | yes | ✓ | ✓ | ✓ |
| account_payments | /account-settings/payments | .../payments | yes | ✓ | ✓ | ✓ |
| account_addresses | /account-settings/addresses | .../addresses | yes | ✓ | ✓ | ✓ |
| account_preferences | /account-settings/preferences | .../preferences | yes | - | ✓ | ✓ |
| account_reviews | /account-settings/reviews | .../reviews | yes | ✓ | ✓ | ✓ |
| account_custom_requests | /account-settings/custom-requests | .../custom-requests | yes | ✓ | ✓ | ✓ |
| account_membership | /account-settings/membership | .../membership | yes | ✓ | ✓ | ✓ |
| account_loyalty | /account-settings/loyalty | .../loyalty | yes | ✓ | ✓ | ✓ |
| account_referrals | /account-settings/referrals | .../referrals | yes | - | ✓ | ✓ |
| account_business | /account-settings/business | .../business | yes | ✓ | ✓ | ✓ |
| gift_card | /gift-card | /(app)/gift-card-purchase | yes | - | ✓ | ✓ |
| login | (modal) | /(auth)/login | no | - | ✓ | ✓ |
| signup | /signup | /(auth)/login | no | - | ✓ | ✓ |
| onboarding | /onboarding | (flow) | yes | - | ✓ | ✓ |

---

## Feature Flags

- **shared**: Implement on both web and mobile
- **web_only**: Web only (e.g. complex admin)
- **mobile_only**: Mobile only (e.g. native camera)

All client portal screens are **shared**.

---

## Required Data (Queries)

Each screen lists `required_queries`. Mobile must use `packages/api` (or equivalent) to call these endpoints. If an endpoint is missing in packages/api, add it.

---

## Actions (Mutations)

Each screen lists `actions`. Both platforms must support these with the same API surface (e.g. `POST /api/me/bookings/[id]/cancel`).

---

## State Requirements

| State | Meaning |
|-------|---------|
| **loading** | Skeleton or spinner while data fetches |
| **empty** | "No items" message with CTA where appropriate |
| **error** | Error message + retry button |

---

## Analytics Events

Both platforms must fire the same Amplitude events (from `@beautonomi/analytics` or equivalent):

- `home_view`, `explore_feed_view`, `explore_post_click`, `explore_save`, `explore_unsave`
- `search_view`, `search_filters_applied`, `search_result_impression`, `search_result_click`
- `provider_profile_view`
- `booking_start`, `booking_hold_created`, `booking_details_completed`, `booking_confirmed`
- `checkout_start`, `payment_initiated`, `payment_success`, `payment_failed`
- `booking_cancelled`, `booking_rescheduled`
- `review_submitted`
- `message_thread_open`, `message_sent`
- `login_success`, `signup_start`, `signup_complete`
- `page_view` (with screen name)

---

## Running the Parity Checker

```bash
pnpm parity:check
```

Outputs: implemented screens vs missing screens for mobile.
