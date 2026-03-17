# Additional / Extra Charges: Mobile App Handling

This doc describes how the **customer mobile app** handles additional charges (post-booking extra fees, add-ons charged by the provider) and whether the behaviour is correct or has gaps.

---

## 1. What are additional charges?

- **Source:** Provider adds an "additional charge" to a booking (e.g. extra service at the appointment, product sold at visit). Stored in `additional_charges` (booking_id, amount, description, status: pending | approved | paid | rejected).
- **Payment:** Customer can pay online (Paystack) via a payment link, or the provider can mark as paid (walk-in/cash/Yoco). See `docs/ADDITIONAL_CHARGES_AND_PAYOUT_RULES.md` for ledger and payout rules.

---

## 2. How the mobile app handles them

### Data

- **GET /api/me/bookings/[id]** returns:
  - **additional_charges**: array of `{ id, description, amount, currency, status, requested_at, paid_at }`
  - **outstanding_balance**: computed as `total_amount + sum(unpaid additional charges) - total_paid` (so it includes both unpaid booking balance and unpaid additional charges)

### UI (booking-detail)

1. **Outstanding balance**  
   If `outstanding_balance > 0`, the receipt section shows an "Outstanding balance" line with the amount.

2. **Pay Now (initial booking)**  
   When `payment_status === "pending"` and `total_amount > 0`, a primary "Pay Now" button is shown. It uses the in-app Paystack flow to pay the **booking** (deposit or full amount). This is correct for the first payment.

3. **Additional charges block**  
   Unpaid charges (`status === "pending"` or `"approved"`) are listed with description, amount, and a **"Pay"** button per charge.  
   Tapping **Pay** opens the **in-app browser** to:
   `{APP_URL}/account-settings/bookings/{bookingId}/pay-additional/{chargeId}`  
   That web page calls **POST /api/me/bookings/[id]/additional-charges/[chargeId]/pay**, gets a Paystack `authorization_url`, and redirects the user to Paystack. After payment, Paystack redirects to the web **payment-callback** URL. So the user completes payment in the WebView and then lands on the web success/callback page.

4. **Refetch on return**  
   When the user leaves the booking-detail screen (e.g. to pay in the in-app browser) and comes back, the screen **refetches** the booking (via `useFocusEffect` + `hasLoadedOnce`). So after paying an additional charge, when they return to booking-detail, they see updated `outstanding_balance` and `additional_charges` (paid charges no longer in the unpaid list). **This is correct.**

---

## 3. Deposit + remaining balance

- At **checkout**, the app can let the customer pay a **deposit** only (if the provider supports it). Remaining amount is "due at appointment."
- **GET /api/me/bookings/[id]** exposes `total_amount`, `total_paid`, and `outstanding_balance`. So after a deposit, `outstanding_balance = total_amount - total_paid` (plus any additional charges).
- The **"Pay Now"** button on booking-detail is shown only when `payment_status === "pending"`. After the customer pays the deposit, `payment_status` becomes e.g. `"partially_paid"`, so **"Pay Now"** is no longer shown for the **remaining balance** on that screen.
- **How remaining can be paid in the app:**
  - **Option A:** Provider creates an **additional charge** for the remaining amount. Then the customer sees it in "Additional charges" and pays via the existing "Pay" → in-app browser → Paystack flow. **This works today.**
  - **Option B:** A dedicated **"Pay remaining balance"** action that pays the outstanding booking balance without requiring a separate additional_charge row. **Implemented:** when `payment_status === "partially_paid"` and `outstanding_balance > 0`, the booking-detail screen shows a "Pay remaining balance" button. It calls **POST /api/me/bookings/[id]/pay-remaining**, gets a Paystack `authorization_url`, and opens it in the in-app browser. The Paystack webhook (charge.success with `metadata.payment_type === "booking_remaining"`) records the payment in `booking_payments`, so the existing trigger updates `total_paid` and `payment_status`. After the user returns to the app, the screen refetches and shows the updated balance.

**Conclusion:** The app handles (a) initial booking payment, (b) provider-created additional charges, and (c) paying the remaining balance for deposit-only bookings without requiring the provider to create an additional charge.

---

## 4. Gaps and improvements

| Item | Status | Note |
|------|--------|------|
| Show outstanding balance | OK | Displayed when > 0. |
| List unpaid additional charges | OK | With per-charge "Pay" button. |
| Pay additional charge | OK | Opens web pay-additional page in WebView; user pays via Paystack; callback on web. |
| Refetch after return from browser | OK | useFocusEffect refetches when screen regains focus so data is up to date. |
| Pay remaining balance (no additional charge) | OK | "Pay remaining balance" button when partially_paid and outstanding_balance > 0; POST /api/me/bookings/[id]/pay-remaining → in-app browser → Paystack; webhook records in booking_payments. |
| Deep link / message from web to app | Optional | After payment, user lands on web. If the web callback page posted a message to the WebView (e.g. `ReactNativeWebView.postMessage({ type: "checkout_success", booking_id })`), the app could auto-navigate to booking-detail and refetch. Currently the user taps "Back" and refetch on focus already updates the screen. |

---

## 5. Summary

- **Additional/extra charges** are handled correctly on mobile: the app shows outstanding balance and unpaid additional charges and lets the user pay each charge by opening the web pay-additional flow in the in-app browser. Returning to the screen triggers a refetch so the UI is up to date.
- **Correctness:** The behaviour is correct for the current product: pay initial booking (or deposit), then pay any provider-created additional charges via the same web payment flow.
- **Pay remaining balance:** Implemented. Deposit-only bookings can be fully paid from the app via "Pay remaining balance" (API + webhook + app button); no additional charge required.
