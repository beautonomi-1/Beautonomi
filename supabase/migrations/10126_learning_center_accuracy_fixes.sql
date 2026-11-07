-- 10126: Learning Center — accuracy fixes (fact-checked; see docs/learning/FACT_LEDGER.md)
--
-- 3111_learning_center_overview_content.sql replaced the structured, mockup-rich bodies of every
-- *-overview article (from 700 and 888) with short prose, without a tenant_id guard, and reintroduced
-- stale facts. This migration restores structured bodies merged with the 888 lifecycle copy and
-- corrects facts verified against product code:
--   * Cancellation refunds are Beautonomi wallet credit; bank refunds are by request
--     (apps/web/src/lib/bookings/refund-processing.ts, /account-settings/wallet/bank-refund).
--   * Walk-ins paid via Paystack count toward the payout balance; cash / Yoco / card-machine
--     walk-ins do not (apps/web/src/app/api/provider/finance/route.ts sumNet).
--   * Provider app tabs: Dashboard, Clients, Chats, Bookings, More.
--   * Yoco lives under More → Payment setup → Yoco payments (app) and Yoco in the web sidebar,
--     both only when the payment_yoco feature flag is on. Card machines need payment_paycloud.
-- Global rows only (tenant_id IS NULL). Idempotent full-body SET by slug.

-- ═══════════════════════════════════════════════════════════════════════════════
-- GENERAL
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET
  summary = 'Create a free account, then book as a customer (Home, Search, Bookings, Cart, Chats, Profile) or run your business as a provider (Dashboard, Clients, Chats, Bookings, More).',
  body = $body$<p>Beautonomi connects customers with beauty and wellness providers. Creating an account is free — sign up with email, phone, or a social login (Google or Apple). Use the same login on the app and the website so your bookings, messages, and wallet stay in sync.</p>
<h2>For customers</h2>
<div data-learn-mockup="customer-mobile-home" data-caption="Customer app — Home, Search, Bookings, Cart, Chats, and Profile"></div>
<ul>
  <li>The customer app has six tabs: <strong>Home</strong>, <strong>Search</strong>, <strong>Bookings</strong>, <strong>Cart</strong>, <strong>Chats</strong>, and <strong>Profile</strong>.</li>
  <li>Discover providers from Home and Search, or browse the Explore feed from the Home header.</li>
  <li>Pay online with Paystack; wallet balance, gift cards, and pay-at-venue may also be offered at checkout.</li>
  <li>Manage appointments under Bookings and everything else (wallet, addresses, notifications, support) under Profile.</li>
</ul>
<h2>For providers</h2>
<div data-learn-mockup="provider-mobile-dashboard" data-caption="Provider app — Dashboard, Clients, Chats, Bookings, and More"></div>
<ul>
  <li>The provider app has five tabs: <strong>Dashboard</strong>, <strong>Clients</strong>, <strong>Chats</strong>, <strong>Bookings</strong>, and <strong>More</strong>.</li>
  <li>Complete identity verification and the setup checklist from More before you go live.</li>
  <li>The provider web portal (<strong>/provider</strong>) is best for bulk catalogue work, reports, and detailed settings.</li>
</ul>
<h2>Find help</h2>
<p>Browse the Learning Center by role and topic, or search. If you cannot find an answer, submit a ticket from Help (<strong>/help/submit-ticket</strong> on the web).</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/customer-mobile-app">Using the customer app</a></li>
  <li><a href="/learn/article/provider-mobile-app">Using the provider app</a></li>
  <li><a href="/learn/article/provider-web-portal">Provider web portal guide</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'getting-started-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Manage personal info, profile details, login & security, identity verification, addresses, privacy, and language from Profile (app) or Account settings (web).',
  body = $body$<p>Your account settings control how you appear and how you sign in on the app and the web. On the app, open <strong>Profile</strong>; on the web, open <strong>Account settings</strong> (<strong>/account-settings</strong>).</p>
<h2>Account hub</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Profile — settings, addresses, payments, and support"></div>
<ul>
  <li><strong>Personal info</strong> — name, photo, email, and phone.</li>
  <li><strong>Profile details</strong> and <strong>Preferences</strong> — beauty preferences and interests.</li>
  <li><strong>Login &amp; security</strong> — password and account protection.</li>
  <li><strong>Identity verification</strong> — required for some actions; documents are never shared with providers.</li>
  <li><strong>Addresses</strong> — saved locations for house calls and deliveries.</li>
  <li><strong>Privacy &amp; sharing</strong> — data and visibility preferences, and account deletion.</li>
  <li><strong>Wishlists</strong> — saved providers, services, and products (not a bottom tab).</li>
</ul>
<h2>Good to know</h2>
<p>Provider business settings are separate from your customer Profile — providers use More in the provider app or Settings in the provider web portal.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/customer-web-account-support">Customer account, addresses, and support on web</a></li>
  <li><a href="/learn/article/security-privacy-overview">Security &amp; privacy</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'account-profile-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Encrypted connections, Paystack card tokens (no full card numbers stored), private verification documents, and how to keep your login safe.',
  body = $body$<p>Beautonomi uses encrypted connections. Online card payments run through Paystack — we store a secure authorization token, never your full card number or CVV.</p>
<h2>How we protect you</h2>
<ul>
  <li>Verification documents are used for platform review only and are not shared with providers or customers.</li>
  <li>Booking, paying, and messaging on Beautonomi keeps a clear record for support and disputes.</li>
  <li>Safety tools and blocking are available from your account where enabled.</li>
</ul>
<h2>Your part</h2>
<ul>
  <li>Use a strong, unique password and never share your login or one-time codes.</li>
  <li>Review <strong>Login &amp; security</strong> in your account settings regularly.</li>
  <li>Report anything suspicious through Help straight away, then change your password.</li>
</ul>
<h2>Learn more</h2>
<p>See the Privacy Policy and Terms of Service for full details of what we collect and how it is used.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/account-profile-overview">Account &amp; profile</a></li>
  <li><a href="/learn/article/compliance-and-safety">Compliance and safety</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'security-privacy-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Choose push, email, SMS, and WhatsApp alerts by category in notification settings; message from the Chats tab in both the customer and provider apps.',
  body = $body$<p>You decide how Beautonomi reaches you. Notifications can be sent by push, email, SMS, and WhatsApp, and you can turn categories on or off.</p>
<h2>Notification settings</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Notification preferences in Profile"></div>
<ul>
  <li><strong>Customers:</strong> Profile → Notifications (app) or <strong>/account-settings/notifications</strong> (web). Categories include reminders, messages, account activity, offers, and news.</li>
  <li><strong>Providers:</strong> notification settings cover booking updates, cancellations, reminders, reviews, client messages, payments, payouts, and waitlist alerts.</li>
  <li>Push alerts also need notifications allowed for the app in your phone settings.</li>
</ul>
<h2>Messaging</h2>
<div data-learn-mockup="customer-mobile-chats" data-caption="Chats — conversations between customers and providers"></div>
<p>Conversations live in the <strong>Chats</strong> tab in both the customer app and the provider app. On the web, customers use <strong>/account-settings/messages</strong> and providers use <strong>Messages</strong> in the sidebar. Unread badges show on the tab bar.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/messaging-providers-overview">Messaging providers</a></li>
  <li><a href="/learn/article/customer-mobile-notifications-support">Customer app support and alerts</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'notifications-messaging-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Quick fixes for failed payments, missing bookings, sign-in problems, and refunds (cancellation refunds go to your Beautonomi wallet).',
  body = $body$<p>Most problems are solved by checking booking detail, your payment method, or that you are signed in to the right app (customer or provider).</p>
