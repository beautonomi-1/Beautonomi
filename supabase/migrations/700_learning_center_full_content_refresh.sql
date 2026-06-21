-- 700_learning_center_full_content_refresh.sql
-- Restructure conceptual/overview Learning Center articles with scannable sections,
-- platform-accurate copy, and embedded mockups. Idempotent full-body SET by slug.
-- Does not touch platform-specific guides (699) or internal-ops articles.

-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER — Booking & Checkout
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET summary = 'Discover providers on Home or Search, book a service, and complete Paystack checkout on web or mobile.', body = $body$<p>Beautonomi connects you with verified beauty and wellness providers. Book from the <strong>Home</strong> or <strong>Search</strong> tab in the customer app, or on the web at <strong>/book/[provider]</strong> which continues into the canonical <strong>/booking</strong> checkout flow.</p>
<h2>How booking works</h2>
<div data-learn-mockup="customer-web-booking" data-caption="Choose a service — checkout continues via Paystack"></div>
<ol>
  <li>Find a provider or service from Home, Search, or a direct booking link.</li>
  <li>Select service, venue (salon or house call), staff if shown, date, and time.</li>
  <li>Add add-ons or package options where offered.</li>
  <li>Confirm details and pay online via Paystack, or use wallet, gift card, or pay-at-venue when enabled.</li>
</ol>
<h2>After you book</h2>
<p>Your appointment appears under the <strong>Bookings</strong> tab. Open booking detail to reschedule, cancel, pay balances, message the provider, or leave a review.</p>
<h2>Good to know</h2>
<ul>
  <li>House call bookings need an accurate saved address and map pin for travel fees and routing.</li>
  <li>On-demand lets you request a provider without choosing one — see the on-demand guide.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'booking-checkout-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Step-by-step: choose a provider, service, time, and complete Paystack checkout.', body = $body$<p>Booking a service takes a few minutes in the app or browser. Use the same account on mobile and web — your bookings stay in sync.</p>
<h2>Step-by-step</h2>
<div data-learn-mockup="customer-web-booking" data-caption="Service selection and secure checkout"></div>
<ol>
  <li>Open <strong>Home</strong> or <strong>Search</strong> and tap a provider.</li>
  <li>Tap <strong>Book</strong>, choose your service, venue, and optional staff.</li>
  <li>Pick an available slot, add add-ons, and proceed to checkout.</li>
  <li>Pay with Paystack (card or regional methods), wallet, gift card, or pay-at-venue if offered.</li>
</ol>
<h2>Manage your booking</h2>
<p>Find the appointment under <strong>Bookings</strong>. From booking detail you can reschedule, cancel within policy, pay additional charges, or message your provider.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'how-to-book-service' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Request a provider without choosing one; accept an offer and pay when matched.', body = $body$<p>On-demand booking lets you request a service type, date, time, and location without picking a specific provider first. Matching providers in your area are notified; when one accepts, you review the offer and complete payment.</p>
<h2>Request flow</h2>
<div data-learn-mockup="customer-mobile-on-demand" data-caption="Finding a provider — accept offer and pay via Paystack"></div>
<ol>
  <li>Start an on-demand request from the booking entry point in the app or web.</li>
  <li>Enter service, when, and where (salon or house call with address).</li>
  <li>Wait while providers are matched — you will see a waiting screen.</li>
  <li>When an offer arrives, accept and pay via Paystack to confirm the booking.</li>
</ol>
<h2>If no one accepts</h2>
<p>Try different times or locations, or search for a provider manually and book directly. Expired requests can be submitted again.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'on-demand-booking' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Add extras at checkout or pay additional charges added during your visit.', body = $body$<p>Add-ons are optional extras you select before checkout. Additional charges may be added by your provider during the visit (extra services or retail products).</p>
<h2>At checkout</h2>
<p>Select add-ons when booking if the provider offers them. The total updates before you pay via Paystack.</p>
<h2>During or after your visit</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Pay additional charges from booking detail"></div>
<p>If the provider adds charges after your main payment, open the booking from <strong>Bookings</strong> and tap <strong>Pay</strong>. Paystack opens for online payment. If you pay in person at the salon, the provider marks it paid — no online step needed.</p>
<h2>Receipts</h2>
<p>All line items appear on your booking receipt in account documents.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'add-ons-additional-charges' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER — Payments
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET summary = 'Paystack checkout, saved cards, when you are charged, and where to find receipts.', body = $body$<p>Beautonomi uses <strong>Paystack</strong> for secure online card and bank payments. Wallet balance, gift cards, and pay-at-venue may also be available at checkout depending on the provider.</p>
<h2>Pay online</h2>
<div data-learn-mockup="customer-web-account" data-caption="Receipts, payment history, and saved methods in your account"></div>
<p>At checkout you are redirected to Paystack to complete payment. Receipts and invoices are stored with each booking or order in your account hub.</p>
<h2>Saved payment methods</h2>
<p>Save a card after a successful Paystack payment. We store a secure token — not your full card number. Manage cards under <strong>Profile</strong> → payment methods.</p>
<h2>When you are charged</h2>
<p>You are charged when checkout completes, unless the provider uses a hold or pay-later flow. Failed payments can be retried from booking detail.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'payments-customer-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Card, bank, and regional Paystack methods available at checkout.', body = $body$<p>Payment methods depend on your country and Paystack configuration. At checkout you will see the options Paystack presents (card, bank transfer, USSD, etc.).</p>
<h2>At checkout</h2>
<div data-learn-mockup="customer-web-account" data-caption="Payment methods and receipts in account"></div>
<ul>
  <li>Pay with a new card or bank method each time, or use a saved card.</li>
  <li>Wallet and gift card balance may reduce the amount due when enabled.</li>
  <li>Pay-at-venue or cash may be offered by some providers instead of online pay.</li>
