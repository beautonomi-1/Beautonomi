-- 545_learning_center_platform_guides_refresh.sql
-- Refresh public Learning Center content for customer/provider web and mobile app guides.
-- Idempotent: upserts by category/article slug and homepage section key.

INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility)
VALUES
  ('Web guides', 'web-guides', NULL, 9, 'general', 'public'),
  ('Mobile app guides', 'mobile-app-guides', NULL, 10, 'general', 'public')
ON CONFLICT (slug) WHERE tenant_id IS NULL DO UPDATE
SET
  title = EXCLUDED.title,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  audience = EXCLUDED.audience,
  visibility = EXCLUDED.visibility,
  updated_at = NOW();

WITH article_seed (cat_slug, title, slug, summary, body, audience, featured_order) AS (
  VALUES
    (
      'web-guides',
      'Customer web booking guide',
      'customer-web-booking',
      'How customers use Beautonomi on the web to search, book, pay, and manage appointments.',
      $body$<p>Use the Beautonomi website when you want the full marketplace and account experience in a browser. Your web account stays in sync with the mobile app when you use the same login.</p>
<h2>Book from the web</h2>
<ol>
  <li>Search for a service, provider, location, date, or category.</li>
  <li>Open a provider or service page and review prices, duration, location options, policies, and available times.</li>
  <li>Select the service, any add-ons or package options, then choose an available slot.</li>
  <li>Confirm your details, address if needed, and payment method at checkout.</li>
</ol>
<h2>Manage bookings</h2>
<p>Use your account area to view upcoming and past bookings, pay outstanding balances, download receipts, reschedule where allowed, cancel within the provider policy, and contact support.</p>
<h2>Good to know</h2>
<ul>
  <li>At-home services require accurate address details and coordinates so travel fees and provider routing work correctly.</li>
  <li>Booking emails and receipts link back to the same booking record you see in your account.</li>
  <li>If a payment opens in a secure browser step, finish it and return to Beautonomi so the booking can update.</li>
</ul>$body$,
      'customer',
      10
    ),
    (
      'web-guides',
      'Customer web payments, receipts, and invoices',
      'customer-web-payments-receipts',
      'Understand checkout, receipts, order documents, and support from the customer web account.',
      $body$<p>Beautonomi keeps payment and document history with each booking or product order so you can find proof of payment later.</p>
<h2>Where to find documents</h2>
<ul>
  <li><strong>Bookings</strong> show appointment receipts and booking payment status.</li>
  <li><strong>Orders</strong> show product order receipts and order status.</li>
  <li>Email receipts use the same structured layout as downloadable PDFs for clearer printing and forwarding.</li>
</ul>
<h2>Payment status</h2>
<p>A booking or order can show paid, pending, failed, refunded, or partially refunded depending on provider policy and payment processor confirmation. If a payment succeeds but the page does not refresh immediately, wait a moment and reopen the booking or order.</p>
<h2>Support</h2>
<p>If a receipt looks wrong, open a support ticket with the booking or order reference and the payment time. Do not create a duplicate booking just to retry support.</p>$body$,
      'customer',
      20
    ),
    (
      'web-guides',
      'Customer web shop and product orders',
      'customer-web-shop-orders',
      'How customers buy products and packages on the web, including product variants.',
      $body$<p>Some providers sell retail products, bundles, packages, or product variants such as size, colour, scent, or volume.</p>
<h2>Before checkout</h2>
<ul>
  <li>Review the product name, selected variant, quantity, stock status, and collection or delivery option.</li>
  <li>For packages, check which services and products are included before paying.</li>
  <li>If a package includes a specific product variant, the selected variant appears in the package detail and cart.</li>
</ul>
<h2>After checkout</h2>
<p>Orders appear in your account with payment status, fulfilment status, and receipt access. Contact the provider or support if a product variant or quantity is incorrect before collection or delivery is completed.</p>$body$,
      'customer',
      30
    ),
    (
      'web-guides',
      'Customer account, addresses, and support on web',
      'customer-web-account-support',
      'Manage customer profile details, addresses, privacy, support tickets, and help content on the web.',
      $body$<p>Your customer account stores profile details, contact details, saved addresses, privacy choices, bookings, orders, receipts, and support history.</p>
<h2>Addresses</h2>
<p>For South African addresses, use the street number first, then street name, suburb, city, province, and postal code. Select an address suggestion where possible so the saved coordinates are accurate. If you drop a map pin, place it on the exact entrance or service location.</p>
<h2>Support and privacy</h2>
<ul>
  <li>Use support tickets for booking, order, payment, or account issues.</li>
  <li>Use account settings for login security, privacy, data rights, and export requests.</li>
  <li>Use the Learning Center for product guidance before contacting support.</li>
</ul>$body$,
      'customer',
      40
    ),
    (
      'mobile-app-guides',
      'Using the customer app (iOS & Android)',
      'customer-mobile-app',
      'How the Beautonomi customer app works: tabs, booking, browser payments, notifications, and support.',
      $body$<p>The Beautonomi <strong>customer app</strong> is available for iPhone and Android. Use the same email or phone login as the website so bookings, orders, wallet activity, messages, and support history stay in sync.</p>
<h2>Main navigation</h2>
<ul>
  <li><strong>Home</strong> helps you discover providers, services, offers, and featured content.</li>
  <li><strong>Search</strong> helps you find services and providers by category, location, or keywords.</li>
  <li><strong>Bookings</strong> shows upcoming and past appointments, payment status, and booking actions.</li>
  <li><strong>Chats</strong> keeps conversations with providers together.</li>
  <li><strong>Wishlists</strong> stores saved providers, services, or products where available.</li>
</ul>
<h2>Payments and receipts</h2>
<p>Secure checkout may open in an in-app browser. Complete the payment, return to the app, and reopen the booking or order if the status needs a moment to refresh. Receipts are available from booking or order detail screens and match the web documents.</p>
<h2>Account and help</h2>
<p>Use the profile or account entry for personal details, addresses, payment settings, privacy, data rights, and support. Help screens can open Learning Center articles in a browser view so mobile and web guidance stays consistent.</p>
<h2>Notifications</h2>
<p>Allow push notifications in your phone settings so booking reminders, provider messages, and order updates arrive on time.</p>$body$,
      'customer',
      50
    ),
    (
      'mobile-app-guides',
      'Customer app booking and payment flow',
      'customer-mobile-booking-payments',
      'Book, pay, and manage appointments from the customer mobile app.',
      $body$<p>The mobile booking flow is designed for quick decisions while keeping key details visible before checkout.</p>
<h2>Booking checklist</h2>
<ul>
  <li>Confirm provider, service, duration, price, date, and time before payment.</li>
  <li>For at-home services, select a saved address or accurate suggestion with the correct street number and suburb.</li>
  <li>Check cancellation rules, deposit requirements, and outstanding balance.</li>
</ul>
<h2>After payment</h2>
<p>The app updates the booking once the payment processor confirms the result. If the app was backgrounded during payment, reopen the booking from the Bookings tab to refresh the latest status.</p>$body$,
      'customer',
      NULL
    ),
    (
      'mobile-app-guides',
      'Customer app support, alerts, and account settings',
      'customer-mobile-notifications-support',
      'Use mobile support, notification settings, addresses, and account controls.',
      $body$<p>Mobile support gives you quick access to tickets, policies, account controls, and Learning Center articles.</p>
<h2>Keep alerts reliable</h2>
<ul>
  <li>Enable push notifications for reminders, booking changes, messages, and order updates.</li>
  <li>Keep the app updated so payment and notification fixes are installed.</li>
  <li>Use one account across web and mobile to avoid split booking histories.</li>
</ul>
<h2>Support tickets</h2>
<p>Open a ticket from Help or your account area. Include the booking, order, or receipt reference when possible so support can investigate faster.</p>$body$,
      'customer',
      NULL
    ),
    (
      'web-guides',
      'Provider web portal guide',
      'provider-web-portal',
      'A current map of the provider web portal sidebar and the main work areas.',
      $body$<p>The provider web portal is the full control centre for running the business. Use it for configuration-heavy work, reporting, payouts, finance, and detailed operational management.</p>
<h2>Key sidebar areas</h2>
<ul>
  <li><strong>Dashboard</strong> summarizes the day without notification counters competing with action tabs.</li>
  <li><strong>Bookings, Calendar, Group Bookings, Front Desk, and Time Blocks</strong> manage the schedule.</li>
  <li><strong>E-commerce orders</strong> uses counters on tabs where providers need to take action.</li>
  <li><strong>Finance, Payouts, Bank Accounts, and Yoco</strong> cover earnings, payout balance, payout requests, bank setup, and terminal payments.</li>
  <li><strong>Packages, Memberships, Subscription, Services, Locations, and Settings</strong> cover catalogue and business configuration.</li>
</ul>
<h2>Use web for advanced setup</h2>
<p>Use the web portal when you need deeper editing, printed or emailed receipts and invoices, location pin accuracy, subscription management, or a larger reporting view.</p>$body$,
      'provider',
      60
    ),
    (
      'web-guides',
      'Provider web calendar and bookings',
      'provider-web-calendar-bookings',
      'Manage bookings, calendars, realtime updates, and action counters on provider web.',
      $body$<p>Bookings and Calendar are the operational views for appointments. They show the latest records from the provider account and are designed to avoid duplicated realtime subscriptions.</p>
<h2>Bookings</h2>
<ul>
  <li>Create, edit, confirm, cancel, and review appointments.</li>
  <li>Use filters to focus on pending, upcoming, completed, or cancelled work.</li>
  <li>Open a booking for payment, receipt, client, staff, and status details.</li>
</ul>
<h2>Calendar</h2>
<p>Calendar is best for day and week scheduling. Use time blocks to protect unavailable time and group bookings when multiple customers attend the same session.</p>
<h2>Counters</h2>
<p>Provider dashboard does not use a counter badge, while action-heavy tabs such as e-commerce order statuses can show counters to highlight pending provider work.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider web group bookings and time blocks',
      'provider-web-group-bookings-time-blocks',
      'Create group sessions and prevent scheduling mistakes with clear time blocks.',
      $body$<p>Group bookings and time blocks help providers manage capacity and protect unavailable time.</p>
<h2>Group bookings</h2>
<ul>
  <li>Use <strong>New group booking</strong> or the guided setup card to create a group session.</li>
  <li>Add participants, check them in or out, and cancel sessions when needed.</li>
  <li>Keep capacity, date, time, location, staff, and linked bookings aligned before publishing.</li>
</ul>
<h2>Time blocks</h2>
<p>Create a block type directly when the needed type is missing. Use duration shortcuts and clear start/end times to reduce scheduling errors. Blocks should cover breaks, leave, maintenance, training, travel, or private work.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider front desk metrics',
      'provider-web-front-desk',
      'Use all, today, week, month, and year filters in provider front desk metrics.',
      $body$<p>Front Desk brings waiting room, arrivals, queue, and daily operational metrics into one provider-facing view.</p>
<h2>Metric ranges</h2>
<ul>
  <li><strong>All</strong> shows lifetime or full-available data where relevant.</li>
  <li><strong>Today</strong> focuses the live operational day.</li>
  <li><strong>Week, Month, and Year</strong> help compare demand and throughput over broader periods.</li>
</ul>
<p>Use filters before making staffing or service decisions so the metric period matches the question you are trying to answer.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider finance metrics and payouts',
      'provider-web-finance-payouts',
      'Understand period earnings, all-time payout balance, refunds, payout requests, and bank accounts.',
      $body$<p>Provider finance separates <strong>period earnings</strong> from <strong>all-time available to withdraw</strong>. This prevents short reporting windows from being mistaken for payout balance.</p>
<h2>Metric meanings</h2>
<ul>
  <li><strong>Period earnings</strong> reflect the selected range such as today, week, month, year, or all.</li>
  <li><strong>Available to withdraw</strong> is the all-time settled balance that is not already queued for payout.</li>
  <li><strong>Platform fees deducted</strong> and <strong>refunds this period</strong> explain why gross sales and net earnings differ.</li>
  <li><strong>In queue</strong> shows payout requests that are already submitted but not completed.</li>
</ul>
<h2>Requesting a payout</h2>
<p>Request payouts from Finance or Payouts. The dialog lets you choose an amount, select a payout bank account, add notes, and add or verify a bank account inline when needed.</p>$body$,
      'provider',
      70
    ),
    (
      'web-guides',
      'Provider payout bank accounts',
      'provider-web-payout-bank-accounts',
      'Add, verify, and choose provider bank accounts for payout requests.',
      $body$<p>Payout bank accounts are managed from the provider web sidebar and from payout request dialogs when a bank account is needed.</p>
<h2>Setup checklist</h2>
<ul>
  <li>Use the correct bank, account number, branch or bank code where required, and account holder details.</li>
  <li>Verify the bank account before requesting a payout when verification is available.</li>
  <li>Choose the intended bank account in the payout request dialog before submitting.</li>
</ul>
<p>Keep old accounts only if they are still valid. If a payout is already queued, changing accounts later may not change that existing request.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider Yoco setup and accounting',
      'provider-web-yoco-payments',
      'Set up Yoco, take terminal payments, and understand how sales accounting is updated.',
      $body$<p>Yoco is available from the provider web sidebar and the provider app More screen. Use it for in-person card terminal payments where enabled for the account.</p>
<h2>Setup</h2>
<ul>
  <li>Open <strong>Yoco</strong> from provider web or <strong>More → Yoco payments</strong> in the app.</li>
  <li>Connect the Yoco integration, add devices, and confirm the provider account has access.</li>
  <li>Use the device or payment sheet connected to the sale or checkout flow.</li>
</ul>
<h2>Accounting behaviour</h2>
<p>Yoco webhooks update linked POS sales after the terminal payment confirms. Successful callbacks mark the sale as paid and trigger product stock decrements. Duplicate Yoco payment notifications are handled idempotently so accounting rows are not duplicated.</p>$body$,
      'provider',
      80
    ),
    (
      'web-guides',
      'Provider packages, variants, memberships, and subscriptions',
      'provider-web-packages-memberships',
      'Manage packages with product variants, memberships you sell, and provider subscriptions.',
      $body$<p>Providers can sell services, retail products, memberships, packages, and subscriptions depending on enabled features.</p>
<h2>Packages and variants</h2>
<p>When a package includes a product that has variants, choose the exact variant during package creation or editing. This keeps customer-facing package details, product stock, fulfilment, and entitlement matching accurate.</p>
<h2>Memberships</h2>
<p>Use the Memberships area to manage recurring or prepaid offers you sell to customers. Keep terms, included services, redemption rules, and pricing clear.</p>
<h2>Subscription</h2>
<p>Use Subscription from the provider sidebar to manage the provider business plan. This is separate from memberships that the provider sells to customers.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider locations, addresses, receipts, and invoices',
      'provider-web-locations-receipts',
      'Set accurate South African addresses and produce clean printed or emailed documents.',
      $body$<p>Locations and documents affect customer trust, provider routing, payment support, and reporting.</p>
<h2>South African address format</h2>
<p>Enter the street number first, then street name, suburb, city, province, and postal code. Prefer address suggestions where available because they populate structured fields and coordinates. If you use the map pin, place it on the exact entrance or service point.</p>
<h2>Receipts and invoices</h2>
<p>Booking receipts, product order receipts, and invoices use structured printable layouts for totals, taxes or fees where applicable, customer and provider details, line items, and payment status. Use the generated PDF or email view when sharing documents externally.</p>$body$,
      'provider',
      NULL
    ),
    (
      'mobile-app-guides',
      'Using the provider app (iOS & Android)',
      'provider-mobile-app',
      'How the provider app fits with the web portal: More navigation, bookings, finance, Yoco, and support.',
      $body$<p>The Beautonomi <strong>provider app</strong> is available for iPhone and Android. It is designed for day-to-day work while the web portal remains the best place for deeper configuration and reporting.</p>
<h2>Main areas</h2>
<ul>
  <li><strong>Dashboard</strong> summarizes operational health and available-to-withdraw terminology.</li>
  <li><strong>Calendar and Bookings</strong> handle the daily schedule, customer appointments, and status changes.</li>
  <li><strong>More</strong> is the app hub for Finance &amp; Billing, Yoco payments, Subscription &amp; plan, Payout bank accounts, Memberships, Packages, settings, support, and additional tools.</li>
</ul>
<h2>Payments and Yoco</h2>
<p>Use <strong>More → Yoco payments</strong> for Yoco setup and terminal payments. Finance and payouts in the app follow the same distinction as web: selected-period earnings are separate from the all-time available withdrawal balance.</p>
<h2>Support</h2>
<p>Use Contact support and My tickets in the app for technical or account issues. Long-form help opens Learning Center articles so guidance remains consistent with web.</p>$body$,
      'provider',
      90
    ),
    (
      'mobile-app-guides',
      'Provider app More navigation',
      'provider-mobile-more-navigation',
      'Find Yoco, finance, subscriptions, payout bank accounts, memberships, packages, and support from More.',
      $body$<p>The <strong>More</strong> tab is the provider app navigation hub. It brings business operations and setup shortcuts together so providers do not need to hunt through settings.</p>
<h2>Prominent items</h2>
<ul>
  <li><strong>Yoco payments</strong> for integration, devices, and terminal payment workflows.</li>
  <li><strong>Finance &amp; Billing</strong> for earnings, payouts, invoices, and financial activity.</li>
  <li><strong>Payout bank accounts</strong> for bank setup before requesting payouts.</li>
  <li><strong>Subscription &amp; plan</strong> for the provider business plan.</li>
  <li><strong>Memberships</strong> and <strong>Packages</strong> for offers sold to customers.</li>
  <li><strong>Help &amp; support</strong> for tickets and guidance.</li>
</ul>$body$,
      'provider',
      NULL
    ),
    (
      'mobile-app-guides',
      'Provider app finance, Yoco, and payouts',
      'provider-mobile-finance-yoco-payouts',
      'Use finance range filters, payout requests, bank accounts, and Yoco payments in the provider app.',
      $body$<p>Provider app finance mirrors the web terminology so providers can understand earnings and payout balance while away from a desktop.</p>
<h2>Finance</h2>
<ul>
  <li>Use all, today, week, month, and year ranges where available.</li>
  <li>Read <strong>selected period total</strong> as earnings for that range.</li>
  <li>Read <strong>all-time available to withdraw</strong> as the settled balance that can be paid out.</li>
</ul>
<h2>Payouts and Yoco</h2>
<p>If no payout bank account exists, the app guides you to add one before requesting a payout. Use More → Yoco payments to connect devices and run terminal payment workflows.</p>$body$,
      'provider',
      NULL
    ),
    (
      'mobile-app-guides',
      'Provider app packages and memberships',
      'provider-mobile-packages-memberships',
      'Create and manage packages, product variant selections, memberships, and customer offers in the provider app.',
      $body$<p>The provider app supports mobile management for packages and memberships where available.</p>
<h2>Packages</h2>
<p>When adding a product with variants to a package, choose the exact variant chip before saving. This avoids fulfilment errors and makes customer package details clearer.</p>
<h2>Memberships</h2>
<p>Use the Memberships entry in More to manage offers you sell to customers. Keep inclusions, redemption rules, price, and renewal terms easy to understand.</p>
<h2>When to use web</h2>
<p>Use the web portal for large edits, bulk catalogue work, detailed reporting, or anything that benefits from a bigger screen.</p>$body$,
      'provider',
      NULL
    )
)
INSERT INTO public.learning_articles (
  category_id,
  title,
  slug,
  summary,
  body,
  content_format,
  status,
  audience,
  is_internal,
  published_at,
  featured_order,
  image_url
)
SELECT
  c.id,
  s.title,
  s.slug,
  s.summary,
  s.body,
  'html',
  'published',
  s.audience,
  false,
  NOW(),
  s.featured_order::integer,
  '/images/learn/feature-browser-placeholder.svg'
