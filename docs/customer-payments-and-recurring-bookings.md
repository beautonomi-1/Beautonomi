# Customer bank/card details and recurring bookings

## How customer card (and bank) details are saved

We use **Paystack’s charge flow** ([Paystack Charge API](https://paystack.com/docs/api/charge/), [payment channels](https://paystack.com/docs/payments/payment-channels/)). We **do not** store raw card numbers or full bank account details on our platform.

### 1. Paystack transaction initialize

- **Endpoint we call:** `POST https://api.paystack.co/transaction/initialize`
- **Where:**  
  - **Booking payment (new card):** `processPayment()` in `apps/web/src/app/api/public/bookings/_helpers/process-payment.ts` (public booking)  
  - **Existing booking / checkout:** `POST /api/payments/initialize` in `apps/web/src/app/api/payments/initialize/route.ts`
- **What we send:** `email`, `amount`, `currency`, `reference`, `callback_url`, `metadata`. We do **not** currently send `payment_channels`; Paystack’s hosted page shows the channels (card, bank, etc.) per their configuration.
- **Metadata we pass for “save card”:**  
  - `save_card: true` when the customer opts in  
  - `customer_id` (our user id)  
  - `set_as_default: true` when they choose “set as default”  
  Plus booking/payment context (e.g. `booking_id`, amounts, etc.).

### 2. Customer pays on Paystack

- Customer is redirected to **Paystack’s hosted page** (`authorization_url` from initialize).
- They pay by **card** (or bank/USSD etc. if Paystack shows those). For **card**, Paystack returns an **authorization** that can be **reusable** for future charges.

### 3. Webhook: charge.success and saving the “card”

- Paystack sends **`charge.success`** to our webhook (`/api/payments/webhook` → `charge-success.ts`).
- We only **save** a payment method when:
  - `metadata.save_card === true`
  - `authorization.authorization_code` is present
  - `authorization.reusable === true`
  - `metadata.customer_id` and `customer.email` are present
- **What we store (in `payment_methods`):**
  - `provider = 'paystack'`
  - `provider_payment_method_id` = Paystack’s **authorization_code** (the token to charge again)
  - `last_four`, `expiry_month`, `expiry_year`, `card_brand` (from `authorization.last4`, `exp_month`, `exp_year`, `brand`/`card_type`)
  - `user_id`, `is_default`, `is_active`, etc.
- So “saving the card” = saving Paystack’s **authorization code** and display info. We never store PAN or CVV.

### 4. Charging a saved card later

- For a **saved card** we call Paystack’s **charge authorization** API with that `authorization_code`.
- **Where:** `chargeAuthorization()` from `@/lib/payments/paystack-complete`; used in `process-payment.ts` when the booking has `payment_method_id` and we load the row from `payment_methods` and pass `provider_payment_method_id` (the Paystack authorization code).

### Summary (cards)

| Step | What happens |
|------|----------------|
| 1 | We call Paystack **transaction/initialize** with `metadata.save_card`, `customer_id`, `set_as_default`. |
| 2 | Customer pays on Paystack (card or other channel). |
| 3 | On **charge.success**, if `save_card` and reusable authorization, we save **authorization_code** + last4/expiry/brand to `payment_methods`. |
| 4 | Later payments use **charge authorization** with that code; no raw card stored on our side. |

Bank and other channels (e.g. Paystack’s bank redirect) use the same initialize → redirect → webhook flow; whether the authorization is reusable for bank is up to Paystack. Our “saved card” path is the same: we only persist when we get a reusable `authorization_code` from the webhook.

### 5. Choosing which card is primary (default)

- **Stored:** Each payment method has **`is_default`**. The **default** card is the one we use when the customer doesn’t pick a specific card (e.g. “Pay with default card”).
- **At save time:** When saving a new card, we can pass **`set_as_default: true`** in metadata so that card becomes the default.
- **After save:** The customer can **change** which card is primary at any time:
  - **API:** `PATCH /api/me/payment-methods/[id]` with body `{ is_default: true }`. The server unsets any other default for that user and sets this one.
  - **Customer app (checkout):** On the saved-cards list, non-default cards show a **“Set default”** control; tapping it calls that PATCH and refreshes the list so the chosen card is used as primary for future checkouts.

### 6. Save-card info for customers (verify / reverse)

When the customer opts in to “Save this card”, we show an **info icon** (e.g. on book-checkout) that explains:

- We save the card securely when they pay.
- **To verify the card**, Paystack may place a **small temporary charge** (e.g. R1) and **reverse it**—this confirms the card for future use.

Copy used in the app: *“We'll save your card securely when you pay. To verify your card, Paystack may place a small temporary charge (e.g. R1) and reverse it—this confirms your card for future use.”*

(In our current flow we typically save the card from the **authorization of the actual booking payment**, so there isn’t always a separate “verify then reverse” charge; the message is there so customers aren’t surprised if they see a small auth/reverse from Paystack.)

---

## How recurring bookings are handled

### Data model

- **Table:** `recurring_appointments` (and customer-facing **recurring booking** APIs that write into it).
- **Content:** Provider, customer, recurrence (e.g. weekly/biweekly/monthly), start/end date, preferred time, location, services in `metadata`, etc. Subscription/feature gating may apply (e.g. recurring appointments as a plan feature).

### Creating the next occurrence (cron)

- **Endpoint:** `GET /api/cron/process-recurring-bookings`  
- **File:** `apps/web/src/app/api/cron/process-recurring-bookings/route.ts`
- **Auth:** Cron secret (e.g. Vercel cron or external scheduler).
- **Logic:**
  1. Load active `recurring_appointments` (e.g. `is_active`, within `start_date` / `end_date`).
  2. For each, compute the **next** occurrence date from `last_booking_date` (or `start_date`) and `frequency` (weekly = +7 days, biweekly = +14, monthly = +30).
  3. If that date is **today**, we **insert a row into `bookings`** (customer_id, provider_id, scheduled_at from preferred_time, location, status e.g. confirmed) and set **`last_booking_date`** on the recurring appointment so the next run uses it for the following occurrence.
- So recurring = **automatic creation of the next booking** when its date is due; the cron does **not** create payments or charge cards.

### Payment for each occurrence

- **Current behaviour:** The cron only creates the **booking**. It does **not**:
  - Create a row in `payments`, or  
  - Charge the customer’s saved card (or any payment method).
- So **payment for each recurring occurrence** is not automatic today. Options would be:
  - Customer pays when the appointment is due (e.g. in app or at checkout for that booking), or  
  - A separate job that, when a recurring booking is created, creates a payment intent and charges a saved card (using the same Paystack authorization flow as above) and then links that payment to the booking.

### Why use a cron when Paystack has recurring charges?

- **Paystack [recurring charges](https://paystack.com/docs/payments/recurring-charges/) / subscriptions** handle **charging the card** on a schedule: you store an authorization and then Paystack charges it at an interval (e.g. weekly/monthly). That’s the **payment** side.
- **Our cron** (`/api/cron/process-recurring-bookings`) handles **creating the next booking row** (the appointment in our system) when the next occurrence is due. That’s the **scheduling** side.

So they do different jobs: **Paystack recurring = charge the card**. **Our cron = create the booking.** We don’t *need* the cron for Paystack to charge; we need it (or something like it) to create the calendar event.

A possible improvement is to **use Paystack for recurring payment** and **create the booking when the charge succeeds**:

1. When a customer sets up a recurring appointment, we create a **Paystack subscription** (or schedule recurring charges) using their saved authorization, so Paystack charges them on the chosen frequency.
2. On **charge.success** (or subscription charge webhook), we **create the corresponding booking** for that period and link the payment to it. Then we don’t need a separate cron to “create then hope they pay”—we “charge then create” and the cron could be removed or only used for non‑paid recurring slots.

Until that’s built, the cron remains the way we create the next occurrence; payment for that occurrence is still manual or would need a separate charge step.

### Summary (recurring)

| Aspect | How it works |
|--------|----------------|
| **Recurrence definition** | Stored in `recurring_appointments` (and created via recurring-booking APIs). |
| **Next occurrence** | Cron `process-recurring-bookings` runs (e.g. daily); when “next” date = today, it inserts one `bookings` row and updates `last_booking_date`. |
| **Payment for that booking** | Not created or charged by the cron; would need to be done by the customer at the time of the booking or by a separate auto-charge (saved card) flow. |