</ul>
<h2>Need another method?</h2>
<p>Try a different card or contact support if your preferred method is not listed for your region.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'payment-methods-accepted' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Manage saved cards and set your default payment method.', body = $body$<p>Saved cards are Paystack tokens linked to your account — not full card numbers stored on Beautonomi.</p>
<h2>Manage cards</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Profile — payment methods and account settings"></div>
<ol>
  <li>Open <strong>Profile</strong> → <strong>Payment methods</strong> (app or web account).</li>
  <li>Add a card by completing a checkout and choosing to save it.</li>
  <li>Set a default card for faster checkout; remove expired cards.</li>
</ol>
<h2>Default card</h2>
<p>Only one default at a time. The default is used when you choose quick pay at checkout.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'edit-payment-method' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'When your card is charged and what happens if payment fails.', body = $body$<p>Most bookings charge when you complete checkout. Some providers allow pay-later or deposit flows — the booking detail shows what is owed and when.</p>
<h2>Charge timing</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Pay balances from booking detail"></div>
<ul>
  <li><strong>At checkout:</strong> full or deposit amount via Paystack.</li>
  <li><strong>Additional charges:</strong> pay from booking detail after the visit.</li>
  <li><strong>Failed payment:</strong> retry with another method or update your card in Profile.</li>
</ul>
<h2>Receipts</h2>
<p>Each successful Paystack charge generates a receipt linked to the booking or order.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'when-you-pay-booking' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'How Paystack saves your card securely; verification charge explained.', body = $body$<p>When you opt in to save a card, Paystack stores a token after a successful payment. Beautonomi never stores your full card number or CVV.</p>
<h2>Save card flow</h2>
<div data-learn-mockup="customer-mobile-wallet" data-caption="Wallet, saved cards, and offers"></div>
<ul>
  <li>Complete a Paystack payment and choose to save the card.</li>
  <li>Paystack may place a small temporary verification charge (e.g. R1) then reverse it.</li>
  <li>Use the saved card on future bookings from checkout or Profile.</li>
</ul>
<h2>Remove or change</h2>
<p>Manage saved cards anytime under Profile → Payment methods.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'save-card-paystack' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER — Wallet, loyalty, messaging, reviews
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET summary = 'Wallet credits, gift cards, promo codes, and how to apply them at checkout.', body = $body$<p>Your wallet holds credits from refunds or promotions. Gift cards and promo codes reduce what you pay at checkout when valid.</p>
<h2>Wallet &amp; offers</h2>
<div data-learn-mockup="customer-mobile-wallet" data-caption="Wallet balance, coupons, gift cards, and loyalty"></div>
<ul>
  <li><strong>Wallet:</strong> applied automatically or selected at checkout.</li>
  <li><strong>Gift cards:</strong> purchase from a provider profile; redeem when booking with them.</li>
  <li><strong>Coupons:</strong> enter a promo code at checkout for a discount.</li>
</ul>
<h2>History</h2>
<p>View wallet transactions and active offers in Profile or account settings.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'wallet-gift-cards-coupons-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Earn and redeem loyalty points with participating providers.', body = $body$<p>Providers may run loyalty programs — earn points on bookings and redeem for discounts or perks.</p>
<h2>Your points</h2>
<div data-learn-mockup="customer-mobile-wallet" data-caption="Loyalty points and redemption value"></div>
<p>Points and redemption rules are set by each provider. Check Profile or the provider profile for program details. Platform-wide promotions may also appear in notifications.</p>
<h2>Redeem at checkout</h2>
<p>When eligible, loyalty value may apply automatically or via a coupon code at Paystack checkout.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'loyalty-rewards-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Leave honest reviews after completed bookings; read ratings before you book.', body = $body$<p>Reviews help the community and help providers improve. Leave a review from booking detail after a completed appointment.</p>
<h2>Leave a review</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Leave a review from booking detail"></div>
<ol>
  <li>Open the completed booking under <strong>Bookings</strong>.</li>
  <li>Tap to rate and write your review.</li>
  <li>Reviews follow community guidelines — be respectful and factual.</li>
</ol>
<h2>Before you book</h2>
<p>Provider profiles show average rating and recent reviews so you can choose with confidence.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'reviews-ratings-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Message providers from Chats or booking detail before and after appointments.', body = $body$<p>Use in-app messaging to confirm details, ask questions, or receive custom offers. Conversations stay in one thread per provider.</p>
<h2>Where to message</h2>
<div data-learn-mockup="customer-mobile-chats" data-caption="Chats tab — messages with providers"></div>
<ul>
  <li><strong>Chats</strong> tab in the customer app for all conversations.</li>
  <li>Start from a provider profile or from booking detail on web or app.</li>
  <li>Enable notifications in Profile so you do not miss replies.</li>