<h2>Common fixes</h2>
<ul>
  <li><strong>Payment failed:</strong> retry from booking detail, or use another card or method.</li>
  <li><strong>Booking not showing:</strong> make sure you use the same login on app and web, then pull to refresh Bookings.</li>
  <li><strong>Payment succeeded but status did not update:</strong> wait a moment and reopen the booking or order — do not book again.</li>
  <li><strong>Cannot sign in:</strong> use forgot password, and check you are in the customer app or the provider app as intended.</li>
  <li><strong>Where is my refund?</strong> Cancellation refunds are credited to your Beautonomi wallet. Check your wallet balance first; a bank refund can be requested from the wallet.</li>
</ul>
<h2>Still stuck?</h2>
<p>Submit a ticket from Help (<strong>/help/submit-ticket</strong>) with your booking or order reference. Track replies under <strong>My tickets</strong> (<strong>/help/my-tickets</strong>).</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/support-tickets-disputes-overview">Support tickets &amp; disputes</a></li>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'troubleshooting-faq-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Release notes and announcements for the customer app, provider app, and web.',
  body = $body$<p>Platform updates document new features, improvements, and fixes across the customer app, the provider app, and the web.</p>
<h2>Stay informed</h2>
<ul>
  <li>Check this section for release notes.</li>
  <li>Major changes may also arrive by email or in-app notification.</li>
  <li>Keep your apps updated so you have the latest fixes.</li>
</ul>
<h2>Feedback</h2>
<p>Send suggestions through Help. For step-by-step product guidance, see the Mobile app guides and Web guides sections.</p>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'platform-updates-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Providers manage their Beautonomi plan under More → Subscription and More → Billing (app) or Subscription and Settings → Billing (web); plan prices are shown in-app and on /pricing.',
  body = $body$<p>Providers choose a Beautonomi business plan. Plans differ in features and limits, and current prices are always shown on the <strong>/pricing</strong> page and in the subscription screen — they are not fixed in these articles.</p>
<h2>Manage your plan</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Subscription and billing"></div>
<ul>
  <li><strong>App:</strong> More → <strong>Subscription</strong> (quick action) to view or change your plan; More → <strong>Billing</strong> for plan, invoices, bills, and VAT.</li>
  <li><strong>Web:</strong> <strong>Subscription</strong> in the sidebar (<strong>/provider/subscription</strong>) and <strong>Settings → Billing</strong> (<strong>/provider/settings/billing</strong>) for invoices.</li>
  <li>On iPhone, a plan may be purchased through the App Store where offered.</li>
</ul>
<h2>Good to know</h2>
<p>Your Beautonomi subscription is separate from memberships and packages you sell to your own clients.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-subscription-plan">Provider subscription plan</a></li>
  <li><a href="/learn/article/provider-web-packages-memberships">Packages, memberships, and subscriptions</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'pricing-subscriptions-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Cancellation policy is fixed at booking (or becomes more flexible), refunds are Beautonomi wallet credit with bank refund on request, and disputes go through support.',
  body = $body$<p>Platform policies define how cancellations, refunds, and disputes work. Each provider also sets a cancellation policy, shown on their profile and at checkout.</p>
<h2>Key policies</h2>
<ul>
  <li><strong>Cancellations:</strong> the policy shown when you booked applies. If the provider later makes it more flexible, the more flexible terms apply.</li>
  <li><strong>Refunds:</strong> money paid online through Beautonomi is credited to your Beautonomi wallet. A bank refund can be requested from your wallet.</li>
  <li><strong>Provider cancels:</strong> no fee applies and online payments are credited to your wallet.</li>
  <li><strong>In-person payments:</strong> cash or card-machine payments made at the venue are returned by the provider.</li>
  <li><strong>Disputes:</strong> raised through support and reviewed against these policies.</li>
  <li><strong>Community:</strong> accurate listings, respectful messaging, and compliance with local laws.</li>
</ul>
<h2>Full terms</h2>
<p>See the Terms of Service and related policy pages for the complete rules.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/canceling-your-booking">Canceling your booking</a></li>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
  <li><a href="/learn/article/if-provider-cancels">If your provider cancels</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'policies-overview' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET
  summary = 'Find a provider on Home or Search, pick service, venue, staff, and time, then pay with Paystack (or wallet, gift card, or pay-at-venue when offered).',
  body = $body$<p>Book from the <strong>Home</strong> or <strong>Search</strong> tab in the customer app, or on the web from a provider page or booking link. Web links such as <strong>/book/[provider]</strong> continue into the <strong>/booking</strong> checkout flow.</p>
<h2>How booking works</h2>
<div data-learn-mockup="customer-web-booking" data-caption="Choose a service — checkout continues via Paystack"></div>
<ol>
  <li>Find a provider or service from Home, Search, or a direct booking link.</li>
  <li>Select the service, venue (salon or house call), staff member if shown, date, and time.</li>
  <li>Add add-ons or package options where offered.</li>
  <li>Review the cancellation policy and any deposit, then pay with Paystack — or use wallet balance, a gift card, or pay-at-venue when available.</li>
</ol>
<h2>After you book</h2>
<p>Your appointment appears under <strong>Bookings</strong>. Some providers confirm online requests before the booking is final — booking detail shows when they will reply.</p>
<h2>Other ways to book</h2>
<ul>
  <li><strong>On-demand:</strong> request a service without choosing a provider first.</li>
  <li><strong>Group bookings:</strong> book a shared session where the provider offers one.</li>
  <li><strong>Custom requests:</strong> ask a provider for a quote and pay their custom offer.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/how-to-book-service">How to book a service</a></li>
  <li><a href="/learn/article/on-demand-booking">On-demand booking</a></li>
  <li><a href="/learn/article/group-bookings-customer">Group bookings</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'booking-checkout-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Pay with Paystack (saved cards are tokens, not card numbers); cancellation refunds land in your Beautonomi wallet, and you can request a bank refund from the wallet.',
  body = $body$<p>Beautonomi uses <strong>Paystack</strong> for secure online card and bank payments. Depending on the provider, wallet balance, gift cards, and pay-at-venue may also be available at checkout.</p>
<h2>Pay online</h2>
<div data-learn-mockup="customer-web-account" data-caption="Receipts, payment history, and saved methods in your account"></div>
<p>At checkout you complete payment in Paystack (on the app it may open in an in-app browser). Receipts are stored with each booking or order.</p>
<h2>Saved payment methods</h2>
<p>Save a card after a successful Paystack payment. We keep a secure token — not your full card number. Manage cards under Profile → <strong>Payments</strong> (app) or <strong>/account-settings/payments</strong> (web).</p>
<h2>When you are charged</h2>
<p>You are charged when checkout completes, unless the provider uses a deposit or pay-later flow — booking detail shows what is owed. Additional charges added at your visit can be paid from booking detail.</p>
<h2>Refunds</h2>
<p>Cancellation refunds of money paid online are credited to your <strong>Beautonomi wallet</strong> for your next booking. To move eligible wallet funds to your bank, request a bank refund from your wallet. Payments made in person are returned by the provider.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/payment-methods-accepted">Payment methods accepted</a></li>
  <li><a href="/learn/article/when-you-pay-booking">When you pay for a booking</a></li>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'payments-customer-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Your wallet holds refunds and credits; gift cards can be bought on /gift-card or from a provider and redeemed at checkout; promo codes apply at checkout.',
  body = $body$<p>Your wallet holds credits from refunds and promotions. Gift cards and promo codes reduce what you pay at checkout when they are valid.</p>
