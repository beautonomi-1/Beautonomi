-- 483_learning_center_mobile_guides.sql
-- Full mobile-app coverage: dedicated customer + provider guides, stats, images, featured list.
-- Idempotent: INSERT ... WHERE NOT EXISTS on slug; UPDATEs are safe to re-run.

-- Customer: iOS & Android app guide (category: Getting Started)
INSERT INTO public.learning_articles (
  category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at, image_url
)
SELECT c.id,
  'Using the customer app (iOS & Android)',
  'customer-mobile-app',
  'How the Beautonomi customer app works: tabs, Help & Learning Center, payments in the browser, and notifications.',
  '<p>The Beautonomi <strong>customer app</strong> is available for <strong>iPhone</strong> and <strong>Android</strong>. Install it from the App Store or Google Play. You can use the <strong>same email or phone login</strong> as on the website—your bookings, wallet, and messages stay in sync.</p>

<h2>Main navigation</h2>
<ul>
  <li><strong>Home</strong> — discover providers and featured content.</li>
  <li><strong>Search</strong> — find services and providers.</li>
  <li><strong>Bookings</strong> — upcoming and past appointments; open a booking to reschedule, cancel, pay, or verify arrival.</li>
  <li><strong>Chats</strong> — messages with providers.</li>
  <li><strong>Wishlists</strong> — saved items (bottom bar on mobile; your full account hub is under the profile icon at the top).</li>
</ul>
<p>Use the <strong>profile / account</strong> entry at the top of the screen to reach account settings, payments, addresses, and more—similar to Account on the web.</p>

<h2>Help Centre &amp; Learning Center in the app</h2>
<p>The in-app <strong>Help</strong> screen loads the Help Centre website in a web view. There you can search articles, open <strong>Learning Center</strong> guides, browse topics, and use the same help content as on beautonomi.com. Quick actions at the top may open <strong>My tickets</strong>, <strong>Submit ticket</strong>, <strong>Privacy</strong>, or <strong>Terms</strong> in an in-app browser.</p>
<p>If something does not load, check your network and that the app’s <strong>backend URL</strong> is configured correctly in your build.</p>

<h2>Paying for bookings</h2>
<p>Checkout and Paystack often open in an <strong>in-app browser</strong> or secure web session. Complete payment there, then return to the app—your booking updates when payment succeeds. Saved cards and wallet behaviour match what you see on the web.</p>

<h2>Push notifications</h2>
<p>To get booking reminders and message alerts, allow notifications for Beautonomi in your phone’s <strong>Settings</strong> (iOS: Settings → Beautonomi → Notifications; Android: Settings → Apps → Beautonomi → Notifications).</p>

<h2>Tips</h2>
<ul>
  <li>Keep the app updated for the latest fixes and features.</li>
  <li>Use the same account on web and mobile to avoid confusion.</li>
  <li>For issues not covered here, submit a ticket from Help or see <a href="/learn/article/troubleshooting-faq-overview">Troubleshooting &amp; FAQ</a>.</li>
</ul>',
  'html',
  'published',
  'customer',
  false,
  NOW(),
  '/images/learn/feature-browser-placeholder.svg'
FROM public.learning_categories c
WHERE c.slug = 'getting-started'
  AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'customer-mobile-app');

-- Provider: iOS & Android app guide
INSERT INTO public.learning_articles (
  category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at, image_url
)
SELECT c.id,
  'Using the provider app (iOS & Android)',
  'provider-mobile-app',
  'How the Beautonomi provider app fits with the web portal: calendar, bookings, payouts, Yoco, and support.',
  '<p>The Beautonomi <strong>provider app</strong> is available for <strong>iPhone</strong> and <strong>Android</strong>. Use the same provider account as on the web dashboard. Core day-to-day work—calendar, bookings, clients, messages, and many settings—runs natively in the app.</p>

<h2>Where to find things</h2>
<ul>
  <li><strong>Calendar / Bookings</strong> — schedule, create or edit appointments, and manage the day.</li>
  <li><strong>More</strong> — settings, team, services, finance, payouts, Yoco devices, marketing, and <strong>Help &amp; support</strong> (contact support and tickets are native screens; you can still open web help articles when linked).</li>
  <li><strong>Clients &amp; messaging</strong> — CRM-style lists and conversations with customers.</li>
