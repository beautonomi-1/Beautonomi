# Booking Flow: Customer App vs Customer Web

This document describes how the booking flow is aligned between the **customer app** (Expo/React Native) and **customer web** (Next.js), and where intentional or planned gaps remain.

## Architecture difference

- **Web**: Single-page flow with step index. User fills all steps (services, venue, calendar, promotions, your info), then on **payment** step the app creates a **booking** in one call (`POST /api/public/bookings`) and processes payment.
- **App**: Multi-screen flow. User completes **book** screen (service → venue → staff → date → time → add-ons), then the app creates a **hold** (`POST /api/public/booking-holds`) to reserve the slot, then navigates to **book-checkout**. Checkout loads the hold, collects payment options / promo / gift card / tips / forms, then **consumes** the hold (`POST /api/public/booking-holds/[id]/consume`) to create the booking and pay.

So web does **create-booking-then-pay**; app does **hold-then-checkout-then-consume**. Both end up with a booking and same payment options.

---

## Aligned behavior

| Feature | Web | App |
|--------|-----|-----|
| **Service selection** | Yes (with variants) | Yes (single service + variant) |
| **Venue** | Salon vs house call (venue step) | At salon vs at home (venue step) |
| **Staff** | Per-service in service step | Single staff (staff step; skipped if 1 staff) |
| **Date & time** | Calendar step (date + slots) | Date step → time step (slots) |
| **Add-ons** | Inline in service step | Dedicated add-ons step before checkout |
| **Promotions** | Promotions step (coupon, gift card, loyalty) | Checkout (promo code, gift card) |
| **Payment methods** | Card, cash, gift card | Card, cash, wallet, gift card |
| **Deposit vs full** | Yes | Yes (when provider requires deposit) |
| **Wallet** | Use wallet balance (when card) | Yes (payment method option) |
| **Saved cards** | Yes | Yes |
| **Tips** | Payment step | Checkout |
| **Special requests** | Your info step | Checkout (special requests field) |
| **Cancellation policy** | Shown on payment step | Shown on checkout |
| **Edit from summary** | "Change" next to Services and Date & time (navigates to that step) | "Change" chips for date/time and service (navigate to book with `step` param) |
| **Slot conflict** | 409 on create → back to calendar | Hold expiry / consume failure → user can re-book |

---

## Intentional / structural gaps

These are differences by design or due to backend flow (hold vs direct booking), not bugs.

1. **Multi-service**
   - **Web**: User can add multiple services in one booking; staff per service.
   - **App**: One service per booking (hold API is single-slot). Multi-service would require either multiple holds or backend support for multi-service holds.

2. **Group booking**
   - **Web**: Dedicated step (group participants, services per participant); `POST /api/public/bookings` supports `is_group_booking` and `group_participants`.
   - **App**: No UI. Consume API supports `is_group_booking` and `group_participants`; app could add a simplified group flow later.

3. **Packages**
   - **Web**: Packages step; bookings API accepts `package_id`.
   - **App**: No package selection; hold/consume flow does not expose packages.

4. **Products**
   - **Web**: Products can be added in service step; bookings API accepts `products[]`.
   - **App**: No products in book or checkout; consume API does not include products.

5. **Client info**
   - **Web**: Your info step collects first name, last name, email, phone, special requests, house call instructions; sent in `client_info`.
   - **App**: Logged-in user; checkout sends `special_requests` and optional custom/provider forms. Name/email/phone come from auth; no separate “your info” step.

6. **Promotions step**
   - **Web**: Dedicated step for coupon, gift card, loyalty, membership.
   - **App**: Promo code and gift card on checkout only (same capabilities, different placement).

---

## File reference

- **App**: `apps/customer/app/(app)/book.tsx` (steps + hold), `apps/customer/app/(app)/book-checkout.tsx` (payment + consume).
- **Web**: `apps/web/src/app/booking/components/booking-flow.tsx`, `apps/web/src/app/booking/components/steps/step-*.tsx`, `apps/web/src/app/booking/components/steps/step-payment.tsx` (summary + "Change" links).
- **APIs**: `apps/web/src/app/api/public/booking-holds/` (create hold, consume), `apps/web/src/app/api/public/bookings/` (create booking).

---

## Keeping flows aligned

- When adding a new **payment** or **checkout** behavior (e.g. new payment method, deposit rule), implement in both app (consume + book-checkout) and web (bookings API + step-payment).
- When adding **edit-from-summary**: app uses `step` param and replace to book; web uses `updateBookingState({ currentStepIndex })` so the flow shows the correct step.
- For **multi-service**, **group**, **packages**, or **products** on the app, backend (hold/consume or new endpoint) and app UI need to be designed together.