FROM article_seed s
JOIN public.learning_categories c ON c.slug = s.cat_slug AND c.tenant_id IS NULL
ON CONFLICT (slug) WHERE tenant_id IS NULL DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  content_format = EXCLUDED.content_format,
  status = EXCLUDED.status,
  audience = EXCLUDED.audience,
  is_internal = EXCLUDED.is_internal,
  published_at = COALESCE(public.learning_articles.published_at, EXCLUDED.published_at),
  featured_order = EXCLUDED.featured_order,
  image_url = EXCLUDED.image_url,
  updated_at = NOW();

WITH extra_article_seed (cat_slug, title, slug, summary, body, audience, featured_order) AS (
  VALUES
    (
      'web-guides',
      'Customer web booking management',
      'customer-web-manage-bookings',
      'Reschedule, cancel, pay balances, review booking status, and contact support from customer web.',
      $body$<p>Customer web booking management gives you the clearest view of appointment status, payment status, provider details, receipts, and next actions.</p>
<h2>Use booking detail for actions</h2>
<ul>
  <li><strong>Pay</strong> any outstanding deposit, balance, or additional charge from the booking detail page.</li>
  <li><strong>Reschedule</strong> only when the provider policy and booking status allow it.</li>
  <li><strong>Cancel</strong> from the booking when cancellation is still available, then review any refund or fee result.</li>
  <li><strong>Message or support</strong> from the related booking so the provider or support team has context.</li>
</ul>
<h2>Status checks</h2>
<p>Open the booking again after payment, cancellation, or reschedule requests if you need the latest server-confirmed state. Avoid creating a duplicate booking while waiting for a payment redirect to finish.</p>$body$,
      'customer',
      NULL
    ),
    (
      'web-guides',
      'Customer wallet, coupons, gift cards, and loyalty on web',
      'customer-web-wallet-loyalty',
      'Use wallet balance, coupons, gift cards, and loyalty rewards from the customer web account.',
      $body$<p>Beautonomi can support wallet credits, provider gift cards, coupons, and loyalty rewards depending on the provider and campaign configuration.</p>
<h2>Before checkout</h2>
<ul>
  <li>Check whether a coupon applies to the selected provider, service, product, package, or date.</li>
  <li>Confirm wallet or gift card balance before relying on it for the full amount.</li>
  <li>Review the final total after discounts, travel fees, deposits, and taxes or platform fees where applicable.</li>
</ul>
<h2>Loyalty</h2>
<p>Loyalty rewards are provider-specific when enabled. Points, redemption rules, expiry, and reward value can differ by provider, so always review the offer before booking or purchasing.</p>$body$,
      'customer',
      NULL
    ),
    (
      'web-guides',
      'Customer addresses and at-home services on web',
      'customer-web-addresses-at-home',
      'Save accurate South African addresses and understand at-home service routing and travel fees.',
      $body$<p>Accurate addresses help providers arrive at the right location and keep travel fees fair.</p>
<h2>Address format</h2>
<p>Use South African address order: street number, street name, suburb, city, province, and postal code. When an address suggestion appears, select it so structured fields and coordinates are populated together.</p>
<h2>Map pins</h2>
<p>If you use a map pin, place it on the exact entrance, reception area, or service point. A nearby road or neighbourhood centre can create wrong routing and inaccurate travel calculations.</p>
<h2>At-home bookings</h2>
<p>Travel fees, service radius, and availability depend on provider settings. If a provider cannot service the address, choose another location or book at the provider venue.</p>$body$,
      'customer',
      NULL
    ),
    (
      'web-guides',
      'Customer reviews, messaging, and support on web',
      'customer-web-reviews-messaging-support',
      'Message providers, leave reviews, and use support tickets with the right context.',
      $body$<p>Messaging, reviews, and support work best when they are linked to the right provider, booking, or order.</p>
<h2>Messaging providers</h2>
<ul>
  <li>Use messages for practical questions before or after a booking.</li>
  <li>Keep important instructions in the thread instead of separate channels.</li>
  <li>Do not share sensitive payment or identity details in chat.</li>
</ul>
<h2>Reviews</h2>
<p>Leave reviews after completed appointments. Be specific, fair, and respectful so other customers understand the experience.</p>
<h2>Support tickets</h2>
<p>For payment, refund, dispute, or technical issues, open a ticket with the booking or order reference so support can investigate quickly.</p>$body$,
      'customer',
      NULL
    ),
    (
      'mobile-app-guides',
      'Customer app shop, orders, and package purchases',
      'customer-mobile-shop-orders',
      'Buy products and packages in the customer app, including product variant checks.',
      $body$<p>The customer app can surface provider shops, product orders, and package offers where enabled.</p>
<h2>Before buying</h2>
<ul>
  <li>Confirm product variant details such as size, colour, scent, or volume.</li>
  <li>Review collection, delivery, or fulfilment instructions before payment.</li>
  <li>For packages, check included services, included products, redemption rules, and expiry.</li>
</ul>
<h2>After buying</h2>
<p>Open the order detail to track fulfilment and receipt access. If a product variant is wrong, contact the provider or support before collection or delivery is completed.</p>$body$,
      'customer',
      NULL
    ),
    (
      'mobile-app-guides',
      'Customer app wallet, loyalty, coupons, and saved payments',
      'customer-mobile-wallet-loyalty',
      'Use wallet credits, loyalty rewards, coupons, gift cards, and saved payment methods from mobile.',
      $body$<p>Mobile checkout mirrors web rules for wallet credits, coupons, gift cards, loyalty, and saved payment methods.</p>
<h2>Checkout tips</h2>
<ul>
  <li>Apply coupons before final payment so the total updates correctly.</li>
  <li>Check wallet or gift card balance before confirming checkout.</li>
  <li>Saved cards use secure payment tokens; full card numbers are not stored by Beautonomi.</li>
</ul>
<p>If payment opens in an in-app browser, finish that step and return to the app before checking the booking or order status.</p>$body$,
      'customer',
      NULL
    ),
    (
      'mobile-app-guides',
      'Customer app addresses and at-home bookings',
      'customer-mobile-addresses-at-home',
      'Use accurate saved addresses and location selection for mobile at-home bookings.',
      $body$<p>At-home mobile bookings depend on accurate address fields and coordinates.</p>
<h2>Best practice</h2>
<ul>
  <li>Select a suggested South African address when possible.</li>
  <li>Check that the street number, street name, suburb, city, province, and postal code are correct.</li>
  <li>Use the map pin only when you can place it accurately on the service location.</li>
</ul>
<p>High-accuracy location permissions can help, but you should still review the final address before checkout.</p>$body$,
      'customer',
      NULL
    ),
    (
      'web-guides',
      'Provider web services and catalogue',
      'provider-web-services-catalogue',
      'Build services, add-ons, products, packages, memberships, and clear customer-facing catalogue details.',
      $body$<p>Your provider catalogue controls what customers can book or buy. Keep names, descriptions, durations, prices, and rules clear.</p>
<h2>Catalogue checklist</h2>
<ul>
  <li>Services should have accurate durations, prices, staff eligibility, and venue or at-home availability.</li>
  <li>Add-ons should make sense with the base service and not create impossible appointment durations.</li>
  <li>Products with variants should have each variant named and priced clearly.</li>
  <li>Packages should specify included services, included products or variants, limits, and expiry.</li>
  <li>Memberships should explain billing, included benefits, redemption rules, and cancellation terms.</li>
</ul>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider web e-commerce orders and action counters',
      'provider-web-ecommerce-orders',
      'Manage provider product orders and understand why order tabs show counters for pending action.',
      $body$<p>E-commerce order tabs are action areas, so counters help providers notice pending work such as new, paid, preparing, ready, delivery, collection, refund, or issue states.</p>
<h2>Order workflow</h2>
<ul>
  <li>Open the relevant tab to review orders needing action.</li>
  <li>Check payment, customer contact details, products, variants, quantities, fulfilment method, and notes.</li>
  <li>Move orders through preparation, ready, fulfilled, cancelled, or refunded states according to provider policy.</li>
  <li>Use receipts for customer proof of payment and support references.</li>
</ul>
<p>Dashboard counters stay quieter, while order tabs surface counts where action is expected.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider web clients, messaging, notes, and CRM',
      'provider-web-clients-messaging-crm',
      'Use client profiles, notes, booking history, messaging, and lightweight CRM tools.',
      $body$<p>Client records help providers deliver personalized service without losing booking context.</p>
<h2>Client profile</h2>
<ul>
  <li>Review appointment history, preferences, notes, and contact details.</li>
  <li>Use tags or notes for operational context, not sensitive data that is not needed for service delivery.</li>
  <li>Keep messages tied to customer conversations so reminders and decisions are traceable.</li>
</ul>
<h2>Follow-up</h2>
<p>Use client history when rebooking, resolving support issues, checking package or membership eligibility, or responding to reviews.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider web staff, shifts, and permissions',
      'provider-web-staff-permissions',
      'Set up staff access, roles, booking visibility, shifts, and operational permissions.',
      $body$<p>Staff and permissions protect the business while giving team members access to the tools they need.</p>
<h2>Setup checklist</h2>
<ul>
  <li>Invite staff with the correct role and contact details.</li>
  <li>Assign services, locations, shifts, and availability where applicable.</li>
  <li>Review permissions before allowing access to finance, settings, customer data, or reports.</li>
  <li>Remove or downgrade access when someone leaves the business.</li>
</ul>
<p>Use provider-scoped account settings for provider users so staff do not accidentally land in customer account settings.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider web reports, analytics, and business decisions',
      'provider-web-reports-analytics',
      'Use reporting ranges, finance context, front desk metrics, and operational trends to make better decisions.',
      $body$<p>Provider reporting should answer a specific question before you act on it.</p>
<h2>Use the right range</h2>
<ul>
  <li>Use today for live operations and queue pressure.</li>
  <li>Use week or month for staffing, service demand, and recurring patterns.</li>
  <li>Use year or all for strategic decisions and long-term performance.</li>
</ul>
<h2>Read finance carefully</h2>
<p>Do not compare period earnings with all-time available-to-withdraw balance as if they are the same metric. Refunds, platform fees, queued payouts, and settlement timing can explain differences.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider web online booking links and direct links',
      'provider-web-online-booking-links',
      'Use public booking links, express links, and customer-facing routes reliably.',
      $body$<p>Online booking links let customers reach the right provider or service faster.</p>
<h2>Link hygiene</h2>
<ul>
  <li>Use the latest active link and avoid sharing old disabled links.</li>
  <li>Test public links in a signed-out browser when possible.</li>
  <li>Keep service, location, staff, and availability settings current so linked booking flows work.</li>
</ul>
<p>If a customer sees a missing link, check whether the provider slug, express link slug, or related service is still active and public.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider web settings, security, privacy, and data rights',
      'provider-web-settings-security',
      'Use provider-scoped account settings for login security, privacy, preferences, and data exports.',
      $body$<p>Provider account menu items should open provider-scoped settings, not customer account pages.</p>
<h2>Provider account areas</h2>
<ul>
  <li><strong>Login &amp; Security</strong> for passwords, sessions, and sign-in controls.</li>
  <li><strong>Privacy and Sharing</strong> for provider-relevant privacy settings.</li>
  <li><strong>Preferences</strong> for account-level defaults.</li>
  <li><strong>Data Rights &amp; Export</strong> for export and data requests.</li>
</ul>
<p>Business settings, provider locations, subscription, payout bank accounts, and Yoco live in provider portal navigation, not customer account settings.</p>$body$,
      'provider',
      NULL
    ),
    (
      'web-guides',
      'Provider web subscription and plan management',
      'provider-web-subscription-plan',
      'Understand provider subscriptions, plan management, billing context, and how it differs from memberships.',
      $body$<p>The provider subscription is the business plan for using Beautonomi. It is separate from memberships the provider sells to customers.</p>
<h2>Subscription vs memberships</h2>
<ul>
  <li><strong>Subscription</strong> controls the provider business plan, access, limits, or platform billing.</li>
  <li><strong>Memberships</strong> are customer-facing offers sold by the provider.</li>
</ul>
<h2>Where to manage it</h2>
<p>Use <strong>Subscription</strong> in the provider web sidebar, or <strong>More → Subscription &amp; plan</strong> in the provider app when available.</p>$body$,
      'provider',
      NULL
    ),
    (
      'mobile-app-guides',
      'Provider app calendar and bookings',
      'provider-mobile-calendar-bookings',
      'Run day-to-day provider booking work from the mobile app.',
      $body$<p>The provider app is best for active daily work: checking the schedule, opening bookings, and handling customer-facing status changes.</p>
<h2>Daily workflow</h2>
<ul>
  <li>Start from Dashboard or Calendar to see today.</li>
  <li>Open bookings to review service, customer, staff, location, payment, and status.</li>
  <li>Use clear status changes so finance, customer notifications, and reporting stay aligned.</li>
</ul>
<p>Use web for heavier setup, bulk edits, deep reporting, or large catalogue changes.</p>$body$,
      'provider',
      NULL
    ),
    (
      'mobile-app-guides',
      'Provider app group bookings and time blocks',
      'provider-mobile-group-bookings-time-blocks',
      'Create group sessions and manage blocked time from the provider app where available.',
      $body$<p>Mobile group bookings and time blocks help providers manage availability while away from a desktop.</p>
<h2>Group bookings</h2>
<p>Use the guided create card or empty-state action to start a group session. Review capacity, timing, staff, and participants before relying on the session operationally.</p>
<h2>Time blocks</h2>
<p>Choose a clear block type, or create one when needed. Use duration shortcuts to avoid start/end mistakes for breaks, leave, training, maintenance, travel, or private work.</p>$body$,
      'provider',
      NULL
    ),
    (
      'mobile-app-guides',
      'Provider app locations and business settings',
      'provider-mobile-locations-settings',
      'Manage provider locations, South African address accuracy, and key business settings from mobile.',
      $body$<p>Provider mobile settings are useful for quick corrections, especially locations, business details, and operational preferences.</p>
<h2>Locations</h2>
<ul>
  <li>Use address suggestions where possible so fields and coordinates populate together.</li>
  <li>Follow South African address order: street number, street name, suburb, city, province, postal code.</li>
  <li>Use high-accuracy map pins only when the pin can be placed exactly.</li>
</ul>
<p>For large configuration changes, use provider web where more fields are visible at once.</p>$body$,
      'provider',
      NULL
    ),
    (
      'mobile-app-guides',
      'Provider app clients, messages, and support',
      'provider-mobile-clients-messaging-support',
      'Use mobile client context, conversations, support tickets, and help content.',
      $body$<p>The provider app keeps client context close to the schedule so providers can respond quickly.</p>
<h2>Client and message flow</h2>
<ul>
  <li>Open client details for booking history and relevant notes.</li>
  <li>Use messaging for appointment questions and follow-up.</li>
  <li>Use support tickets for platform, payment, payout, or technical issues.</li>
</ul>
<p>Keep sensitive or unnecessary personal information out of notes and messages.</p>$body$,
      'provider',
      NULL
    ),
    (
      'mobile-app-guides',
      'Provider app setup status and launch checklist',
      'provider-mobile-setup-status-launch',
      'Complete provider setup from mobile and know when to switch to web.',
      $body$<p>Setup status helps providers understand what must be completed before they can reliably take bookings and payments.</p>
<h2>Launch checklist</h2>
<ul>
  <li>Complete verification and business profile details.</li>
  <li>Add services, locations, availability, staff, and booking rules.</li>
  <li>Set payment, Yoco, payout bank account, subscription, and notification preferences.</li>
  <li>Test customer-facing booking links before sharing them publicly.</li>
</ul>
<p>If a setup step opens the web portal, finish it there and return to the app once complete.</p>$body$,
      'provider',
      NULL
    )
)
INSERT INTO public.learning_articles (
  category_id,
  title,
  slug,
  summary,
  body,
  content_format,
  status,
  audience,
  is_internal,
  published_at,
  featured_order,
  image_url
)
SELECT
  c.id,
  s.title,
  s.slug,
  s.summary,
  s.body,
  'html',
  'published',
  s.audience,
  false,
  NOW(),
  s.featured_order::integer,
  '/images/learn/feature-browser-placeholder.svg'