<h2>Wallet &amp; offers</h2>
<div data-learn-mockup="customer-mobile-wallet" data-caption="Wallet balance, coupons, gift cards, and loyalty"></div>
<ul>
  <li><strong>Wallet:</strong> cancellation refunds and credits land here and can be used on future bookings. Find it under Profile → Wallet (app) or <strong>/account-settings/wallet</strong> (web).</li>
  <li><strong>Bank refund:</strong> request a payout of eligible wallet funds to your bank from the wallet.</li>
  <li><strong>Gift cards:</strong> buy on the gift card page (<strong>/gift-card</strong>) or from a provider where offered, and redeem at checkout.</li>
  <li><strong>Promo codes:</strong> enter a code at checkout; providers can limit codes by date or to one use per customer.</li>
</ul>
<h2>History</h2>
<p>Your wallet shows transactions so you can see every credit and spend.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/customer-web-wallet-loyalty">Customer web wallet and loyalty</a></li>
  <li><a href="/learn/article/buying-using-memberships">Buying and using memberships</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'wallet-gift-cards-coupons-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Earn loyalty points with participating providers and invite friends with referrals; rules and reward amounts are set by the provider or platform.',
  body = $body$<p>Some providers run loyalty programs where you earn points on bookings and redeem them for discounts. Beautonomi also runs referrals so you can earn rewards by inviting friends.</p>
<h2>Your points</h2>
<div data-learn-mockup="customer-mobile-wallet" data-caption="Loyalty points and redemption value"></div>
<ul>
  <li>See points under Profile → Loyalty (app) or <strong>/account-settings/loyalty</strong> (web).</li>
  <li>Earning rules, redemption limits, and expiry are set per program — check the details before you redeem.</li>
  <li>Eligible points can be applied at checkout.</li>
</ul>
<h2>Referrals</h2>
<p>Share your referral link from Profile → Referrals (app) or <strong>/account-settings/referrals</strong> (web). Reward amounts are set by the platform and shown on the referrals screen.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/customer-web-wallet-loyalty">Customer web wallet and loyalty</a></li>
  <li><a href="/learn/article/customer-mobile-wallet-loyalty">Customer app wallet and loyalty</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'loyalty-rewards-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Leave a review from a completed booking; you can edit your review for 24 hours after posting; providers can reply publicly.',
  body = $body$<p>Reviews help other customers choose and help providers improve. You can review a provider after a completed appointment.</p>
<h2>Leave a review</h2>
<div data-learn-mockup="customer-web-manage-bookings" data-caption="Leave a review from booking detail"></div>
<ol>
  <li>Open the completed booking under <strong>Bookings</strong>.</li>
  <li>Choose to review, add your rating, and write what happened.</li>
  <li>Keep it honest and respectful — reviews follow community guidelines.</li>
</ol>
<h2>Good to know</h2>
<ul>
  <li>You can edit your review for <strong>24 hours</strong> after posting.</li>
  <li>Your reviews are listed under <strong>/account-settings/reviews</strong> on the web.</li>
  <li>Provider profiles show their average rating and recent reviews, along with provider replies.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/customer-web-reviews-messaging-support">Reviews, messaging, and support on web</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'reviews-ratings-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Message providers from the Chats tab (app), /account-settings/messages (web), a provider profile, or booking detail.',
  body = $body$<p>Use in-app messaging to confirm details, ask questions, or receive custom offers. Each provider conversation stays in one thread.</p>
<h2>Where to message</h2>
<div data-learn-mockup="customer-mobile-chats" data-caption="Chats tab — messages with providers"></div>
<ul>
  <li><strong>Chats</strong> tab in the customer app for all conversations.</li>
  <li><strong>/account-settings/messages</strong> on the web.</li>
  <li>Start a new conversation from a provider profile or from booking detail.</li>
</ul>
<h2>Best practice</h2>
<ul>
  <li>Keep booking agreements in the thread so there is a clear record.</li>
  <li>Never share passwords, one-time codes, or verification documents in chat.</li>
  <li>Turn on message notifications so you do not miss replies.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/notifications-messaging-overview">Notifications &amp; messaging</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'messaging-providers-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'From booking detail: reschedule, cancel, pay balances, verify arrival, tell the salon you are running late (from 30 minutes before), and review; unconfirmed requests expire without charge.',
  body = $body$<p>All upcoming and past appointments live under the <strong>Bookings</strong> tab. Tap a booking to see its detail, actions, and receipt.</p>
<h2>Booking detail actions</h2>
<div data-learn-mockup="customer-mobile-bookings" data-caption="Bookings list — tap to reschedule, pay, or review"></div>
<ul>
  <li><strong>Reschedule</strong> — pick a new slot where policy allows.</li>
  <li><strong>Cancel</strong> — you see any fee and the wallet refund before you confirm.</li>
  <li><strong>Pay</strong> — outstanding balances or additional charges via Paystack.</li>
  <li><strong>Verify arrival</strong> — some providers ask you to confirm arrival with a button or code.</li>
  <li><strong>Review</strong> — after a completed visit.</li>
</ul>
<h2>Running late</h2>
<p>Use <strong>I'm running late</strong> from about 30 minutes before your slot until the appointment window ends, and choose your delay (10, 15, 20, 30, or 45 minutes). The salon is notified and can acknowledge. You can update it again after 15 minutes. Your booking stays in Upcoming through that window.</p>
<h2>After the visit</h2>
<p>The salon closes the appointment out (completed, no-show, or cancelled). Until then you may see <strong>Waiting for salon to close out</strong>. If you were marked as a no-show but attended, open the booking and submit a ticket.</p>
<h2>Requests that need confirmation</h2>
<p>Online requests that need provider confirmation show when the salon will reply. If they do not confirm in time, the slot is released, you are not charged (or you are refunded in full), and you can tap <strong>Book again</strong>.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/reschedule-booking">Reschedule a booking</a></li>
  <li><a href="/learn/article/canceling-your-booking">Canceling your booking</a></li>
  <li><a href="/learn/article/verify-arrival">Verify arrival</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'managing-bookings-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'House calls: choose a saved address with an accurate map pin; travel fees depend on the provider''s zones and settings and are shown before you pay.',
  body = $body$<p>Many providers offer <strong>house calls</strong> — they travel to you. Choose house call when you book and confirm your address.</p>
<h2>Address &amp; travel fees</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Saved addresses and map pins in Profile"></div>
<ul>
  <li>Add or edit addresses under Profile → Addresses (app) or <strong>/account-settings/addresses</strong> (web).</li>
  <li>Pick an address suggestion and check the map pin sits on your entrance.</li>
  <li>Travel fees depend on the provider's service zones and travel fee settings and are shown before you pay.</li>
</ul>
<h2>On the day</h2>
<p>The provider can share an updated arrival time while en route. You can use <strong>I'm running late</strong> if you need more time.</p>
<h2>Safety</h2>
<p>Book and pay on Beautonomi so payment, messages, and booking records stay on the platform. Use the safety tools in your account where available, and contact support with any concern.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/customer-web-addresses-at-home">Addresses for house calls (web)</a></li>
  <li><a href="/learn/article/customer-mobile-addresses-at-home">Addresses for house calls (app)</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'at-home-services-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Submit tickets from Help (/help/submit-ticket) and track them in My tickets; approved refunds are credited to your Beautonomi wallet, with bank refund on request.',
  body = $body$<p>Need help? Submit a support ticket with your booking or order reference so the team can investigate quickly.</p>