</ul>
<h2>Best practice</h2>
<p>Keep booking-related agreements in the thread for a clear record.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'messaging-providers-overview' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER — Managing bookings, at-home, support
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET summary = 'Reschedule, cancel, pay, verify arrival, and review from the Bookings tab.', body = $body$<p>All upcoming and past appointments live under the <strong>Bookings</strong> tab. Tap any booking for actions and receipts.</p>
<h2>Booking detail actions</h2>
<div data-learn-mockup="customer-mobile-bookings" data-caption="Bookings list — tap to reschedule, pay, or review"></div>
<ul>
  <li><strong>Reschedule</strong> — pick a new slot where policy allows.</li>
  <li><strong>Cancel</strong> — subject to provider cancellation policy and refund rules.</li>
  <li><strong>Pay</strong> — outstanding balances via Paystack from booking detail.</li>
  <li><strong>Review</strong> — after completed visits.</li>
</ul>
<h2>Verify arrival</h2>
<p>Some providers ask you to verify when you arrive — use the button or OTP on booking detail if shown.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'managing-bookings-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Cancel from booking detail; refunds follow provider policy and Paystack timing.', body = $body$<p>Open the booking from <strong>Bookings</strong> and choose Cancel. Refund eligibility depends on how early you cancel and the provider policy.</p>
<h2>Cancel flow</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Cancel or reschedule from booking detail"></div>
<ol>
  <li>Open booking detail and tap Cancel.</li>
  <li>Confirm — any refund due returns via Paystack to your card or wallet.</li>
  <li>Rebook later from Home or Search if you still need the service.</li>
</ol>
<h2>Need help?</h2>
<p>Contact support from Profile if cancel fails or you believe a refund is overdue.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'canceling-your-booking' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Request a new date or time from booking detail.', body = $body$<p>Reschedule when your plans change — open the booking and choose a new available slot.</p>
<h2>Reschedule steps</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Reschedule from booking detail"></div>
<ol>
  <li>Open the booking under <strong>Bookings</strong>.</li>
  <li>Tap Reschedule and select a new date and time.</li>
  <li>Confirm — you receive updated confirmation when accepted.</li>
</ol>
<h2>No slots?</h2>
<p>Try another date or message the provider via Chats to ask about availability.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'reschedule-booking' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Full refund and rebook options when your provider cancels.', body = $body$<p>If a provider cancels, you are notified and refunded in full to your original payment method or wallet. No action is required to receive the refund.</p>
<h2>What to do next</h2>
<div data-learn-mockup="customer-mobile-bookings" data-caption="Rebook from Bookings or find a new provider"></div>
<ul>
  <li>Rebook with the same provider for a new time, or choose another provider from Home or Search.</li>
  <li>Contact support if the refund does not appear within expected Paystack processing time.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'if-provider-cancels' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Confirm arrival on booking detail when your provider uses verification.', body = $body$<p>Arrival verification helps providers manage their schedule and reduce no-shows. When required, you will see a verify option on booking detail.</p>
<h2>Verify on arrival</h2>
<div data-learn-mockup="customer-mobile-bookings" data-caption="Verify arrival from booking detail"></div>
<ol>
  <li>Open the booking when you arrive.</li>
  <li>Enter the OTP or tap Verify arrival if shown.</li>
  <li>If you have trouble, tell your provider in person or via Chats.</li>
</ol>
<p>Verification is optional for some providers — your appointment can still proceed without it.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'verify-arrival' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'House call bookings, travel fees, addresses, and safety expectations.', body = $body$<p>Many providers offer <strong>house call</strong> services — they travel to your location. Choose house call at booking and confirm your saved address with an accurate map pin.</p>
<h2>Address &amp; fees</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Saved addresses and map pins in Profile"></div>
<ul>
  <li>Add or edit addresses under <strong>Profile</strong> → Saved addresses.</li>
  <li>Travel fees may apply based on distance — shown at booking or checkout.</li>
  <li>Use South African address format and verify the pin on the map.</li>
</ul>
<h2>Safety</h2>
<p>Book through Beautonomi so payment, messaging, and booking records stay on platform. Contact support for concerns.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'at-home-services-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Open support tickets from Help; disputes reviewed against platform policies.', body = $body$<p>Need help? Use the Help Centre to submit a ticket with booking or payment context. View replies under My tickets in Profile or Help.</p>
<h2>Get support</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Support tickets from Profile"></div>
<ol>
  <li>Go to Help or Profile → Support tickets.</li>
  <li>Describe your issue (booking ID, payment, account).</li>
  <li>Track status and reply in the thread.</li>
</ol>
<h2>Disputes &amp; refunds</h2>
<p>Disputes are reviewed against cancellation and refund policies. Approved refunds return via Paystack or wallet.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'support-tickets-disputes-overview' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROVIDER — Onboarding, catalogue, calendar, clients
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET summary = 'Verify your business, complete setup from More, and launch on Beautonomi.', body = $body$<p>Provider onboarding combines identity verification with a setup checklist. Complete steps in the provider app under <strong>More</strong> or on the web portal for advanced configuration.</p>
<h2>Setup checklist</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="More — setup checklist, finance, and subscription"></div>
<ul>
  <li>Business profile, services, availability, and locations.</li>
  <li>Payout bank accounts before requesting withdrawals.</li>
  <li>Yoco devices if you take in-person card payments.</li>
