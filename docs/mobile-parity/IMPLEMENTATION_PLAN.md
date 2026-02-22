# Mobile Parity Implementation Plan

Step-by-step plan to achieve full feature parity between apps/web (client portal) and apps/customer (React Native).

---

## Phase 1: MVP Parity (Core flows)

| Screen | Tasks | Dependencies | Complexity | Test Checklist |
|--------|-------|--------------|------------|----------------|
| **home** | Use `useHomeData` hook; ensure loading/empty/error states | useLocation, api | S | [ ] Loading shows skeleton; [ ] Empty shows message; [ ] Sections render; [ ] home_view fires |
| **explore** | Use `useExploreFeed`; masonry/pagination | api | M | [ ] Pull-to-refresh; [ ] Infinite scroll; [ ] Empty state; [ ] explore_feed_view fires |
| **search** | Categories + search results; filters | api | M | [ ] Search returns results; [ ] Filters work; [ ] search_view fires |
| **partner_profile** | Already implemented | - | - | [ ] Services list; [ ] Book Now; [ ] Wishlist toggle |
| **book** | Already implemented | hold/consume APIs | - | [ ] Service→Venue→Staff→Date→Time flow |
| **book-checkout** | Already implemented | Paystack | - | [ ] Payment completes; [ ] booking_confirmed fires |
| **bookings** | Use `useBookings`; tabs upcoming/past/cancelled | api | S | [ ] Tabs switch; [ ] Empty state; [ ] Refetch |
| **booking_detail** | Pay Now, Reschedule, Cancel | api | M | [ ] Pay opens WebBrowser; [ ] Cancel/Reschedule work |
| **profile** | Profile info, avatar, links to account | api | S | [ ] Profile loads; [ ] Avatar upload works |
| **login** | OTP, OAuth | Supabase | S | [ ] login_success fires |

**Phase 1 QA:** [ ] All MVP screens load; [ ] Booking flow end-to-end; [ ] Payment succeeds; [ ] Analytics events fire

---

## Phase 2: Account & Content Parity

| Screen | Tasks | Dependencies | Complexity | Test Checklist |
|--------|-------|--------------|------------|----------------|
| **account_settings** | Index with all links | - | S | [ ] All links navigate |
| **account_personal_info** | Edit name, email, phone | api | S | [ ] PATCH profile works |
| **account_wishlists** | Providers + recently viewed | api | S | [ ] Wishlist toggle; [ ] Recently viewed list |
| **account_messages** | Conversation list (same as chats) | api | S | [ ] List loads; [ ] Navigate to chat |
| **account_notifications** | Preferences + mark read | api | S | [ ] Preferences save; [ ] Mark read |
| **account_payments** | Payment methods, gift cards | api | M | [ ] List methods; [ ] Gift card balance |
| **account_addresses** | CRUD addresses | api | M | [ ] Add/Edit/Delete |
| **account_preferences** | Beauty preferences | api | S | [ ] Save preferences |
| **account_reviews** | My reviews list | api | S | [ ] List loads |
| **account_custom_requests** | List + create | api | M | [ ] Create with image |
| **account_membership** | View, cancel | api | S | [ ] Cancel works |
| **account_loyalty** | Points, redeem | api | M | [ ] Redeem flow |
| **account_referrals** | Share link | api | S | [ ] Share works |
| **account_business** | Business services | api | S | [ ] List loads |
| **explore_post** | Post detail, comments, save | api | M | [ ] Comments; [ ] Save; [ ] explore_save fires |
| **saved** | Saved posts (redirect or list) | api | S | [ ] Redirect to wishlists when auth |
| **chats** | Conversation list + chat thread | api | M | [ ] Send message; [ ] message_sent fires |

**Phase 2 QA:** [ ] All account settings screens work; [ ] Explore post detail parity; [ ] Chats parity

---

## Phase 3: Full Parity & Polish

| Screen | Tasks | Dependencies | Complexity | Test Checklist |
|--------|-------|--------------|------------|----------------|
| **booking_reschedule** | Reschedule flow | api | M | [ ] Reschedule API; [ ] booking_rescheduled fires |
| **booking_review** | Write review with attachments | api | S | [ ] review_submitted fires |
| **gift_card** | Purchase flow | api, Paystack | M | [ ] payment_success fires |
| **partner_gallery** | Gallery view (inline or screen) | - | S | [ ] Images display |
| **onboarding** | Post-signup flow | api | M | [ ] signup_complete fires |
| **Notifications** | List, mark read, tap to open | api | S | [ ] Deep link works |

**Phase 3 QA:** [ ] All contract screens implemented; [ ] `pnpm parity:check` passes

---

## QA Checklist (Visual + Functional)

### Visual
- [ ] Brand color #FF0077 used consistently
- [ ] Padding 16px horizontal, 100px bottom on tabs, 48px on stack
- [ ] Safe area insets respected
- [ ] Loading skeletons match content layout
- [ ] Empty states have icon + message + CTA where appropriate

### Functional
- [ ] All screens use packages/api (api client)
- [ ] Auth required screens redirect to login when guest
- [ ] Pull-to-refresh on list screens
- [ ] Error states have retry button
- [ ] Analytics events match PARITY_CONTRACT.md

### Cross-Platform
- [ ] Web mobile view vs RN: same screen count and flow
- [ ] Data from same API endpoints
- [ ] Mutations produce same side effects

---

## Dependencies

- **packages/api**: Already provides `createApiClient`; add any missing endpoint helpers if needed
- **packages/types**: Parity types in `parity.ts`
- **packages/ui-tokens**: Colors, spacing, typography
- **@beautonomi/analytics**: Amplitude events

---

## Run Parity Checker

```bash
pnpm parity:check
```

Outputs: implemented vs missing screens for mobile.