</ul>
<p>Some advanced configuration (e.g. certain subscription, deep reporting, or embed options) may open the <strong>web portal</strong> in a browser—follow in-app prompts when offered.</p>

<h2>Payments, Yoco, and payouts</h2>
<p>Online customer payments and <strong>Paystack</strong> flows align with the web. If you use a <strong>Yoco</strong> terminal, pair and operate it from the flows described in <a href="/learn/article/yoco-setup">Set up Yoco terminal</a>. Request <strong>payouts</strong> and review earnings in the app under Finance / payouts, consistent with <a href="/learn/article/payouts-earnings-overview">Payouts &amp; Earnings</a>.</p>

<h2>Notifications</h2>
<p>Enable push notifications in your device settings so you see new bookings, messages, and on-demand requests promptly (see also <a href="/learn/article/notifications-messaging-overview">Notifications &amp; Messaging</a>).</p>

<h2>Learning Center on mobile</h2>
<p>Long-form guides and the full <strong>Learning Center</strong> (/learn) are shared with the website. Open them from marketing links, email, or a browser; bookmark <strong>/learn</strong> on your phone if you want quick access beside the native Help flows.</p>

<h2>Support</h2>
<p>Use <strong>Contact support</strong> and <strong>My tickets</strong> in the app for account or technical issues. For policy questions, also see <a href="/learn/article/policies-overview">Policies</a> and <a href="/learn/article/provider-onboarding-overview">Provider onboarding</a>.</p>',
  'html',
  'published',
  'provider',
  false,
  NOW(),
  '/images/learn/feature-browser-placeholder.svg'
FROM public.learning_categories c
WHERE c.slug = 'provider-onboarding'
  AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'provider-mobile-app');

-- Stats rows for new articles
INSERT INTO public.learning_article_stats (article_id, view_count, helpful_yes_count, helpful_no_count)
SELECT a.id, 0, 0, 0
FROM public.learning_articles a
WHERE a.slug IN ('customer-mobile-app', 'provider-mobile-app')
  AND NOT EXISTS (SELECT 1 FROM public.learning_article_stats s WHERE s.article_id = a.id);

-- Tie mobile guides into Getting Started overview (append once: check marker)
UPDATE public.learning_articles
SET body = body || '<p id="mobile-apps"><strong>Mobile apps (iOS &amp; Android):</strong> Install the customer or provider app from the App Store or Google Play. Your account works on web and mobile. Detailed guides: <a href="/learn/article/customer-mobile-app">Using the customer app</a> · <a href="/learn/article/provider-mobile-app">Using the provider app</a>.</p>'
WHERE slug = 'getting-started-overview'
  AND body NOT LIKE '%id="mobile-apps"%';

-- Introduction article: one cross-link
UPDATE public.learning_articles
SET body = body || '<p>You can use Beautonomi in the <strong>mobile apps</strong> or in a web browser; see <a href="/learn/article/customer-mobile-app">customer app</a> and <a href="/learn/article/provider-mobile-app">provider app</a> guides for navigation and Help.</p>'
WHERE slug = 'introduction-to-beautonomi'
  AND body NOT LIKE '%customer-mobile-app%';

-- Featured homepage: insert mobile customer guide after getting-started-overview (idempotent order)
DO $$
DECLARE
  ids UUID[];
  slug_list TEXT[] := ARRAY[
    'getting-started-overview',
    'customer-mobile-app',
    'canceling-your-booking',
    'when-you-pay-booking',
    'request-payout',
    'verification-steps',
    'managing-bookings-overview'
  ];
BEGIN
  SELECT array_agg(a.id ORDER BY array_position(slug_list, a.slug))
  INTO ids
  FROM public.learning_articles a
  WHERE a.slug = ANY(slug_list)
    AND a.status = 'published'
    AND a.is_internal = false;

  IF ids IS NOT NULL AND array_length(ids, 1) > 0 THEN
    UPDATE public.learning_homepage_sections
    SET payload = jsonb_build_object('article_ids', to_jsonb(ids))
    WHERE section_key = 'featured_articles';
  END IF;
END $$;