</ul>
<h2>Go live</h2>
<p>When required items are complete, your profile can accept bookings from Home, Search, and your booking links.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'provider-onboarding-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Identity and business verification — what we ask for and how to submit.', body = $body$<p>Verification keeps customers safe and the marketplace trusted. You may submit ID and business details in-app or via a secure link.</p>
<h2>Complete verification</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="Verification and setup from More"></div>
<ol>
  <li>Follow prompts in onboarding or More → setup.</li>
  <li>Upload clear documents; do not share them with customers.</li>
  <li>Wait for review — support will contact you if more info is needed.</li>
</ol>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'verification-steps' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Launch checklist: services, hours, locations, payouts, and when to use web.', body = $body$<p>The setup checklist shows what remains before you are fully live. Most steps work in the app; bulk catalogue and reporting are faster on web.</p>
<h2>Checklist</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="Launch checklist progress in More"></div>
<ul>
  <li>Services, pricing, and categories.</li>
  <li>Calendar availability, time blocks, and days off.</li>
  <li>Locations with SA address format and map pins.</li>
  <li>Verified payout bank account.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'setup-status-checklist' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Build your service catalogue, add-ons, and pricing on web or mobile.', body = $body$<p>Your catalogue is what customers book. Organise services by category with duration and price; attach add-ons for checkout extras.</p>
<h2>Catalogue</h2>
<div data-learn-mockup="provider-web-catalogue" data-caption="Services, products, packages, and memberships"></div>
<ul>
  <li>Add services with accurate duration and ZAR pricing.</li>
  <li>Link services to locations and staff.</li>
  <li>Packages and memberships for multi-session offers — edit variants on web when needed.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'services-catalogue-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Sell products, track stock, and fulfil orders from the provider portal.', body = $body$<p>Retail and professional products can be sold online (shop/cart) or added as booking line items. Orders appear in the provider portal with action tabs.</p>
<h2>Products &amp; orders</h2>
<div data-learn-mockup="provider-web-catalogue" data-caption="Products in catalogue; orders in Sales"></div>
<p>Manage SKUs, variants, and stock in Catalogue → Products. Fulfil customer orders from Sales/Orders with status counters for pending work.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'inventory-products-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Availability, calendar, time blocks, recurring and group bookings on web.', body = $body$<p>Your calendar controls when customers can book. Set hours per location and staff; use time blocks for breaks and days off for leave.</p>
<h2>Calendar</h2>
<div data-learn-mockup="provider-web-calendar" data-caption="Week calendar with appointments"></div>
<ul>
  <li><strong>Bookings</strong> tab (mobile) or Calendar (web) for day-to-day schedule.</li>
  <li>Time blocks protect unavailable time.</li>
  <li>Group bookings and recurring appointments where your plan includes them.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'calendar-scheduling-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Client list, notes, tags, and booking history in CRM.', body = $body$<p>The <strong>Clients</strong> tab lists everyone who booked or messaged you. Open a profile for history, notes, and tags.</p>
<h2>Client profiles</h2>
<div data-learn-mockup="provider-web-clients" data-caption="Client list and CRM profiles"></div>
<ul>
  <li>Search, filter, and favourite key clients.</li>
  <li>Add notes for preferences and follow-ups.</li>
  <li>Start a message or new booking from the profile.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'clients-crm-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Waitlist and front-desk waiting room for arrivals and queue.', body = $body$<p>Waitlist captures demand when you are full; waiting room shows who has arrived for front-desk flow.</p>
<h2>Operations</h2>
<div data-learn-mockup="provider-web-clients" data-caption="Front desk and client queue metrics"></div>
<ul>
  <li>Offer waitlist slots when cancellations open capacity.</li>
  <li>Check clients in from waiting room / front desk views on web.</li>
  <li>Use metric filters (today, week, month) before staffing decisions.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'waitlist-waiting-room-overview' AND tenant_id IS NULL;

-- PROVIDER — Payments, Yoco, payouts

UPDATE public.learning_articles SET summary = 'Paystack payment links, deposits, tips, refunds, and in-person Yoco.', body = $body$<p>Customers pay online via Paystack when booking or when you send a payment link. In-person card uses Yoco; cash or mark-as-paid is recorded but not added to payout balance.</p>
<h2>Online payments</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Finance — earnings and payout balance"></div>
<p>Payment links from booking detail open Paystack for the customer. Refunds process from finance or booking tools when eligible.</p>
<h2>In person</h2>
<p>Yoco for card at the salon; walk-in sales recorded separately from platform-held funds.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'payments-checkout-provider-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Period earnings vs all-time withdrawable balance; request payouts.', body = $body$<p>Finance separates <strong>period earnings</strong> from <strong>available to withdraw</strong> (all-time settled balance not already queued).</p>
<h2>Understand the numbers</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Metric meanings and payout request"></div>
<ul>
  <li>Online Paystack revenue counts toward payout balance after fees and refunds.</li>
  <li>Yoco and cash at venue appear in reports but not in withdrawable balance.</li>
  <li>Request payout to a verified bank account from Finance or More.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'payouts-earnings-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'What counts toward Paystack payout balance vs walk-in revenue.', body = $body$<p>Only funds the platform processed online (Paystack) increase withdrawable balance. In-person Yoco and mark-as-paid stay with you and show in revenue reports only.</p>