FROM extra_article_seed s
JOIN public.learning_categories c ON c.slug = s.cat_slug AND c.tenant_id IS NULL
ON CONFLICT (slug) WHERE tenant_id IS NULL DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  content_format = EXCLUDED.content_format,
  status = EXCLUDED.status,
  audience = EXCLUDED.audience,
  is_internal = EXCLUDED.is_internal,
  published_at = COALESCE(public.learning_articles.published_at, EXCLUDED.published_at),
  featured_order = EXCLUDED.featured_order,
  image_url = EXCLUDED.image_url,
  updated_at = NOW();

INSERT INTO public.learning_article_stats (article_id, view_count, helpful_yes_count, helpful_no_count)
SELECT a.id, 0, 0, 0
FROM public.learning_articles a
WHERE a.slug IN (
  'customer-web-booking',
  'customer-web-payments-receipts',
  'customer-web-shop-orders',
  'customer-web-account-support',
  'customer-mobile-app',
  'customer-mobile-booking-payments',
  'customer-mobile-notifications-support',
  'provider-web-portal',
  'provider-web-calendar-bookings',
  'provider-web-group-bookings-time-blocks',
  'provider-web-front-desk',
  'provider-web-finance-payouts',
  'provider-web-payout-bank-accounts',
  'provider-web-yoco-payments',
  'provider-web-packages-memberships',
  'provider-web-locations-receipts',
  'provider-mobile-app',
  'provider-mobile-more-navigation',
  'provider-mobile-finance-yoco-payouts',
  'provider-mobile-packages-memberships'
)
  AND a.tenant_id IS NULL