<h2>Get support</h2>
<div data-learn-mockup="customer-mobile-profile" data-caption="Support tickets from Profile"></div>
<ol>
  <li>On the app, open Profile → Help or Support tickets. On the web, go to <strong>/help/submit-ticket</strong>.</li>
  <li>Describe the issue and include the booking ID, order number, or payment reference.</li>
  <li>Track status and reply in the thread under <strong>My tickets</strong> (<strong>/help/my-tickets</strong>).</li>
</ol>
<h2>Disputes &amp; refunds</h2>
<p>Disputes are reviewed against the provider's cancellation policy and platform policies. Approved refunds of money paid online are credited to your <strong>Beautonomi wallet</strong>; you can then request a bank refund from your wallet. Money paid in person is returned by the provider.</p>
<h2>Marked as a no-show by mistake?</h2>
<p>Open the booking and submit a ticket from there so the team sees the booking history.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/refunds-and-cancellation-fees">Refunds and cancellation fees</a></li>
  <li><a href="/learn/article/troubleshooting-faq-overview">Troubleshooting &amp; FAQ</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'support-tickets-disputes-overview' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROVIDER
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET
  summary = 'Verify your identity (More → Identity verification) and work through the setup checklist on More until every required step is done, then go live.',
  body = $body$<p>Provider onboarding combines identity verification with a setup checklist. The checklist card on the <strong>More</strong> tab shows required steps first and takes you to the next blocker.</p>
<h2>Setup checklist</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="More — setup checklist, finance, and subscription"></div>
<ul>
  <li>Business profile, services, availability, and locations.</li>
  <li>Identity verification — More → <strong>Identity verification</strong> (app) or <strong>/provider/settings/verification</strong> (web).</li>
  <li>A payout destination before you request payouts — More → <strong>Payment setup</strong> → Payout bank accounts.</li>
  <li>Optional steps (for example in-person payment devices or portfolio photos) do not block you from going live.</li>
</ul>
<h2>Go live</h2>
<p>When the required steps are complete, customers can book you from Home, Search, and your booking links.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/verification-steps">Verification steps</a></li>
  <li><a href="/learn/article/setup-status-checklist">Setup status checklist</a></li>
  <li><a href="/learn/article/provider-mobile-setup-status-launch">Setup status and launch in the app</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'provider-onboarding-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Build services, add-ons, packages, and memberships from More → Catalogue & offerings (app) or Catalogue, Packages, and Memberships in the web sidebar.',
  body = $body$<p>Your catalogue is what customers book. Organise services by category with duration and price, and attach add-ons for extras at checkout.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-catalogue" data-caption="Services, products, packages, and memberships"></div>
<ul>
  <li><strong>App:</strong> More → <strong>Catalogue &amp; offerings</strong>.</li>
  <li><strong>Web:</strong> <strong>Catalogue</strong> (<strong>/provider/catalogue</strong>), <strong>Packages</strong>, and <strong>Memberships</strong> in the sidebar.</li>
</ul>
<h2>Tips</h2>
<ul>
  <li>Use accurate durations — they drive availability and staff schedules.</li>
  <li>Link services to the locations and team members who perform them.</li>
  <li>When a package includes a product with variants, choose the exact variant.</li>
  <li>Deactivate services you no longer offer instead of leaving outdated prices.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-services-catalogue">Provider web services and catalogue</a></li>
  <li><a href="/learn/article/provider-web-packages-memberships">Packages, memberships, and subscriptions</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'services-catalogue-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Manage availability, time blocks, days off, recurring and group bookings; close out ended visits from Needs close-out (no automatic no-show); use Running behind to notify clients.',
  body = $body$<p>Your calendar controls when customers can book. Set hours per location and staff, and protect unavailable time with time blocks, days off, and closed periods.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-calendar" data-caption="Week calendar with appointments"></div>
<ul>
  <li><strong>App:</strong> the <strong>Bookings</strong> tab for your day, plus More → <strong>Bookings &amp; calendar</strong>, <strong>Time blocks</strong>, and <strong>Group Bookings</strong>.</li>
  <li><strong>Web:</strong> <strong>Calendar</strong>, <strong>Bookings</strong>, <strong>Recurring</strong>, <strong>Group Bookings</strong>, <strong>Time Blocks</strong>, <strong>Days Off</strong>, and <strong>Closed Periods</strong> in the sidebar.</li>
</ul>
<h2>Recurring appointments</h2>
<p>A recurring series is confirmed when you accept it — each upcoming instance is already confirmed, so you do not re-approve every visit.</p>
<h2>Close out every visit</h2>
<p>When a confirmed appointment ends, it stays open until you close it out. Use the <strong>Needs close-out</strong> queue on Bookings, the waiting room, and the end-of-day report to mark it completed, no-show (with your fee policy), or cancelled. There is no automatic no-show or auto-cancel for confirmed visits.</p>
<h2>Running behind</h2>
<p>Use <strong>Running behind</strong> on today's day view to notify remaining confirmed clients in one tap. For house calls, update your ETA while en route.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-calendar-bookings">Provider web calendar and bookings</a></li>
  <li><a href="/learn/article/provider-mobile-calendar-bookings">Provider app calendar and bookings</a></li>
  <li><a href="/learn/article/provider-web-group-bookings-time-blocks">Group bookings and time blocks</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'calendar-scheduling-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'The Clients tab (app) and Clients in the web sidebar list everyone who booked or messaged you, with history, notes, and tags; staff access follows permissions.',
  body = $body$<p>The <strong>Clients</strong> tab in the provider app — and <strong>Clients</strong> in the web sidebar (<strong>/provider/clients</strong>) — lists everyone who has booked or messaged you.</p>
<h2>Client profiles</h2>
<div data-learn-mockup="provider-web-clients" data-caption="Client list and CRM profiles"></div>
<ul>
  <li>Search, filter, and favourite key clients.</li>
  <li>Open a client to see booking history, notes, and tags.</li>
  <li>Start a message or a new booking from the profile.</li>
</ul>
<h2>Permissions</h2>
<p>Team members only see client data if their role includes the client permission. Set this under Settings → Team → Permissions on the web.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-clients-messaging-crm">Clients, messaging, and CRM on web</a></li>
  <li><a href="/learn/article/provider-mobile-clients-messaging-support">Clients and messaging in the app</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'clients-crm-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Online payments, wallet and gift card payments, and allocated Paystack Terminal payments settle through Beautonomi payouts; cash, Yoco, and card-machine payments go straight to you and are recorded for reporting.',
  body = $body$<p>Customers can pay online with Paystack when they book or when you send a payment link from booking detail. In person, you can take cash or card and record it on the booking.</p>
<h2>Online payments</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Finance — earnings and payout balance"></div>
<ul>
  <li>Payment links open Paystack for the customer. When they pay, the booking updates and the amount counts toward your payout balance.</li>
  <li>Customers can also pay with Beautonomi wallet credit or a gift card; these count toward your payout balance too.</li>
  <li><strong>Paystack Terminal</strong> (where available) takes QR and link payments on your phone. Each payment is matched to a sale and becomes payoutable after that allocation and any hold.</li>
   </ul>
<h2>In person</h2>
<ul>
  <li><strong>Cash</strong> and other mark-as-paid methods are recorded on the booking and in reports.</li>
  <li><strong>Card machines</strong> and <strong>Yoco</strong> (each where enabled for your account) settle to your own bank account through the terminal provider.</li>
  <li>These in-person amounts do not add to your Beautonomi payout balance, because Beautonomi never held the money.</li>