<h2>Earnings breakdown</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Period earnings vs available to withdraw"></div>
<p>Compare period filters (today, week, month) for operational trends against all-time available balance before requesting a payout.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'understanding-earnings' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Request a payout to your verified bank account from Finance or More.', body = $body$<p>When your available balance is ready, request a payout from Finance (web) or More → Finance (app). Select amount and verified bank account.</p>
<h2>Request payout</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Request payout and bank accounts"></div>
<ol>
  <li>Add and verify a payout bank account if needed.</li>
  <li>Enter amount (up to available balance) and submit.</li>
  <li>Track in-queue status until processed via Paystack transfers.</li>
</ol>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'request-payout' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Why in-person add-ons do not increase platform payout balance.', body = $body$<p>When a customer pays an additional charge in person (Yoco or cash), you mark it paid — the money never passed through Beautonomi, so it does not add to withdrawable balance.</p>
<h2>Online vs in person</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Finance — online vs walk-in reporting"></div>
<ul>
  <li><strong>Customer pays via Paystack</strong> from booking detail → counts toward payout balance.</li>
  <li><strong>Mark as paid in person</strong> → recorded on booking and reports only.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'walk-in-addons-payout' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Yoco terminal overview for in-person card at your venue.', body = $body$<p>Yoco integrates for walk-in and at-counter card payments. Link devices under Settings; transactions sync to sales history.</p>
<h2>Yoco on Beautonomi</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Yoco integration in Settings"></div>
<p>More → Yoco payments (app) or Settings → Yoco (web). Use for booking payments and product sales at the salon — separate from Paystack online checkout.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'yoco-terminal-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Pair and configure your Yoco device with Beautonomi.', body = $body$<p>Follow in-app steps to connect your Yoco reader. Keep the device charged and on the same account linked to Beautonomi.</p>
<h2>Setup</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Yoco device setup"></div>
<ol>
  <li>Open Settings → Yoco integration.</li>
  <li>Pair the device per Yoco instructions.</li>
  <li>Test a small walk-in or booking payment.</li>
</ol>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'yoco-setup' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Process in-person card payment with Yoco from a booking or walk-in sale.', body = $body$<p>Start payment from booking detail or walk-in POS, complete on the Yoco terminal, and confirm it records in Beautonomi.</p>
<h2>Walk-in payment</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Yoco and sales from More → Finance"></div>
<p>Amount stays with you — not added to Paystack payout balance — but appears in revenue reports for accurate books.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'yoco-walk-in-payment' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Locations, service zones, travel fees, and SA address accuracy.', body = $body$<p>Add salon/studio addresses and house call zones. Map pins and travel fee rules ensure customers see correct pricing.</p>
<h2>Locations</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Locations and addresses in Settings"></div>
<ul>
  <li>Use South African address format; verify map pin.</li>
  <li>Service zones (Mapbox) for house call radius and travel fees.</li>
  <li>Assign services and staff per location.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'locations-service-areas-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Share booking links and embed options for direct customer booking.', body = $body$<p>Your public booking link lets customers book without searching the marketplace. Customise and share on social, email, or your website.</p>
<h2>Booking links</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Online booking links in Settings"></div>
<p>Express links for quick counter bookings; canonical <strong>/booking</strong> flow for full service selection and Paystack checkout.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'online-booking-links-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Calendar sync, Mapbox zones, OneSignal push, and notification integrations.', body = $body$<p>Connect tools you already use: external calendars, maps for zones, and push notification providers configured in settings.</p>
<h2>Integrations</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Integration settings hub"></div>
<ul>
  <li>Calendar sync to reduce double-booking.</li>
  <li>Mapbox for service areas and house calls.</li>
  <li>OneSignal for push; email/SMS in notification settings.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'integrations-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Roles, permissions, shifts, and team member access.', body = $body$<p>Add staff with roles that control calendar, clients, payments, and settings visibility. Shifts and days off per team member.</p>
<h2>Team setup</h2>
<div data-learn-mockup="provider-web-team" data-caption="Staff, roles, and permissions"></div>
<ul>
  <li>Invite team members with email; assign role and locations.</li>
  <li>Permissions limit sensitive finance and settings access.</li>
  <li>Staff log in to the provider app with their own account.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'staff-permissions-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Campaigns, promo codes, and customer automations.', body = $body$<p>Run campaigns and create promo codes to attract and retain customers. Share codes on your profile, in chats, or external marketing.</p>