ON CONFLICT (article_id) DO NOTHING;

INSERT INTO public.learning_article_stats (article_id, view_count, helpful_yes_count, helpful_no_count)
SELECT a.id, 0, 0, 0
FROM public.learning_articles a
WHERE a.tenant_id IS NULL
  AND (
    a.slug LIKE 'customer-web-%'
    OR a.slug LIKE 'customer-mobile-%'
    OR a.slug LIKE 'provider-web-%'
    OR a.slug LIKE 'provider-mobile-%'
  )
ON CONFLICT (article_id) DO NOTHING;

INSERT INTO public.learning_homepage_sections (section_key, payload, display_order)
VALUES
  (
    'hero',
    '{"title":"Learning Center","subtitle":"Contextual guides for customers and providers on web and mobile app."}'::jsonb,
    0
  ),
  (
    'cta_cards',
    '{"cards":[{"title":"Customer guides","description":"Book services, manage appointments, pay, shop, and get support.","icon":"User","link":"/learn/customer"},{"title":"Provider guides","description":"Run bookings, finance, Yoco, packages, memberships, and business settings.","icon":"Building2","link":"/learn/provider"},{"title":"Mobile app guides","description":"Use Beautonomi from the customer or provider app with current navigation.","icon":"Smartphone","link":"/learn/article/customer-mobile-app"}]}'::jsonb,
    1
  ),
  (
    'platform_guides',
    $json${
      "tabs": [
        {
          "id": "web",
          "label": "Web",
          "description": "Guides for Beautonomi in a browser, split by customer and provider workflows.",
          "groups": [
            {
              "title": "Customer web",
              "audience": "customer",
              "cards": [
                {
                  "title": "Book on the web",
                  "description": "Search providers, choose services, pay, and manage appointments.",
                  "href": "/learn/article/customer-web-booking"
                },
                {
                  "title": "Payments and receipts",
                  "description": "Understand checkout, receipts, invoices, and payment support.",
                  "href": "/learn/article/customer-web-payments-receipts"
                },
                {
                  "title": "Shop and product orders",
                  "description": "Buy products, packages, and variants from provider shops.",
                  "href": "/learn/article/customer-web-shop-orders"
                },
                {
                  "title": "Account and support",
                  "description": "Manage addresses, profile details, privacy, and tickets.",
                  "href": "/learn/article/customer-web-account-support"
                },
                {
                  "title": "Manage bookings",
                  "description": "Reschedule, cancel, pay balances, and review booking status.",
                  "href": "/learn/article/customer-web-manage-bookings"
                },
                {
                  "title": "Wallet and loyalty",
                  "description": "Use wallet credits, gift cards, coupons, and rewards.",
                  "href": "/learn/article/customer-web-wallet-loyalty"
                },
                {
                  "title": "At-home addresses",
                  "description": "Save accurate South African addresses and map pins.",
                  "href": "/learn/article/customer-web-addresses-at-home"
                }
              ]
            },
            {
              "title": "Provider web",
              "audience": "provider",
              "cards": [
                {
                  "title": "Provider web portal",
                  "description": "Map the current sidebar and key business areas.",
                  "href": "/learn/article/provider-web-portal"
                },
                {
                  "title": "Finance, payouts, and bank accounts",
                  "description": "Understand metrics, balances, payout requests, and bank setup.",
                  "href": "/learn/article/provider-web-finance-payouts"
                },
                {
                  "title": "Yoco payments",
                  "description": "Set up Yoco, take terminal payments, and track accounting.",
                  "href": "/learn/article/provider-web-yoco-payments"
                },
                {
                  "title": "Packages and memberships",
                  "description": "Manage packages, product variants, memberships, and subscriptions.",
                  "href": "/learn/article/provider-web-packages-memberships"
                },
                {
                  "title": "Scheduling operations",
                  "description": "Use bookings, calendar, group bookings, front desk, and time blocks.",
                  "href": "/learn/article/provider-web-calendar-bookings"
                },
                {
                  "title": "E-commerce orders",
                  "description": "Use order tabs and counters to action product orders.",
                  "href": "/learn/article/provider-web-ecommerce-orders"
                },
                {
                  "title": "Services and catalogue",
                  "description": "Build services, add-ons, products, packages, and memberships.",
                  "href": "/learn/article/provider-web-services-catalogue"
                },
                {
                  "title": "Staff and reports",
                  "description": "Manage staff access, shifts, permissions, reports, and trends.",
                  "href": "/learn/article/provider-web-staff-permissions"
                },
                {
                  "title": "Settings and security",
                  "description": "Use provider-scoped account, privacy, and data settings.",
                  "href": "/learn/article/provider-web-settings-security"
                }
              ]
            }
          ]
        },
        {
          "id": "mobile",
          "label": "Mobile app",
          "description": "Guides for iOS and Android app workflows, split by customer and provider experience.",
          "groups": [
            {
              "title": "Customer app",
              "audience": "customer",
              "cards": [
                {
                  "title": "Customer app guide",
                  "description": "Learn app tabs, bookings, payments, receipts, and help.",
                  "href": "/learn/article/customer-mobile-app"
                },
                {
                  "title": "Booking and payment flow",
                  "description": "Book, pay, and refresh booking status after secure checkout.",
                  "href": "/learn/article/customer-mobile-booking-payments"
                },
                {
                  "title": "Support and notifications",
                  "description": "Use mobile support, account settings, addresses, and alerts.",
                  "href": "/learn/article/customer-mobile-notifications-support"
                },
                {
                  "title": "Shop and orders",
                  "description": "Buy products, packages, and variants from the app.",
                  "href": "/learn/article/customer-mobile-shop-orders"
                },
                {
                  "title": "Wallet and loyalty",
                  "description": "Use wallet credits, coupons, gift cards, and saved payments.",
                  "href": "/learn/article/customer-mobile-wallet-loyalty"
                },
                {
                  "title": "At-home addresses",
                  "description": "Save accurate addresses and choose service locations.",
                  "href": "/learn/article/customer-mobile-addresses-at-home"
                }
              ]
            },
            {
              "title": "Provider app",
              "audience": "provider",
              "cards": [
                {
                  "title": "Provider app guide",
                  "description": "Use app navigation, bookings, More, finance, Yoco, and support.",
                  "href": "/learn/article/provider-mobile-app"
                },
                {
                  "title": "More navigation",
                  "description": "Find Yoco, finance, subscriptions, bank accounts, memberships, and packages.",
                  "href": "/learn/article/provider-mobile-more-navigation"
                },
                {
                  "title": "Finance, Yoco, and payouts",
                  "description": "Review earnings ranges, payout balance, bank accounts, and Yoco workflows.",
                  "href": "/learn/article/provider-mobile-finance-yoco-payouts"
                },
                {
                  "title": "Packages and memberships",
                  "description": "Manage package variants and membership offers in the app.",
                  "href": "/learn/article/provider-mobile-packages-memberships"
                },
                {
                  "title": "Calendar and bookings",
                  "description": "Run day-to-day bookings and schedule checks from mobile.",
                  "href": "/learn/article/provider-mobile-calendar-bookings"
                },
                {
                  "title": "Group bookings and time blocks",
                  "description": "Create group sessions and protect unavailable time.",
                  "href": "/learn/article/provider-mobile-group-bookings-time-blocks"
                },
                {
                  "title": "Locations and settings",
                  "description": "Keep business details, addresses, and coordinates accurate.",
                  "href": "/learn/article/provider-mobile-locations-settings"
                },
                {
                  "title": "Setup checklist",
                  "description": "Complete setup status before launching publicly.",
                  "href": "/learn/article/provider-mobile-setup-status-launch"
                }
              ]
            }
          ]
        }
      ]
    }$json$::jsonb,
    2
  ),
  ('video_library', '{"title":"Video Library","videos":[]}'::jsonb, 4),
  ('platform_updates', '{"title":"Platform Updates","article_ids":[]}'::jsonb, 5)