</ul>
<h2>Refunds and cancellations</h2>
<p>When a client cancels, the fee your policy allows is kept and the rest of the online payment is credited to the client's Beautonomi wallet. In-person payments are yours to return directly.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/payouts-earnings-overview">Payouts &amp; earnings</a></li>
  <li><a href="/learn/article/card-machines-first-payment">Taking your first card machine payment</a></li>
  <li><a href="/learn/article/provider-web-yoco-payments">Provider Yoco setup and accounting</a></li>
  <li><a href="/learn/article/provider-platform-fees-commission">Platform fees and commission</a></li>
  <li><a href="/learn/article/provider-paystack-terminal">Paystack Terminal: QR and link payments</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'payments-checkout-provider-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Your payout balance holds money Beautonomi collected for you (online card, wallet, and gift card payments, including walk-ins paid online); cash, Yoco, and card-machine sales go directly to you. Request payouts from More → Money or Finance.',
  body = $body$<p>Finance separates <strong>period earnings</strong> (the date range you pick) from <strong>available to withdraw</strong> (the all-time settled balance not already queued for payout).</p>
<h2>What counts toward your payout balance</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Metric meanings and payout request"></div>
<ul>
  <li>Bookings and sales paid online by card (Paystack, or Stripe or Flutterwave in markets that use them), less refunds and any commission.</li>
  <li>Payments made with Beautonomi wallet credit or gift cards.</li>
  <li>Walk-in sales paid through Paystack — Beautonomi holds that money for you.</li>
  <li><strong>Not included:</strong> cash, Yoco, card machines, and other payments taken directly by you. They still appear in revenue reports.</li>
</ul>
<p>The platform service fee is paid by the customer at checkout and does not reduce your price. Earnings still inside the payout hold period, pending payout requests, and open payment disputes are held back from the available amount.</p>
<h2>Request a payout</h2>
<ul>
  <li><strong>App:</strong> More → <strong>Money</strong> (or the <strong>Payouts</strong> quick action). Add a payout account first under More → <strong>Payment setup</strong> → Payout bank accounts.</li>
  <li><strong>Web:</strong> <strong>Finance</strong> in the sidebar; manage accounts under <strong>Bank Accounts</strong> (<strong>/provider/settings/payout-accounts</strong>).</li>
  <li>A minimum payout amount and hold period may apply. They are set by the platform and shown when you request.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/request-payout">Request a payout</a></li>
  <li><a href="/learn/article/understanding-earnings">Understanding your earnings</a></li>
  <li><a href="/learn/article/provider-web-finance-payouts">Provider finance metrics and payouts</a></li>
  <li><a href="/learn/article/provider-payout-rails-available-balance">Payout rails and your available balance</a></li>
  <li><a href="/learn/article/provider-platform-fees-commission">Platform fees and commission</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'payouts-earnings-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Add team members, roles, permissions, shifts, days off, and commissions from More → Team & scheduling (app) or Team and Settings → Team (web).',
  body = $body$<p>Add team members with roles that control what they can see and do — calendar, clients, payments, finance, and settings.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-team" data-caption="Staff, roles, and permissions"></div>
<ul>
  <li><strong>App:</strong> More → <strong>Team &amp; scheduling</strong> (staff, shifts, and time clock) and More → <strong>Team &amp; pay</strong> (payroll and earnings).</li>
  <li><strong>Web:</strong> <strong>Team</strong>, <strong>Team members</strong>, <strong>Shifts</strong>, and <strong>Days Off</strong> in the sidebar; roles, permissions, commissions, and time-off types under <strong>Settings → Team</strong>.</li>
</ul>
<h2>Permissions</h2>
<ul>
  <li>Permissions limit sensitive areas such as finance, payouts, and settings.</li>
  <li>Team members sign in to the provider app with their own account and see only what their role allows.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-staff-permissions">Provider web staff and permissions</a></li>
  <li><a href="/learn/article/provider-commissions-payroll">Commissions and payroll</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'staff-permissions-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Add locations and operating hours, define house-call service zones, and set travel fees from More → Locations & operating hours and More → Travel fees (app) or Settings (web).',
  body = $body$<p>Add every place you work — salon or studio addresses — and the areas you travel to for house calls.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Locations and addresses in Settings"></div>
<ul>
  <li><strong>App:</strong> More → <strong>Locations &amp; operating hours</strong> and More → <strong>Travel fees</strong>.</li>
  <li><strong>Web:</strong> <strong>Settings → Locations</strong>, <strong>Service zones</strong>, <strong>Operating hours</strong>, and <strong>Sales → Travel fees</strong>.</li>
</ul>
<h2>Accuracy matters</h2>
<ul>
  <li>Choose an address suggestion and check the map pin sits on the entrance.</li>
  <li>Service zones define where you take house calls; travel fees are calculated from your zones and travel fee settings.</li>
  <li>Assign services and team members to each location.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-locations-receipts">Locations, addresses, receipts, and invoices</a></li>
  <li><a href="/learn/article/provider-mobile-locations-settings">Locations and settings in the app</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'locations-service-areas-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Run campaigns and automations (Marketing in the web sidebar, More → Engagement in the app) and create promo codes (More → Promo codes) with dates and per-customer limits.',
  body = $body$<p>Attract and keep clients with campaigns, automations, and promo codes.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-marketing" data-caption="Campaigns and promo codes"></div>
<ul>
  <li><strong>App:</strong> More → <strong>Engagement</strong> (reviews, messaging, and marketing) and More → <strong>Promo codes</strong>.</li>
  <li><strong>Web:</strong> <strong>Marketing</strong> in the sidebar (<strong>/provider/marketing/automations</strong>) and <strong>Paid Ads</strong> for buying ads.</li>
</ul>
<h2>Promo codes</h2>
<ul>
  <li>Choose a discount type and validity dates, including an end date.</li>
  <li>Limit a code to one use per customer where needed.</li>
  <li>Codes apply only to your own bookings.</li>
</ul>
<h2>Automations</h2>
<p>Confirmations, reminders, and follow-ups run from your marketing and notification settings, so common messages go out without manual work.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/marketing-automations-overview">Marketing &amp; automations</a></li>
  <li><a href="/learn/article/integrations-overview">Integrations</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'marketing-automations-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Read and reply to reviews from More → Engagement → Reviews (app) or Reviews in the web sidebar; replies are public.',
  body = $body$<p>Reviews appear on your public profile and help new customers choose you. Reply professionally — your response is visible to everyone.</p>
<h2>Where to find it</h2>
<ul>
  <li><strong>App:</strong> More → <strong>Engagement</strong> → Reviews.</li>
  <li><strong>Web:</strong> <strong>Reviews</strong> in the sidebar (<strong>/provider/reviews</strong>).</li>
</ul>
<h2>Manage reviews</h2>
<ul>
  <li>Filter by rating or status and reply to address feedback.</li>
  <li>Encourage happy clients to review after completed bookings.</li>
  <li>If a review breaks the community guidelines, reply calmly and report it to support.</li>
</ul>
<h2>Good to know</h2>
<p>Customers can edit their own review for 24 hours after posting.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/reviews-ratings-overview">How customer reviews work</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'reviews-management-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Sell products and variants, track stock, and fulfil orders and returns from More → Products & e-commerce (app) or E-Commerce, Orders, Returns, and Shipping & Collection (web).',
  body = $body$<p>Sell retail and professional products online through the shop and cart, or add them to bookings as additional charges.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-orders" data-caption="Product orders with action counters"></div>