<h2>Marketing hub</h2>
<div data-learn-mockup="provider-web-marketing" data-caption="Campaigns and promo codes"></div>
<p>Set discount type, validity, and usage limits. Automations (confirmations, follow-ups) live under marketing and notification settings.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'marketing-automations-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Dashboard metrics, reports, and VAT where applicable.', body = $body$<p>Use reports to understand revenue, bookings, clients, and products over today, week, month, or custom ranges.</p>
<h2>Reports</h2>
<div data-learn-mockup="provider-web-reports" data-caption="Analytics with period filters"></div>
<p>Read finance carefully: period earnings differ from all-time withdrawable balance. Export or view VAT reports where enabled for your region.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'reports-analytics-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Accept or decline incoming on-demand requests from the Dashboard.', body = $body$<p>When on-demand is enabled, matching requests appear as notifications. Accept to create a booking; decline if unavailable.</p>
<h2>Incoming requests</h2>
<div data-learn-mockup="provider-mobile-dashboard" data-caption="Dashboard — operational summary and alerts"></div>
<ul>
  <li>Configure which services and areas receive on-demand requests in settings.</li>
  <li>Respond promptly — acceptance creates a booking in your calendar.</li>
  <li>Chats tab for follow-up with the customer.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'on-demand-requests-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Respond to reviews publicly and build reputation on your profile.', body = $body$<p>Reviews appear in your engagement area and on your public profile. Respond professionally; report policy violations to support.</p>
<h2>Manage reviews</h2>
<ul>
  <li>Filter by rating or status; reply to address feedback.</li>
  <li>Encourage happy clients to review after completed bookings.</li>
  <li>Average rating helps new customers choose you on Home and Search.</li>
</ul>
<h2>Best practice</h2>
<p>Keep responses factual and courteous — your reply is visible to future customers.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'reviews-management-overview' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- GENERAL & ABOUT BEAUTONOMI
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET summary = 'Create an account, explore as customer or provider, and find the right guides.', body = $body$<p>Beautonomi connects customers with beauty and wellness providers across South Africa. Create a free account with email, phone, or social login.</p>
<h2>For customers</h2>
<div data-learn-mockup="customer-mobile-home" data-caption="Home — discover providers and book"></div>
<p>Use <strong>Home</strong> and <strong>Search</strong> to discover services. Bottom tabs: Home, Search, Bookings, Cart, Chats, Profile. Pay online via Paystack; manage everything under Bookings and Profile.</p>
<h2>For providers</h2>
<p>Sign up as a provider to get calendar, Paystack checkout, Yoco in-person payments, payouts, clients, and marketing tools. Complete verification and setup from <strong>More</strong>.</p>
<h2>Find help</h2>
<p>Use the Learning Center sidebar by role and topic, or search Help for answers.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'getting-started-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Platform overview for customers and providers in one marketplace.', body = $body$<p>Beautonomi is a marketplace and operating system for beauty and wellness. Customers book and pay securely; providers run scheduling, payments, and client relationships in one place.</p>
<h2>What you can do</h2>
<div data-learn-mockup="customer-mobile-home" data-caption="Discover and book nearby providers"></div>
<ul>
  <li><strong>Customers:</strong> book salon or house call services, shop products, message providers, manage wallet and loyalty.</li>
  <li><strong>Providers:</strong> calendar, CRM, Paystack online pay, Yoco POS, payouts, team, and reports.</li>
</ul>
<p>See Compliance and Safety and booth renter guides in this section for more context.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'introduction-to-beautonomi' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Personal info, profile, login, verification, addresses, and privacy settings.', body = $body$<p>Your account settings control how you appear and how you sign in across app and web.</p>
<h2>Account hub</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Profile — settings, addresses, payments"></div>
<ul>
  <li><strong>Personal info:</strong> name, photo, email, phone.</li>
  <li><strong>Login &amp; security:</strong> password and account protection.</li>
  <li><strong>Addresses:</strong> saved locations for house calls and delivery.</li>
  <li><strong>Privacy:</strong> control data and visibility preferences.</li>
</ul>
<p>Provider business settings are separate — use the provider portal Settings, not the customer Profile.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'account-profile-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Email, SMS, push alerts, and in-app Chats messaging.', body = $body$<p>Choose how you receive booking reminders, messages, and promotions. Push requires device permission for the Beautonomi app.</p>
<h2>Notifications</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Notification preferences in Profile"></div>
<p>Toggle email, SMS, and push by category in Profile. Providers also receive booking and on-demand alerts — configure under provider notification settings.</p>
<h2>Messaging</h2>
<p>Customer <strong>Chats</strong> tab; provider <strong>Chats</strong> tab (Messages screen). Unread badges show on the tab bar.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'notifications-messaging-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Provider subscription plans, billing, and where to manage your plan.', body = $body$<p>Providers choose a Beautonomi business plan with features suited to team size, locations, and advanced tools. Customer-facing memberships you sell are separate from your platform subscription.</p>
<h2>Manage subscription</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Subscription plan in Settings"></div>
<ul>
  <li>View plan, renewal, and invoices under Settings → Subscription (web) or More (app).</li>
  <li>Upgrade or change plan according to current terms.</li>
  <li>Provider subscription billing uses Paystack plan codes — not the same as customer membership products.</li>
