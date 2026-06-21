-- 699_learning_center_mockup_coverage.sql
-- Inject learning mockup markers into all platform-specific guides (32 articles).
-- Fix provider-web-calendar-bookings to use web calendar mockup instead of mobile.
-- Idempotent: guarded by marker presence and text anchors.

-- ── Fix: web calendar article should show provider-web-calendar under Calendar ─
-- 698 inserted a provider-mobile-calendar marker under <h2>Bookings</h2>. Remove
-- that block (in either id form, regardless of run order) so the web calendar
-- mockup lands under <h2>Calendar</h2> instead of <h2>Bookings</h2>.
UPDATE public.learning_articles
SET
  body = replace(
    body,
    '<h2>Bookings</h2>
<div data-learn-mockup="provider-mobile-calendar" data-caption="Day view with appointments and quick actions"></div>',
    '<h2>Bookings</h2>'
  ),
  updated_at = NOW()
WHERE slug = 'provider-web-calendar-bookings'
  AND tenant_id IS NULL
  AND body LIKE '%<h2>Bookings</h2>
<div data-learn-mockup="provider-mobile-calendar"%';

UPDATE public.learning_articles
SET
  body = replace(
    body,
    '<h2>Bookings</h2>
<div data-learn-mockup="provider-web-calendar" data-caption="Day view with appointments and quick actions"></div>',
    '<h2>Bookings</h2>'
  ),
  updated_at = NOW()
WHERE slug = 'provider-web-calendar-bookings'
  AND tenant_id IS NULL
  AND body LIKE '%<h2>Bookings</h2>
<div data-learn-mockup="provider-web-calendar"%';