<ul>
  <li><strong>App:</strong> More → <strong>Products &amp; e-commerce</strong> (inventory, orders, and sales).</li>
  <li><strong>Web:</strong> <strong>E-Commerce</strong> and <strong>Products</strong> for stock; <strong>Orders</strong> and <strong>Returns</strong> for fulfilment; <strong>Shipping &amp; Collection</strong> for delivery options.</li>
</ul>
<h2>Tips</h2>
<ul>
  <li>Use variants for size, colour, scent, or volume so stock is tracked per option.</li>
  <li>Keep stock up to date so customers cannot buy what you do not have.</li>
  <li>Work the order tabs that show counters — they highlight orders waiting for you.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-ecommerce-orders">Provider e-commerce orders</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'inventory-products-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'See revenue, bookings, clients, and products by period in More → Reports (app) or Analytics and Reports (web); VAT reporting where it applies.',
  body = $body$<p>Reports show how your business is doing across today, this week, this month, or a custom range.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-reports" data-caption="Analytics with period filters"></div>
<ul>
  <li><strong>App:</strong> More → <strong>Reports</strong> (analytics, activity, and insights).</li>
  <li><strong>Web:</strong> <strong>Analytics</strong> (<strong>/provider/analytics</strong>) and <strong>Reports</strong> (<strong>/provider/reports</strong>) in the sidebar.</li>
</ul>
<h2>Read the numbers correctly</h2>
<ul>
  <li>Period earnings are not the same as the all-time balance available to withdraw.</li>
  <li>Revenue reports include in-person sales; the payout balance does not include cash, Yoco, or card-machine payments.</li>
  <li>VAT reports and invoices are available where tax applies to your business (More → <strong>Billing</strong> covers plan, invoices, bills, and VAT).</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-reports-analytics">Provider web reports and analytics</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'reports-analytics-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Share your booking link (Booking links in the web sidebar); online requests wait for your confirmation by default and are released and refunded if you do not confirm in time.',
  body = $body$<p>Your booking link lets customers book you directly without searching the marketplace. Share it on social media, your website, or in messages.</p>
<h2>Where to find it</h2>
<ul>
  <li><strong>Web:</strong> <strong>Booking links</strong> in the sidebar (<strong>/provider/express-booking</strong>) and <strong>Settings → Online booking</strong> for booking rules.</li>
  <li><strong>App:</strong> the <strong>Express booking</strong> quick action on More.</li>
</ul>
<h2>Confirmation for online requests</h2>
<p>Online requests may wait for your confirmation (this is the default). The customer sees when you will confirm. If you do not confirm in time, Beautonomi releases the time and refunds the customer. Bookings you add yourself (phone or walk-in) are confirmed immediately.</p>
<p>You get a reminder 30 minutes after a new request, and again shortly before it expires. Confirm or decline from the notification or the To review list.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-online-booking-links">Provider online booking links</a></li>
  <li><a href="/learn/article/on-demand-requests-overview">On-demand requests</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'online-booking-links-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Fill gaps from the Waitlist and run arrivals from Front desk / Waiting Room (web sidebar) or the Front Desk quick action and More → Bookings & calendar (app).',
  body = $body$<p>The waitlist captures demand when you are full. The waiting room and front desk show who has arrived and who is next.</p>
<h2>Where to find it</h2>
<div data-learn-mockup="provider-web-clients" data-caption="Front desk and client queue"></div>
<ul>
  <li><strong>Web:</strong> <strong>Waitlist</strong>, <strong>Front desk</strong>, and <strong>Waiting Room</strong> in the sidebar; waitlist rules under <strong>Settings → Waitlist</strong>.</li>
  <li><strong>App:</strong> the <strong>Front Desk</strong> quick action on More, and More → <strong>Bookings &amp; calendar</strong> for the waitlist.</li>
</ul>
<h2>Daily flow</h2>
<ul>
  <li>Offer waitlist slots when a cancellation frees capacity, then convert the entry into a booking.</li>
  <li>Check clients in as they arrive and close out visits when they end.</li>
  <li>Use the metric filters (today, week, month, year) before making staffing decisions.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-front-desk">Provider front desk metrics</a></li>
  <li><a href="/learn/article/calendar-scheduling-overview">Calendar &amp; scheduling</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'waitlist-waiting-room-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Turn on accepting on-demand requests in Settings → Online booking (web); incoming requests arrive as notifications in the provider app to accept or decline.',
  body = $body$<p>On-demand lets customers request a service without choosing a provider. When a request matches your services and area, you can accept or decline it.</p>
<h2>Turn it on</h2>
<p>On the web, open <strong>Settings → Online booking</strong> (<strong>/provider/settings/appointment-activity/online-booking</strong>) and enable accepting on-demand requests.</p>
<h2>Incoming requests</h2>
<div data-learn-mockup="provider-mobile-dashboard" data-caption="Dashboard — operational summary and alerts"></div>
<ul>
  <li>Requests arrive as notifications and open an incoming request screen in the provider app.</li>
  <li>Accept to create the booking on your calendar, or decline if you are unavailable.</li>
  <li>Respond quickly — the customer is waiting for an offer.</li>
  <li>Follow up with the customer in the <strong>Chats</strong> tab.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/on-demand-booking">How customers request on-demand</a></li>
  <li><a href="/learn/article/locations-service-areas-overview">Locations &amp; service areas</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'on-demand-requests-overview' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Connect calendar sync, email, Twilio SMS, and marketing integrations in provider Settings; maps power service zones and OneSignal delivers app push notifications.',
  body = $body$<p>Connect tools you already use so bookings, messages, and maps stay in sync.</p>
<h2>Where to find it (web)</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Integration settings"></div>
<ul>
  <li><strong>Calendar integration</strong> — <strong>/provider/settings/calendar-integration</strong> — sync bookings with an external calendar to avoid double-booking.</li>
  <li><strong>Email</strong> — <strong>/provider/settings/integrations/email</strong>.</li>
  <li><strong>Twilio (SMS)</strong> — <strong>/provider/settings/integrations/twilio</strong>.</li>
  <li><strong>Marketing integrations</strong> — <strong>/provider/settings/marketing-integrations</strong>.</li>
</ul>
<h2>Built in</h2>
<ul>
  <li>Maps power address search, service zones, and travel fees.</li>
  <li>Push notifications to the provider app are delivered by OneSignal — allow notifications on your phone.</li>
</ul>
<h2>Troubleshooting</h2>
<p>If an integration stops working, reconnect it and check its credentials, then contact support if the problem continues.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/marketing-automations-overview">Marketing &amp; automations</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'integrations-overview' AND tenant_id IS NULL;

-- Archived legacy Yoco articles: keep archived, replace stale navigation with pointers.
UPDATE public.learning_articles SET
  summary = 'Archived — see the Card machines articles and Provider Yoco setup.',
  body = $body$<p>This article has been replaced. For in-person card payments, see <a href="/learn/article/card-machines-faq">Card machine FAQ</a> and <a href="/learn/article/provider-web-yoco-payments">Provider Yoco setup and accounting</a>.</p>$body$,
  status = 'archived', content_format = 'html', updated_at = NOW()
WHERE slug IN ('yoco-terminal-overview', 'yoco-terminal-payment', 'yoco-setup', 'yoco-walk-in-payment')
  AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROVIDER — earnings and payout articles (700) with the walk-in rule corrected
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET
  summary = 'Online card, wallet, and gift card payments (including walk-ins paid via Paystack) increase your withdrawable balance; cash, Yoco, and card-machine payments show in revenue reports only.',
  body = $body$<p>Your withdrawable balance is money Beautonomi collected on your behalf. Payments you take directly stay with you and appear only in revenue reports.</p>