</ul>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'pricing-subscriptions-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Encrypted connections, Paystack tokens, and privacy practices.', body = $body$<p>Beautonomi uses industry-standard encryption in transit. Card payments run through Paystack; we store authorization tokens, not full card numbers.</p>
<h2>Your responsibility</h2>
<ul>
  <li>Use a strong unique password; do not share login credentials.</li>
  <li>Verification documents are for platform review only — not shared with providers or customers.</li>
  <li>Report suspicious activity via Help immediately.</li>
</ul>
<h2>Learn more</h2>
<p>See Privacy Policy and Terms for full data handling. Provider and customer accounts may use different apps — sign in to the correct one.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'security-privacy-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Cancellations, refunds, disputes, safety, and community standards.', body = $body$<p>Platform policies define cancellation windows, refund eligibility, and dispute handling. Provider-specific rules may also apply and are shown at booking.</p>
<h2>Key policies</h2>
<ul>
  <li><strong>Cancellations:</strong> timing affects refund amount per provider policy.</li>
  <li><strong>Provider cancel:</strong> customer receives full refund via Paystack or wallet.</li>
  <li><strong>Disputes:</strong> raised through support; reviewed against policies.</li>
  <li><strong>Community:</strong> accurate listings, respectful messaging, legal compliance.</li>
</ul>
<h2>House calls</h2>
<p>Accurate addresses and on-platform booking support safe house call experiences for both parties.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'policies-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Resolve common booking, payment, and login issues quickly.', body = $body$<p>Many issues are fixed by checking booking detail, payment methods, or using the correct app (customer vs provider).</p>
<h2>Common fixes</h2>
<ul>
  <li><strong>Payment failed:</strong> retry Paystack checkout or update card in Profile.</li>
  <li><strong>Booking not showing:</strong> confirm same login on app and web; pull to refresh Bookings.</li>
  <li><strong>Cannot sign in:</strong> use forgot password; ensure customer vs provider app.</li>
  <li><strong>Missing refund:</strong> allow Paystack processing time; then open a support ticket.</li>
</ul>
<h2>Still stuck?</h2>
<p>Submit a ticket from Help with booking ID or payment reference.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'troubleshooting-faq-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Release notes for customer app, provider app, and web.', body = $body$<p>Platform updates document new features, improvements, and fixes across customer mobile, provider mobile, and the web portal.</p>
<h2>Stay informed</h2>
<ul>
  <li>Check this section for release notes.</li>
  <li>Major changes may also appear via email or in-app notification.</li>
  <li>Send feedback through Help or the feedback link on the help page.</li>
</ul>
<p>For mobile-specific navigation and payments, see the Mobile app guides and Web guides categories.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'platform-updates-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Verification, secure payments, and safety expectations on Beautonomi.', body = $body$<p>Providers complete verification before offering services. Payments online use Paystack; in-person provider card uses Yoco where configured.</p>
<h2>Safety &amp; compliance</h2>
<ul>
  <li>Book and pay on-platform for a clear record and support path.</li>
  <li>House calls require accurate addresses and provider service zones.</li>
  <li>Report concerns via Help — do not share verification documents in chat.</li>
</ul>
<p>Regional compliance is the responsibility of each business; Beautonomi provides tools and policies to support safe operations.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'compliance-and-safety' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Booth renters and hybrid salons: locations, staff, and permissions.', body = $body$<p>Booth renters manage their own calendar, services, and clients while the venue may share space or front desk. Hybrid setups mix employees and renters under one business account.</p>
<h2>Setup patterns</h2>
<ul>
  <li><strong>Booth renter:</strong> own availability, pricing, and payouts; venue may appear as a location.</li>
  <li><strong>Salon owner:</strong> use locations, team roles, and permissions to separate access.</li>
  <li>See Locations &amp; Service Areas and Staff &amp; Permissions guides for detail.</li>
</ul>
<p>Customer bookings still flow through standard Paystack checkout and appear under Bookings for each party with appropriate access.</p>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'using-beautonomi-booth-renter-hybrid' AND tenant_id IS NULL;

UPDATE public.learning_articles SET summary = 'Introduction to Beautonomi platform guides and related topics.', body = $body$<p>The articles in this section introduce Beautonomi for customers and providers — compliance, booth models, and platform capabilities.</p>
<h2>In this section</h2>
<ul>
  <li><a href="/learn/article/introduction-to-beautonomi">Introduction to Beautonomi</a></li>
  <li><a href="/learn/article/compliance-and-safety">Compliance and Safety</a></li>
  <li><a href="/learn/article/using-beautonomi-booth-renter-hybrid">Using Beautonomi with a Booth Renter or Hybrid Model</a></li>
</ul>
<p>For step-by-step product guides, use Mobile app guides, Web guides, or role-based categories in the sidebar.</p>
<div style="margin-top: 2rem; padding: 1.25rem 1.5rem; border-radius: 12px; background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); border: 1px solid #fbcfe8;">
  <p style="margin: 0 0 0.5rem 0; font-weight: 600; color: #1f2937;">Can't find what you're looking for?</p>
  <p style="margin: 0; font-size: 0.875rem; color: #4b5563;">Open Help to submit a support ticket or search the Learning Center.</p>