-- Inject the web calendar mockup under the Calendar section.
UPDATE public.learning_articles
SET body = replace(body, '<h2>Calendar</h2>', '<h2>Calendar</h2>
<div data-learn-mockup="provider-web-calendar" data-caption="Week view with appointments and quick status"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-calendar-bookings'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-calendar"%'
  AND body LIKE '%<h2>Calendar</h2>%';

-- ── Customer mobile (4 guides without mockups) ───────────────────────────────

UPDATE public.learning_articles
SET body = replace(body, '<h2>Keep alerts reliable</h2>', '<h2>Keep alerts reliable</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Profile — notifications, addresses, and support"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-mobile-notifications-support'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-mobile-profile"%'
  AND body LIKE '%<h2>Keep alerts reliable</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Before buying</h2>', '<h2>Before buying</h2>
<div data-learn-mockup="customer-mobile-shop" data-caption="Browse products and packages before checkout"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-mobile-shop-orders'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-mobile-shop"%'
  AND body LIKE '%<h2>Before buying</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Checkout tips</h2>', '<h2>Checkout tips</h2>
<div data-learn-mockup="customer-mobile-wallet" data-caption="Wallet, coupons, loyalty, and saved cards"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-mobile-wallet-loyalty'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-mobile-wallet"%'
  AND body LIKE '%<h2>Checkout tips</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Best practice</h2>', '<h2>Best practice</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Saved addresses and at-home location pins in Profile"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-mobile-addresses-at-home'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-mobile-profile"%'
  AND body LIKE '%<h2>Best practice</h2>%';

-- ── Customer web (7 guides without mockups) ──────────────────────────────────

UPDATE public.learning_articles
SET body = replace(body, '<h2>Where to find documents</h2>', '<h2>Where to find documents</h2>
<div data-learn-mockup="customer-web-account" data-caption="Account hub — receipts, invoices, and payment history"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-web-payments-receipts'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-account"%'
  AND body LIKE '%<h2>Where to find documents</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Before checkout</h2>', '<h2>Before checkout</h2>
<div data-learn-mockup="customer-web-shop" data-caption="Products, packages, and variant selection on the web"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-web-shop-orders'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-shop"%'
  AND body LIKE '%<h2>Before checkout</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Addresses</h2>', '<h2>Addresses</h2>
<div data-learn-mockup="customer-web-account" data-caption="Saved addresses and account settings"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-web-account-support'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-account"%'
  AND body LIKE '%<h2>Addresses</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Use booking detail for actions</h2>', '<h2>Use booking detail for actions</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Reschedule, pay, message, or review from booking detail"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-web-manage-bookings'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-manage-bookings"%'
  AND body LIKE '%<h2>Use booking detail for actions</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Before checkout</h2>', '<h2>Before checkout</h2>
<div data-learn-mockup="customer-web-account" data-caption="Wallet, coupons, gift cards, and loyalty before checkout"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-web-wallet-loyalty'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-account"%'
  AND body LIKE '%<h2>Before checkout</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Address format</h2>', '<h2>Address format</h2>
<div data-learn-mockup="customer-web-account" data-caption="South African address format and map pins"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-web-addresses-at-home'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-account"%'
  AND body LIKE '%<h2>Address format</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Messaging providers</h2>', '<h2>Messaging providers</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Message your provider from booking detail"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-web-reviews-messaging-support'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-manage-bookings"%'
  AND body LIKE '%<h2>Messaging providers</h2>%';

-- ── Provider mobile (6 guides without mockups) ───────────────────────────────

UPDATE public.learning_articles
SET body = replace(body, '<h2>Finance</h2>', '<h2>Finance</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Earnings, payout balance, Yoco, and bank accounts"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-finance-yoco-payouts'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-finance"%'
  AND body LIKE '%<h2>Finance</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Packages</h2>', '<h2>Packages</h2>
<div data-learn-mockup="provider-mobile-packages" data-caption="Packages and memberships sold to customers"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-packages-memberships'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-packages"%'
  AND body LIKE '%<h2>Packages</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Daily workflow</h2>', '<h2>Daily workflow</h2>
<div data-learn-mockup="provider-mobile-calendar" data-caption="Day view with appointments and quick actions"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-calendar-bookings'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-calendar"%'
  AND body LIKE '%<h2>Daily workflow</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Group bookings</h2>', '<h2>Group bookings</h2>
<div data-learn-mockup="provider-mobile-calendar" data-caption="Group sessions and time blocks on the schedule"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-group-bookings-time-blocks'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-calendar"%'
  AND body LIKE '%<h2>Group bookings</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Locations</h2>', '<h2>Locations</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="Locations and business settings under More"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-locations-settings'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-more"%'
  AND body LIKE '%<h2>Locations</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Launch checklist</h2>', '<h2>Launch checklist</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="Setup checklist and launch status in More"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-setup-status-launch'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-more"%'
  AND body LIKE '%<h2>Launch checklist</h2>%';

-- ── Provider web (15 guides without mockups) ─────────────────────────────────

UPDATE public.learning_articles
SET body = replace(body, '<h2>Group bookings</h2>', '<h2>Group bookings</h2>
<div data-learn-mockup="provider-web-calendar" data-caption="Group sessions and time blocks on the web calendar"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-group-bookings-time-blocks'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-calendar"%'
  AND body LIKE '%<h2>Group bookings</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Metric ranges</h2>', '<h2>Metric ranges</h2>
<div data-learn-mockup="provider-web-clients" data-caption="Front desk and client queue metrics"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-front-desk'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-clients"%'
  AND body LIKE '%<h2>Metric ranges</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Metric meanings</h2>', '<h2>Metric meanings</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Period earnings vs available-to-withdraw balance"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-finance-payouts'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-finance"%'
  AND body LIKE '%<h2>Metric meanings</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Setup checklist</h2>', '<h2>Setup checklist</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Add and verify payout bank accounts"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-payout-bank-accounts'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-finance"%'
  AND body LIKE '%<h2>Setup checklist</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Setup</h2>', '<h2>Setup</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Yoco integration and device setup"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-yoco-payments'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-settings"%'
  AND body LIKE '%<h2>Setup</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Packages and variants</h2>', '<h2>Packages and variants</h2>
<div data-learn-mockup="provider-web-catalogue" data-caption="Packages, variants, memberships, and subscription"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-packages-memberships'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-catalogue"%'
  AND body LIKE '%<h2>Packages and variants</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Receipts and invoices</h2>', '<h2>Receipts and invoices</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Receipt and invoice templates and branding"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-locations-receipts'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-settings"%'
  AND body LIKE '%<h2>Receipts and invoices</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Catalogue checklist</h2>', '<h2>Catalogue checklist</h2>
<div data-learn-mockup="provider-web-catalogue" data-caption="Services, products, packages, and memberships"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-services-catalogue'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-catalogue"%'
  AND body LIKE '%<h2>Catalogue checklist</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Order workflow</h2>', '<h2>Order workflow</h2>
<div data-learn-mockup="provider-web-orders" data-caption="Product order tabs with action counters"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-ecommerce-orders'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-orders"%'
  AND body LIKE '%<h2>Order workflow</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Client profile</h2>', '<h2>Client profile</h2>
<div data-learn-mockup="provider-web-clients" data-caption="Client notes, history, and messaging"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-clients-messaging-crm'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-clients"%'
  AND body LIKE '%<h2>Client profile</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Setup checklist</h2>', '<h2>Setup checklist</h2>
<div data-learn-mockup="provider-web-team" data-caption="Staff roles, shifts, and permissions"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-staff-permissions'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-team"%'
  AND body LIKE '%<h2>Setup checklist</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Use the right range</h2>', '<h2>Use the right range</h2>
<div data-learn-mockup="provider-web-reports" data-caption="Reports and analytics with period filters"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-reports-analytics'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-reports"%'
  AND body LIKE '%<h2>Use the right range</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Link hygiene</h2>', '<h2>Link hygiene</h2>
<div data-learn-mockup="customer-web-booking" data-caption="Public booking link — service selection and checkout"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-online-booking-links'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-booking"%'
  AND body LIKE '%<h2>Link hygiene</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Provider account areas</h2>', '<h2>Provider account areas</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Security, privacy, and provider account settings"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-settings-security'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-settings"%'
  AND body LIKE '%<h2>Provider account areas</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Where to manage it</h2>', '<h2>Where to manage it</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Provider subscription plan management"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-subscription-plan'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-settings"%'
  AND body LIKE '%<h2>Where to manage it</h2>%';

-- ── Accuracy: soften customer web booking caption (698 seed) ─────────────────
UPDATE public.learning_articles
SET
  body = replace(
    body,
    'data-caption="Choose a service and continue to secure checkout"',
    'data-caption="Choose a service — checkout continues via Paystack on web or in-app"'
  ),
  updated_at = NOW()
WHERE slug = 'customer-web-booking'
  AND tenant_id IS NULL
  AND body LIKE '%data-caption="Choose a service and continue to secure checkout"%';

-- ── Accuracy: customer web booking — Paystack and canonical /booking flow ────
UPDATE public.learning_articles
SET
  body = replace(
    body,
    '<li>If a payment opens in a secure browser step, finish it and return to Beautonomi so the booking can update.</li>',
    '<li>Online card payments are processed via Paystack. If a payment opens in a secure browser step, finish it and return to Beautonomi so the booking can update.</li>'
  ),
  updated_at = NOW()
WHERE slug = 'customer-web-booking'
  AND tenant_id IS NULL
  AND body LIKE '%If a payment opens in a secure browser step%'
  AND body NOT LIKE '%processed via Paystack%';

UPDATE public.learning_articles
SET
  body = replace(
    body,
    '<li>Booking emails and receipts link back to the same booking record you see in your account.</li>',
    '<li>Booking emails and receipts link back to the same booking record you see in your account.</li>
  <li>Most customers start from <strong>/book/[provider]</strong>, which continues into the canonical <strong>/booking</strong> checkout flow.</li>'
  ),
  updated_at = NOW()
WHERE slug = 'customer-web-booking'
  AND tenant_id IS NULL
  AND body LIKE '%Booking emails and receipts link back%'
  AND body NOT LIKE '%/book/[provider]%';