<h2>Earnings breakdown</h2>
<div data-learn-mockup="provider-web-finance" data-caption="Period earnings vs available to withdraw"></div>
<table>
  <thead><tr><th>Payment</th><th>In payout balance?</th></tr></thead>
  <tbody>
    <tr><td>Online booking or order paid by card</td><td>Yes, less refunds and any commission</td></tr>
    <tr><td>Paid with wallet credit or a gift card</td><td>Yes</td></tr>
    <tr><td>Walk-in paid with Paystack</td><td>Yes</td></tr>
    <tr><td>Paystack Terminal (where available)</td><td>Yes, once allocated to a sale</td></tr>
    <tr><td>Cash or other mark-as-paid</td><td>No — reports only</td></tr>
    <tr><td>Yoco or card machine</td><td>No — settles to your own bank account</td></tr>
  </tbody>
</table>
<h2>Period vs all-time</h2>
<p>Period earnings follow the filter you choose (today, week, month, year). <strong>Available to withdraw</strong> is the all-time settled balance not already queued — check it before you request a payout.</p>
<h2>What is held back</h2>
<ul>
  <li>Earnings still inside the payout hold period (set by the platform) — they release later.</li>
  <li>Payout requests that are pending or processing.</li>
  <li>The amount of any open payment dispute.</li>
</ul>
<p>The platform service fee is paid by the customer at checkout, not taken from your price. Commission applies only where Beautonomi has switched it on for your account.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/payouts-earnings-overview">Payouts &amp; earnings</a></li>
  <li><a href="/learn/article/request-payout">Request a payout</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'understanding-earnings' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Additional charges the customer pays online via Paystack increase your payout balance; charges marked as paid in person (cash, Yoco, card machine) do not.',
  body = $body$<p>When a customer pays an additional charge in person, you mark it paid. The money went straight to you, so it does not add to your Beautonomi payout balance — but it is still recorded on the booking and in reports.</p>
<h2>Online vs in person</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Finance — online vs walk-in reporting"></div>
<ul>
  <li><strong>Customer pays via Paystack</strong> from booking detail or a payment link → counts toward your payout balance.</li>
  <li><strong>Paystack Terminal</strong> (where available) → counts toward your payout balance once the payment is allocated to the sale.</li>
  <li><strong>Marked as paid in person</strong> (cash, Yoco, card machine) → recorded on the booking and in reports only.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/understanding-earnings">Understanding your earnings</a></li>
  <li><a href="/learn/article/payments-checkout-provider-overview">Payments &amp; checkout</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'walk-in-addons-payout' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Request a payout from More → Money or the Payouts quick action (app) or Finance (web), to a payout account added under Payment setup / Bank Accounts; minimums are shown when you request.',
  body = $body$<p>When your available balance is ready, request a payout to your payout account.</p>
<h2>Request payout</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Request payout and bank accounts"></div>
<ol>
  <li>Add a payout account: More → <strong>Payment setup</strong> → Payout bank accounts (app), or <strong>Bank Accounts</strong> in the web sidebar.</li>
  <li>Open More → <strong>Money</strong> or the <strong>Payouts</strong> quick action (app), or <strong>Finance</strong> (web).</li>
  <li>Enter an amount up to your available balance, choose the account, and submit.</li>
  <li>Track the request in the queue until it is paid.</li>
</ol>
<h2>Good to know</h2>
<ul>
  <li>A minimum payout amount may apply; the app tells you if your balance is below it.</li>
  <li>The More screen shows your next scheduled payout date when one is set.</li>
  <li>Only owners and team members with payout permission can request payouts.</li>
  <li>In some markets payouts go to a connected Stripe account instead of a bank account — the app guides you through the setup your market uses.</li>
  <li>A request can be blocked while a newly added payout account is in its security hold, while your account is under review, when your balance is negative, or when the account currency does not match the payout currency. The app or Finance shows the reason.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-web-payout-bank-accounts">Provider payout bank accounts</a></li>
  <li><a href="/learn/article/understanding-earnings">Understanding your earnings</a></li>
  <li><a href="/learn/article/provider-payout-accounts-cooling-off">Payout accounts and the new-account security hold</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'request-payout' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROVIDER — platform guides with stale navigation (545 / 698 / 699)
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET
  summary = 'The provider app has five tabs — Dashboard, Clients, Chats, Bookings, More; More holds money, billing, payment setup, catalogue, team, settings, and support.',
  body = $body$<p>The Beautonomi <strong>provider app</strong> is available for iPhone and Android. It is built for day-to-day work; the web portal remains the best place for bulk configuration and detailed reporting.</p>
<h2>Main navigation</h2>
<div data-learn-mockup="provider-mobile-dashboard" data-caption="Provider app — Dashboard, Clients, Chats, Bookings, and More"></div>
<ul>
  <li><strong>Dashboard</strong> — your day at a glance.</li>
  <li><strong>Clients</strong> — client list, history, and notes.</li>
  <li><strong>Chats</strong> — conversations with customers.</li>
  <li><strong>Bookings</strong> — schedule, day view, and appointment actions.</li>
  <li><strong>More</strong> — quick actions and every other area: Money, Billing, Payment setup, Catalogue &amp; offerings, Team &amp; scheduling, Reports, Engagement, settings, and support.</li>
</ul>
<h2>Payments</h2>
<p>In-person payment options live under More → <strong>Payment setup</strong>: payout bank accounts, gift cards, and — where enabled for your account — Yoco payments, Card machines, and Paystack Terminal.</p>
<h2>Support</h2>
<p>Use More → <strong>Help &amp; support</strong> and <strong>Support tickets</strong>. Long-form help opens Learning Center articles so guidance matches the web.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-mobile-more-navigation">Provider app More navigation</a></li>
  <li><a href="/learn/article/provider-web-portal">Provider web portal guide</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'provider-mobile-app' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'More has quick actions (Bookings, Express booking, Front Desk, Payouts, Subscription, Bank accounts and more) and sections: Grow your business, Operations, E-commerce, Business, Engagement, Settings.',
  body = $body$<p>The <strong>More</strong> tab is the provider app hub. Quick actions sit at the top and the full menu is grouped into sections. Items you lack permission for, or that are not enabled for your account, are hidden.</p>
<h2>Quick actions</h2>
<div data-learn-mockup="provider-mobile-more" data-caption="More — quick actions and sections"></div>
<p>Bookings, Express booking, Front Desk, Custom requests, Catalogue, Buy ads, Memberships, Subscription, Payouts, and Bank accounts — plus Card machines and Paystack Terminal where enabled.</p>
<h2>Sections</h2>
<ul>
  <li><strong>Grow your business</strong> — ads, memberships, and promo codes.</li>
  <li><strong>Operations</strong> — Bookings &amp; calendar, Time blocks, Group Bookings, Resources &amp; forms, Custom Requests.</li>
  <li><strong>E-commerce</strong> — Products &amp; e-commerce.</li>
  <li><strong>Business</strong> — Catalogue &amp; offerings, Team &amp; scheduling, Money, Billing, Team &amp; pay, Payment setup, Reports, Gallery.</li>
  <li><strong>Engagement</strong> — Engagement (reviews, messaging, marketing) and Explore posts.</li>
  <li><strong>Settings</strong> — Trust &amp; Safety, Login &amp; security, Identity verification, Language, Locations &amp; operating hours, Travel fees, Cancellation policies &amp; fees, Rewards &amp; badges, Support tickets, Settings &amp; account, Help &amp; support.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-mobile-app">Using the provider app</a></li>
  <li><a href="/learn/article/provider-mobile-finance-yoco-payouts">Provider app finance and payouts</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'provider-mobile-more-navigation' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  title = 'Provider app finance, payments, and payouts',
  summary = 'Use More → Money for earnings and payouts, More → Payment setup for payout accounts and in-person payment devices (Yoco, Card machines, Paystack Terminal where enabled).',
  body = $body$<p>Provider app finance uses the same terms as the web, so you can check earnings and request payouts away from your desk.</p>
