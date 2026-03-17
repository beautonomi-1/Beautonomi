# Platform Features Catalog (Customer and Provider)

This document catalogs all features on the **Customer** and **Provider** platforms in the Beautonomi ecosystem. It is organized by area: auth, tabs, main flows, account/settings, and provider-specific operations.

---

## Customer platform features

### Auth and entry

- **Entry (index):** Session check, portal (customer vs provider/admin), profile completion; redirect to login or home; WrongAppScreen for provider/admin.
- **Login:** Email/password and OAuth; links to signup and forgot-password.
- **Signup:** User registration.
- **Forgot password:** Password reset request.
- **Auth callback:** OAuth callback (web/native); exchange code, set session, redirect.

### Tab bar (main navigation)

- **Home:** Address picker, search, categories, top-rated / sponsored / nearest providers, "View more" to more-providers.
- **Explore:** Feed with category filters (For You, Trending, Hair, Nails, etc.), masonry post grid, like/save, open post or partner profile.
- **Bookings:** Upcoming and past bookings; open booking detail or prompt login.
- **Cart:** Tab entry; tab button navigates to full cart screen.
- **Chats:** Conversations list; open chat by conversation id.
- **Profile:** User info, quick links (bookings, orders, wallet, wishlists, payments, notifications, preferences, privacy, help, about, become a provider), account settings hub, sign out.
- **Search / Saved:** Hidden tabs (available but not in tab bar).

### Discovery and booking

- **Partner profile:** Provider/business profile: services, staff, locations, book, chat, products, gift card, custom request, write review.
- **Book:** Booking flow: service, venue, staff, date, time, add-ons; continues to book-checkout.
- **Book checkout:** Hold, payment, on-demand option; then booking-detail or on-demand/waiting.
- **Booking detail:** Status, reschedule, cancel, pay, verify arrival, write review, book again.
- **On-demand:** Request a provider without choosing one: **waiting** (finding provider, polling, cancel) and **result** (accepted/expired); then booking-detail or bookings.
- **More providers:** List by section (top-rated, sponsored, nearest, hottest, upcoming) at `more-providers/[section]`.

### Shopping and orders

- **Shop:** Product catalog for a provider or general.
- **Product detail:** View product; add to cart.
- **Cart:** Shopping cart; proceed to product checkout.
- **Product checkout:** Checkout; success to product-orders.
- **Product orders:** List of orders; open order detail.
- **Product order detail:** Single order; request return.
- **Request return:** Start return for an order.
- **My returns:** Returns and refunds; link to product-orders.

### Communication and engagement

- **Chat:** Single conversation with provider; create by provider_id.
- **Explore post:** Single post detail: content, provider, comments, like/save, open partner profile.
- **Custom request create:** Create custom service request for a provider; optional open chat after.
- **Review write:** Write a review (booking or provider).
- **Gift card purchase:** Buy gift card for a provider.

### Account settings (hub and sub-pages)

- **Hub:** Personal info, Profile details, Login and security, Identity verification, Addresses, Privacy; Bookings, Recurring, Product orders, Returns, Custom requests, Waitlist, Reviews; Payments, Wallet, Loyalty, Referrals, Membership; Notifications, Messages, Language and region, Wishlists; Tax documents; Help, About, Become a provider.
- **Personal info:** Name, photo, email, phone.
- **Profile details:** Profile questions, interests, beauty preferences.
- **Login and security:** Password and account protection.
- **Identity verification:** Verify identity with document.
- **Addresses:** Saved addresses (home, work, etc.).
- **Payments:** Payment methods, cards, gift cards, coupons; link to gift-card purchase.
- **Wallet:** Balance and transaction history.
- **Taxes:** Tax documents, receipts, invoices.
- **Bookings:** Upcoming, past, cancelled; open booking-detail.
- **Notifications:** Preferences (email, SMS, push).
- **Preferences:** Language and region (language, currency, timezone).
- **Privacy and sharing:** Data and visibility.
- **Referrals:** Invite friends, earn credits.
- **Loyalty:** Points, earn and redeem.
- **Reviews:** Reviews written; open partner profile or booking.
- **Wishlists:** Saved providers and posts.
- **Messages:** Conversations; open chat.
- **Waitlist:** Waitlist slots; open book with slug.
- **Recurring bookings:** Recurring appointments.
- **Custom requests:** Custom service requests.
- **Membership:** Membership benefits; link to partner profile.
- **Language:** App language.

### Other

