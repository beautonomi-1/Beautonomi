# Learning Center Article Spec

This document lists all Learning Center categories, overview articles, and additional articles. Overview body copy is applied in migration `311_learning_center_overview_content.sql`; additional articles are inserted in `312_learning_center_extra_articles.sql`.

## Categories (existing)

- **General:** getting-started, account-profile, security-privacy, notifications-messaging, troubleshooting-faq, platform-updates, pricing-subscriptions, policies. Child: about-beautonomi (under getting-started).
- **Customer:** booking-checkout, payments-customer, wallet-gift-cards-coupons, loyalty-rewards, reviews-ratings, messaging-providers, managing-bookings, at-home-services, support-tickets-disputes.
- **Provider:** provider-onboarding, services-catalogue, calendar-scheduling, clients-crm, payments-checkout-provider, yoco-terminal, payouts-earnings, staff-permissions, locations-service-areas, marketing-automations, reviews-management, inventory-products, reports-analytics, online-booking-links, waitlist-waiting-room, on-demand-requests, integrations.

## Overview articles (slug → summary)

| Slug | Summary |
|------|--------|
| getting-started-overview | Get started with Beautonomi: create an account, explore as customer or provider, and find the right guides. |
| account-profile-overview | Manage your account and profile: personal info, profile details, login and security, identity verification, addresses, and privacy. |
| security-privacy-overview | Keep your account secure and understand how we handle your data and privacy. |
| notifications-messaging-overview | Configure how you receive notifications (email, SMS, push) and use in-app messaging. |
| troubleshooting-faq-overview | Common questions and how to resolve typical issues on the platform. |
| platform-updates-overview | Latest release notes, new features, and improvements. |
| pricing-subscriptions-overview | Understand Beautonomi pricing and subscription plans for providers. |
| policies-overview | Cancellations, refunds, disputes, safety, and community standards. |
| booking-checkout-overview | How to discover providers, choose a service, and complete booking and checkout. |
| payments-customer-overview | How payments work: Paystack, saved cards, when you're charged, and receipts. |
| wallet-gift-cards-coupons-overview | Use your wallet balance, gift cards, and promo codes. |
| loyalty-rewards-overview | Earn and redeem loyalty points and rewards. |
| reviews-ratings-overview | How to leave reviews and understand ratings. |
| messaging-providers-overview | Message your provider before or after a booking. |
| managing-bookings-overview | Reschedule, cancel, verify arrival, pay additional charges, and write reviews from your booking. |
| at-home-services-overview | How at-home services, travel fees, and safety work. |
| support-tickets-disputes-overview | Get help via support tickets and how disputes are handled. |
| provider-onboarding-overview | Get verified and set up your business on Beautonomi. |
| services-catalogue-overview | Add and manage services, add-ons, and your catalogue. |
| calendar-scheduling-overview | Set availability, time blocks, days off, and recurring appointments. |
| clients-crm-overview | Client list, notes, tags, and history. |
| payments-checkout-provider-overview | Accept payments, send payment links, deposits, tips, and refunds. |
| yoco-terminal-overview | Set up and use the Yoco terminal for in-person payments. |
| payouts-earnings-overview | Request payouts and view earnings and statements. |
| staff-permissions-overview | Add staff, roles, permissions, shifts, and commissions. |
| locations-service-areas-overview | Set up locations, service zones, and travel fees. |
| marketing-automations-overview | Campaigns, promo codes, and marketing integrations. |
| reviews-management-overview | Respond to reviews and build your reputation. |
| inventory-products-overview | Manage products and inventory. |
| reports-analytics-overview | Dashboards, reports, and VAT. |
| online-booking-links-overview | Booking links and embed options. |
| waitlist-waiting-room-overview | Waitlist and front-desk waiting room. |
| on-demand-requests-overview | Accept or decline on-demand service requests. |
| integrations-overview | Calendars, Mapbox, OneSignal, and other integrations. |

(Internal category overviews remain as stubs.)

## Additional articles (for Help Top articles and more)

These slugs are used by the Help Centre "Top articles" and must exist. Each has category_slug, title, slug, summary; body is in migration 312.

| category_slug | title | slug | summary |
|---------------|-------|------|--------|
| managing-bookings | Canceling your booking | canceling-your-booking | How to cancel and what to expect regarding refunds and policies. |
| managing-bookings | Change the date or time of your appointment | reschedule-booking | How to request a reschedule from the booking detail. |
| managing-bookings | If your provider cancels your booking | if-provider-cancels | What happens when a provider cancels; rebook or refund options. |
| payments-customer | Payment methods accepted | payment-methods-accepted | Card, bank, and other methods via Paystack by region. |
| payments-customer | Editing, removing, or adding a payment method | edit-payment-method | Manage saved cards and set a default. |
| payments-customer | When you'll pay for your booking | when-you-pay-booking | When your card is charged and what happens if payment fails. |
| booking-checkout | How to book a service | how-to-book-service | Step-by-step: choose provider, service, time, and checkout. |
| booking-checkout | On-demand booking | on-demand-booking | Request a provider without choosing one; how waiting and result work. |
| booking-checkout | Add-ons and additional charges | add-ons-additional-charges | Adding services or products during the visit; paying online or at the salon. |
| payouts-earnings | How to request a payout | request-payout | Request a payout and how it appears in your balance. |
| payouts-earnings | Understanding your earnings | understanding-earnings | Earnings vs. payout balance; what counts toward payouts. |
| payouts-earnings | Walk-in add-ons and payout balance | walk-in-addons-payout | Why walk-in add-ons don't increase payout balance. |
| provider-onboarding | Verification steps | verification-steps | What we verify and how to complete verification. |
| provider-onboarding | Setup status and checklist | setup-status-checklist | Complete your business setup in app or web. |
| yoco-terminal | Set up Yoco terminal | yoco-setup | Connect and configure your Yoco device. |
| yoco-terminal | Take a walk-in payment | yoco-walk-in-payment | Process an in-person payment with Yoco. |
| payments-customer | Save card and Paystack | save-card-paystack | How we save your card securely; small verification charge. |
| managing-bookings | Verify arrival | verify-arrival | How to verify your arrival for the appointment. |

## Mobile apps (iOS & Android)

Migration `483_learning_center_mobile_guides.sql` adds:

| category_slug | title | slug | summary |
|---------------|-------|------|--------|
| getting-started | Using the customer app (iOS & Android) | customer-mobile-app | Tabs, Help & Learning Center WebView, Paystack in-app browser, push settings. |
| provider-onboarding | Using the provider app (iOS & Android) | provider-mobile-app | Native provider workflows, finance/Yoco, support vs web Learning Center. |

It also appends mobile links to `getting-started-overview` and `introduction-to-beautonomi`, and refreshes featured IDs to include `customer-mobile-app` after `getting-started-overview`.

## Recommended featured articles (for Learning Center homepage)

Migration `313_learning_center_featured_articles.sql` originally set the homepage featured list. Migration `483_learning_center_mobile_guides.sql` updates featured order to:

- getting-started-overview
- customer-mobile-app
- canceling-your-booking
- when-you-pay-booking
- request-payout
- verification-steps
- managing-bookings-overview

Admins can change the list in Admin → Content → Learning → Featured.

## Homepage copy

- **Hero title:** Learning Center  
- **Hero subtitle:** Find guides and answers for customers and providers.  
- **CTA cards:** Already in seed; "For Customers" → /learn/booking-checkout, "For Providers" → /learn/provider-onboarding.