</div>$body$, content_format = 'html', updated_at = NOW() WHERE slug = 'about-beautonomi' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- NEW GAP ARTICLES (idempotent INSERT by slug)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Tipping and gratuity', 'tipping-and-gratuity', 'How tips work when enabled by your provider at checkout or after service.', $body$<p>Some providers enable tipping so you can add gratuity for great service. Availability depends on the provider and checkout flow.</p>
<h2>When to tip</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Booking detail — pay and receipt actions"></div>
<ul>
  <li>Tip options may appear at Paystack checkout or on booking detail after the visit.</li>
  <li>Tip amount is charged through the same secure Paystack flow when online.</li>
  <li>Receipts include tip line items when applicable.</li>
</ul>
<h2>Questions?</h2>
<p>Tip distribution to staff is configured by the provider — contact them or support if a charge looks incorrect.</p>$body$, 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'payments-customer'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'tipping-and-gratuity' AND a.tenant_id IS NULL);

INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Refunds and cancellation fees', 'refunds-and-cancellation-fees', 'How refunds and fees apply when you cancel or a provider cancels.', $body$<p>Refund amount depends on when you cancel and the provider cancellation policy shown at booking.</p>
<h2>Customer cancel</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Cancel from booking detail — policy applies"></div>
<ul>
  <li>Early cancel: often full refund to card or wallet via Paystack.</li>
  <li>Late cancel: partial or no refund per policy.</li>
  <li>Processing time follows Paystack and bank schedules.</li>
</ul>
<h2>Provider cancel</h2>
<p>Full refund automatically — rebook from Bookings or Search.</p>$body$, 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'managing-bookings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'refunds-and-cancellation-fees' AND a.tenant_id IS NULL);

INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Buying and using memberships', 'buying-using-memberships', 'Purchase provider memberships and redeem benefits at checkout.', $body$<p>Providers may sell memberships with recurring benefits (discounts, included services). Purchase from the provider profile or shop flow.</p>
<h2>Membership wallet</h2>
<div data-learn-mockup="customer-mobile-wallet" data-caption="Memberships and loyalty in wallet"></div>
<ul>
  <li>Active memberships appear in Profile or wallet area.</li>
  <li>Redemption rules are set by the provider — read terms before purchase.</li>
  <li>Renewals may charge saved Paystack card per provider settings.</li>
</ul>$body$, 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'wallet-gift-cards-coupons'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'buying-using-memberships' AND a.tenant_id IS NULL);

INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Group bookings for customers', 'group-bookings-customer', 'Book a group session when a provider offers shared appointments.', $body$<p>Group bookings let multiple participants join one session (class, party package, etc.). The provider defines capacity and pricing.</p>
<h2>Book a group session</h2>
<div data-learn-mockup="customer-web-booking" data-caption="Group booking in checkout flow"></div>
<ol>
  <li>Select a group service or package on the provider booking page.</li>
  <li>Add participants if prompted; choose date and time with enough capacity.</li>
  <li>Complete Paystack checkout — each participant may receive confirmation details.</li>
</ol>$body$, 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'booking-checkout'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'group-bookings-customer' AND a.tenant_id IS NULL);

INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Recurring appointments', 'recurring-appointments-customer', 'When providers offer repeat bookings on a schedule.', $body$<p>Some providers create recurring appointments (e.g. weekly slots). You receive confirmations like standard bookings.</p>
<h2>Your recurring bookings</h2>
<div data-learn-mockup="customer-mobile-bookings" data-caption="Upcoming recurring visits in Bookings"></div>
<ul>
  <li>Each occurrence appears under <strong>Bookings</strong>.</li>
  <li>Reschedule or cancel one occurrence from booking detail unless policy says otherwise.</li>
  <li>Pay any per-visit balance via Paystack from booking detail.</li>
</ul>$body$, 'html', 'published', 'customer', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'managing-bookings'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'recurring-appointments-customer' AND a.tenant_id IS NULL);

INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, 'Commissions and payroll', 'provider-commissions-payroll', 'Configure staff commissions and view payroll-related reports.', $body$<p>Share revenue with staff using commission rules tied to services or percentages. Payroll views help reconcile what each team member earned.</p>
<h2>Setup</h2>
<div data-learn-mockup="provider-web-team" data-caption="Team, commissions, and payroll"></div>
<ul>
  <li>Define commission rules in team or finance settings.</li>
  <li>Staff earnings reflect completed paid bookings per rule.</li>
  <li>Use payroll reports alongside payout balance — staff payouts may be offline.</li>
</ul>
<p>Platform payout balance is for the business account; staff settlements follow your internal payroll process.</p>$body$, 'html', 'published', 'provider', false, NOW()
FROM public.learning_categories c WHERE c.slug = 'staff-permissions'
AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'provider-commissions-payroll' AND a.tenant_id IS NULL);

-- Stats for any new articles
INSERT INTO public.learning_article_stats (article_id, view_count, helpful_yes_count, helpful_no_count)
SELECT a.id, 0, 0, 0
FROM public.learning_articles a
WHERE a.slug IN (
  'tipping-and-gratuity',
  'refunds-and-cancellation-fees',
  'buying-using-memberships',
  'group-bookings-customer',
  'recurring-appointments-customer',
  'provider-commissions-payroll'
)
AND NOT EXISTS (SELECT 1 FROM public.learning_article_stats s WHERE s.article_id = a.id);