<h2>Finance</h2>
<div data-learn-mockup="provider-mobile-finance" data-caption="Earnings, payout balance, and bank accounts"></div>
<ul>
  <li>Open More → <strong>Money</strong> for earnings, the ledger, sales, and payouts.</li>
  <li>Read the <strong>selected period total</strong> as earnings for that range.</li>
  <li>Read <strong>available to withdraw</strong> as the all-time settled balance you can pay out.</li>
</ul>
<h2>Payouts</h2>
<p>If you have no payout account, the app asks you to add one first under More → <strong>Payment setup</strong> → Payout bank accounts. A minimum payout may apply and is shown when you request.</p>
<h2>In-person payments</h2>
<p>More → <strong>Payment setup</strong> lists the payment options enabled for your account: <strong>Yoco payments</strong>, <strong>Card machines</strong>, and <strong>Paystack Terminal</strong>. Yoco and card-machine payments settle to your own bank account; Paystack Terminal payments settle through Beautonomi payouts.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/understanding-earnings">Understanding your earnings</a></li>
  <li><a href="/learn/article/request-payout">Request a payout</a></li>
  <li><a href="/learn/article/card-machines-faq">Card machine FAQ</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'provider-mobile-finance-yoco-payouts' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Where enabled for your account, connect Yoco from Yoco in the web sidebar (/provider/settings/sales/yoco-integration) or More → Payment setup → Yoco payments; Yoco payments settle to your own bank account.',
  body = $body$<p>Yoco lets you take in-person card payments on a Yoco reader. It is only shown when Yoco is enabled for your account.</p>
<h2>Setup</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Yoco integration and device setup"></div>
<ul>
  <li><strong>Web:</strong> <strong>Yoco</strong> in the sidebar (<strong>/provider/settings/sales/yoco-integration</strong>).</li>
  <li><strong>App:</strong> More → <strong>Payment setup</strong> → <strong>Yoco payments</strong>, or More → Settings &amp; account → Sales → <strong>Yoco integration</strong>.</li>
  <li>Connect the integration, add your devices, then run a small test payment from a booking or walk-in sale.</li>
</ul>
<h2>Accounting behaviour</h2>
<p>When the terminal payment confirms, the linked sale is marked paid and product stock is reduced. Duplicate payment notifications are ignored, so sales are not recorded twice. Yoco money settles to your own bank account, so it is not part of your Beautonomi payout balance.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/payments-checkout-provider-overview">Payments &amp; checkout</a></li>
  <li><a href="/learn/article/card-machines-faq">Card machine FAQ</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'provider-web-yoco-payments' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Your Beautonomi subscription is the business plan for using the platform, separate from memberships you sell. Manage it from Subscription in the web sidebar or the Subscription quick action on the app More tab.',
  body = $body$<p>The provider subscription is the business plan for using Beautonomi. It is separate from memberships you sell to customers.</p>
<h2>Subscription vs memberships</h2>
<ul>
  <li><strong>Subscription</strong> controls your business plan, feature access, and limits.</li>
  <li><strong>Memberships</strong> are customer-facing offers you sell.</li>
</ul>
<h2>Where to manage it</h2>
<div data-learn-mockup="provider-web-settings" data-caption="Subscription and plan"></div>
<ul>
  <li><strong>Web:</strong> <strong>Subscription</strong> in the sidebar (<strong>/provider/subscription</strong>), or Settings → Sales → <strong>Subscription &amp; plan</strong>. Invoices are under Settings → <strong>Billing details and invoices</strong>.</li>
  <li><strong>App:</strong> the <strong>Subscription</strong> quick action on the More tab, or More → Settings &amp; account → Account → <strong>Subscription &amp; plan</strong>. Invoices are under More → <strong>Billing</strong>.</li>
  <li>On iPhone, plans bought in the app are billed through the App Store.</li>
</ul>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-subscription-billing-ios">Subscription billing: App Store, Paystack and plan changes</a></li>
  <li><a href="/learn/article/pricing-subscriptions-overview">Pricing &amp; subscriptions</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'provider-web-subscription-plan' AND tenant_id IS NULL;

UPDATE public.learning_articles SET
  summary = 'Provider web sidebar: Main (Dashboard, Calendar, Bookings), Operations, Schedule, Resources & Forms, Orders, E-Commerce, Business (Finance, Bank Accounts, Subscription, Reports), and Team & Marketing.',
  body = $body$<p>The provider web portal (<strong>/provider</strong>) is the full control centre for your business. Use it for configuration-heavy work, reporting, finance, and detailed operations.</p>
<h2>Key sidebar areas</h2>
<div data-learn-mockup="provider-web-dashboard" data-caption="Provider web dashboard with KPIs and today's schedule"></div>
<ul>
  <li><strong>Main</strong> — Dashboard, Calendar, Bookings.</li>
  <li><strong>Operations</strong> — Waitlist, Recurring, Group Bookings, Front desk, Waiting Room, Clients.</li>
  <li><strong>Schedule</strong> — Schedule, Operating Hours, Shifts, Time Blocks, Days Off, Closed Periods.</li>
  <li><strong>Resources &amp; Forms</strong> — Resources and Forms.</li>
  <li><strong>Orders</strong> and <strong>E-Commerce</strong> — Orders, Returns, Products, Shipping &amp; Collection.</li>
  <li><strong>Business</strong> — Finance, Bank Accounts, Subscription, Analytics, Reports, Rewards &amp; Badges, Catalogue, Packages, Memberships. Sales, Card machines, Yoco, and Paystack Terminal appear when enabled for your account.</li>
  <li><strong>Team &amp; Marketing</strong> — Explore Content, Team, Team members, Payroll, My Earnings, Reviews, Messages, Marketing, Paid Ads, Booking links.</li>
</ul>
<p>At the bottom: Help &amp; support, My tickets, and <strong>Settings</strong>. Items you do not have permission for are hidden.</p>
<h2>Use web for advanced setup</h2>
<p>Use the web portal for bulk edits, printed or emailed receipts and invoices, accurate location pins, subscription management, and larger reports.</p>
<h2>Related articles</h2>
<ul>
  <li><a href="/learn/article/provider-mobile-app">Using the provider app</a></li>
  <li><a href="/learn/article/provider-web-settings-security">Provider web settings and security</a></li>
</ul>$body$,
  content_format = 'html', updated_at = NOW()
WHERE slug = 'provider-web-portal' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER — 700 bodies that still described card refunds
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.learning_articles SET
  body = replace(body,
    '<li><strong>Failed payment:</strong> retry with another method or update your card in Profile.</li>',
    '<li><strong>Failed payment:</strong> retry with another method or update your card in Profile.</li>
  <li><strong>Refunds:</strong> cancellation refunds of online payments are credited to your Beautonomi wallet.</li>'),
  updated_at = NOW()
WHERE slug = 'when-you-pay-booking' AND tenant_id IS NULL
  AND body NOT LIKE '%credited to your Beautonomi wallet%';