- **Notifications:** List; deep links to chat, booking-detail, waitlist, product-orders, my-returns, referrals, loyalty, payments, bookings.
- **Help:** Help content; in-app browser or external link.
- **About:** About the app.
- **In-app browser:** WebView for external URLs (e.g. contact, become a provider); handles deep links to booking-detail, custom-requests, profile, product-orders.
- **Safety:** Safety panic button (customer app and web; API: `POST /api/me/safety/panic`).

### Deep links (examples)

- `customer://booking-detail?id=...`
- `customer://account-settings/custom-requests`
- `customer://profile`
- `customer://bookings`
- `customer://product-orders`

---

## Provider platform features

### Auth and entry

- **Entry (index):** Redirect to portal/tabs or login based on auth.
- **Auth layout:** Login, signup, terms, privacy.
- **Login / Signup / Forgot password:** Provider auth.
- **Terms / Privacy:** Terms of service and privacy policy (e.g. from Settings).
- **Auth callback:** OAuth/auth callback.

### Tab bar

- **Dashboard:** Metrics (bookings, revenue, completion rate, no-show rate, rating, appointments today/week/month); gamification (points, badge, progress); quick actions; recent activity; "View calendar" / "New booking".
- **Calendar:** Day/week view; bookings; staff/location filters; preferences; create/edit/start/complete/cancel bookings; availability.
- **Clients:** Client list; search, filters, favorites; tap to client detail.
- **Chats:** Conversation list (re-exports More to messaging/[id]); tap to messaging/[id].
- **Sales:** Transaction history (hidden tab); revenue stats, date range, list of sales; Yoco pay-in-person.
- **More:** Full More menu (see below).
- **Settings:** Hidden; reached via More to Settings and account.

### App-level stack

- **Search:** Global search (clients, appointments, services); suggestions with deep links.
- **Notifications:** List; unread count; tap to booking, conversation, reviews, etc.
- **Onboarding:** Post-login; setup status; "Complete setup in app" or web onboarding in in-app browser.
- **Chat [id]:** Redirect to More to messaging/[id].
- **On-demand incoming [id]:** Incoming on-demand request by request id (accept/decline flow).
- **Safety:** Safety panic / awareness (e.g. provider-side handling or visibility where applicable).

### More menu – Operations

- **Bookings (hub):** Bookings list (date range, status); "New" to new booking; tap to booking [id].
- **New booking:** Client, service, staff, slot, payment; availability and create-booking APIs.
- **Booking detail [id]:** View/edit, status actions.
- **Waitlist:** Entries (status, customer, service, date).
- **Waiting room:** Front desk / waiting room.
- **Express booking:** Quick / at-counter booking; "Manage links" in in-app browser.
- **Recurring appointments:** Recurring appointments.
- **Group bookings:** Group bookings.
- **Resources:** Rooms and equipment.
- **Forms:** Intake/consent forms list; manage forms.
- **Resources and forms hub:** Links to Resources and Forms.
- **Custom requests:** List; tap to custom-requests/[id].
- **Custom request [id]:** Detail (quotes/offers).
- **Routes:** Optimize at-home trips.
- **Time blocks:** Add/delete blocks (name, date, time).
- **Days off:** Staff days off (per staff, date, reason).
- **Schedule hub:** Tabs for Time blocks and Days off.

### More menu – E-Commerce and products

- **Products and e-commerce hub:** Products and inventory, Walk-in sale, Orders and returns, Shipping and collection.
- **Products hub:** Tabs Products, Inventory.
- **Products:** List; add/edit/delete products.
- **Product form:** Create/edit product (optional id).
- **Walk-in sale:** Quick in-person sales.
- **Orders hub:** Tabs Orders, Returns.
- **Product orders:** List.
- **Product returns:** Returns and refunds.
- **Inventory:** Inventory (via products-hub).
- **Suppliers:** Suppliers.
- **Catalogue overview:** Link to products.

### More menu – Business (catalogue, team, finance, reports, gallery)