ON CONFLICT (section_key) WHERE tenant_id IS NULL DO UPDATE
SET
  payload = EXCLUDED.payload,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

DO $$
DECLARE
  ids UUID[];
  slug_list TEXT[] := ARRAY[
    'customer-web-booking',
    'customer-mobile-app',
    'provider-web-portal',
    'provider-mobile-app',
    'customer-web-manage-bookings',
    'customer-web-wallet-loyalty',
    'provider-web-finance-payouts',
    'provider-web-yoco-payments',
    'provider-web-ecommerce-orders',
    'provider-web-packages-memberships',
    'provider-web-group-bookings-time-blocks',
    'provider-mobile-more-navigation',
    'provider-mobile-setup-status-launch'
  ];
BEGIN
  SELECT array_agg(a.id ORDER BY array_position(slug_list, a.slug))
  INTO ids
  FROM public.learning_articles a
  WHERE a.slug = ANY(slug_list)
    AND a.tenant_id IS NULL
    AND a.status = 'published'
    AND a.is_internal = false;

  IF ids IS NOT NULL AND array_length(ids, 1) > 0 THEN
    INSERT INTO public.learning_homepage_sections (section_key, payload, display_order)
    VALUES ('featured_articles', jsonb_build_object('article_ids', to_jsonb(ids)), 3)
    ON CONFLICT (section_key) WHERE tenant_id IS NULL DO UPDATE
    SET
      payload = EXCLUDED.payload,
      display_order = EXCLUDED.display_order,
      updated_at = NOW();
  END IF;
END $$;