- **Catalogue offerings hub:** Services list; "Add service" to catalogue; tap to catalogue/[id].
- **Catalogue / Catalogue [id]:** Services list and service detail/edit.
- **Services catalogue / Service form:** Services; add/edit (id in query).
- **Packages / Packages list:** Packages; "Open web" via in-app browser where used.
- **Team hub / Team:** Team list; "Add member" to team-list; tap to team-member/[id].
- **Team list:** Add member (name, email, phone, role, locations, services, commission).
- **Team member [id]:** Staff detail: permissions, locations, schedule, days off, commission (links to staff-permissions, locations, staff-schedule, days-off, team-commissions).
- **Staff schedule:** Weekly shifts; add/edit/delete; "Add team member" to team-list.
- **Finance hub:** Earnings, balance, pending; link to finance-billing-hub.
- **Finance billing hub:** Earnings, Payroll, Invoices, Payouts, Billing history, Gift cards, VAT reports, Team totals, My earnings.
- **Finance:** Overview (earnings, transactions).
- **Payroll:** Pay runs; approve, mark paid.
- **Invoices:** Create, view, send.
- **Payouts:** Payout requests and history.
- **Billing history:** List; invoice links in in-app browser.
- **Gift cards:** Gift card settings / accept platform gift cards.
- **VAT reports:** VAT submissions and remittance; tax-configuration.
- **Team totals:** Daily/weekly performance.
- **My earnings:** Pay stubs.
- **Transactions hub:** Payments, fees, sales from finance API.
- **Sales history:** Sales history.
- **Reports (index):** Business, Revenue, Sales by Service, Bookings, Clients, Staff, Payments, Products, Packages, Gift cards; Analytics and Activity.
- **Reports (per type):** business, revenue, services, bookings, clients, staff, payments, products, packages, gift-cards.
- **Analytics / Activity:** Period, revenue, upcoming bookings, customers; dashboard activity (revenue, appointments, balance, rating, rewards, point transactions).
- **Gallery:** Portfolio photos; PATCH provider profile (gallery, thumbnail).

### More menu – Engagement

- **Engagement hub:** Reviews, messaging and marketing.
- **Reviews:** List; filter by status; respond to reviews.
- **Messaging / Messaging [id]:** Conversation list and thread; mark read, custom offers; link to client.
- **Marketing hub:** Tabs Campaigns, Promo codes.
- **Marketing / Promotions:** Campaigns and promo codes.
- **Explore posts:** Provider's explore posts; list, create, edit caption/status, delete, upload, comments.

### More menu – Settings and help

- **Settings and account hub:** App, Appointment and activity, Clients, Services, Sales, Team, Marketing, Account; each with mobile route (native-first).
- **Contact support:** Help; "View tickets" to support-tickets.
- **Support tickets / Support ticket [id]:** List and ticket detail.
- **Profile:** My profile (photo, personal info, address, plan); link to contact-support.
- **Notification preferences:** Channels (e.g. new reviews, marketing).
- **Upgrade info:** Freelancer to salon; billing in in-app browser.
- **Rewards hub:** Tabs Points (rewards), Badges (gamification).
- **Rewards / Gamification:** Points and badges.
- **Change password / Deactivate account / Delete account:** Account actions.
- **Subscription:** Plan, upgrade, cancel, renew; deep link provider://subscription/success.
- **Portal:** Direct/deep link only (not in menu).
- **In-app browser:** WebView for payment, onboarding, invoices, verification, express-booking, packages.

### Settings sub-pages (50+ under more/settings)

Representative groups:

- **Setup and business:** setup-status, business, hours, locations, distance-settings, business-description.
- **Appointments:** booking-settings, group-appointments, cancellation-policies, cancellation-reasons, closed-periods, note-templates, forms, automations, automations-create.
- **Payments and billing:** payments, subscription, billing, yoco-devices, payout-accounts, sales-settings, tax-configuration, receipt-template, receipt-sequencing, gift-cards-settings.
- **Services and sales:** travel-fees, service-zones, team-settings, team-roles, team-commissions, service-categories, service-addons, upselling, product-categories, shipping-config, resource-groups.
- **Booking and visibility:** online-booking, booking-link, customer-visibility, referral-sources, tip-distribution, time-off-types.
- **Integrations and marketing:** calendar-integration, calendar-preferences, email-integration, twilio-integration, notifications-settings, notification-preferences, language, ads, marketing-integrations.
- **Account and compliance:** verification, blocked-time, staff-permissions (index and [id]), service-zones-analytics.

### Dynamic

- **More [slug]:** Generic slug screen for web-managed features; setup-status banner and link to setup-status.

---

## Summary counts

| Platform | Tabs (visible) | Main stack / app screens | Account/Settings screens | Auth screens |
|----------|----------------|---------------------------|---------------------------|--------------|
| Customer | 6 (home, explore, bookings, cart, chats, profile) | 24+ (including on-demand, more-providers) | 22 account-settings | 3 + callback |
| Provider  | 5 (dashboard, calendar, clients, chats, more) | 6 app-level + 5 tabs | 50+ settings under More | 5 + callback |
