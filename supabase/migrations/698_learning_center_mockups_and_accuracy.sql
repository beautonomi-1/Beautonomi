-- 698_learning_center_mockups_and_accuracy.sql
-- Inject learning mockup markers into flagship guides and correct mobile navigation copy.
-- Idempotent: guarded by marker presence and text markers.

-- ── Accuracy: customer app bottom tabs (Cart + Profile, not Wishlists) ────────
UPDATE public.learning_articles
SET
  body = replace(
    body,
    '<li><strong>Wishlists</strong> stores saved providers, services, or products where available.</li>',
    '<li><strong>Cart</strong> holds products or packages you are ready to purchase.</li>
  <li><strong>Profile</strong> opens your account hub for settings, payments, addresses, saved items, and support.</li>'
  ),
  updated_at = NOW()
WHERE slug = 'customer-mobile-app'
  AND tenant_id IS NULL
  AND body LIKE '%<strong>Wishlists</strong>%';

-- Older 483 seed wording
UPDATE public.learning_articles
SET
  body = replace(
    body,
    '<li><strong>Wishlists</strong> — saved items (bottom bar on mobile; your full account hub is under the profile icon at the top).</li>',
    '<li><strong>Cart</strong> — products and packages ready to checkout.</li>
  <li><strong>Profile</strong> — account settings, payments, addresses, saved items, and support.</li>'
  ),
  updated_at = NOW()
WHERE slug = 'customer-mobile-app'
  AND tenant_id IS NULL
  AND body LIKE '%<strong>Wishlists</strong>%';

-- ── Accuracy: provider app navigation (Dashboard, Clients, Chats, Bookings, More) ──
UPDATE public.learning_articles
SET
  body = regexp_replace(
    body,
    '<h2>Main areas</h2>\s*<ul>[\s\S]*?</ul>',
    '<h2>Main navigation</h2>
<ul>
  <li><strong>Dashboard</strong> — operational summary and quick stats for the day.</li>
  <li><strong>Clients</strong> — CRM-style client lists and booking history.</li>
  <li><strong>Chats</strong> — conversations with customers.</li>
  <li><strong>Bookings</strong> — calendar, day view, and appointment management.</li>
  <li><strong>More</strong> — finance, Yoco, subscription, payout bank accounts, memberships, packages, settings, and support.</li>
</ul>',
    'g'
  ),
  updated_at = NOW()
WHERE slug = 'provider-mobile-app'
  AND tenant_id IS NULL
  AND body LIKE '%<h2>Main areas</h2>%';

UPDATE public.learning_articles
SET
  body = regexp_replace(
    body,
    '<h2>Where to find things</h2>\s*<ul>[\s\S]*?</ul>',
    '<h2>Main navigation</h2>
<ul>
  <li><strong>Dashboard</strong> — operational summary for the day.</li>
  <li><strong>Clients</strong> — client lists and context.</li>
  <li><strong>Chats</strong> — messaging with customers.</li>
  <li><strong>Bookings</strong> — schedule and appointment actions.</li>
  <li><strong>More</strong> — finance, Yoco, settings, and support.</li>
</ul>',
    'g'
  ),
  updated_at = NOW()
WHERE slug = 'provider-mobile-app'
  AND tenant_id IS NULL
  AND body LIKE '%<h2>Where to find things</h2>%';

-- ── Mockup markers (insert once per slug + mockup id) ─────────────────────────

UPDATE public.learning_articles
SET body = replace(body, '<h2>Main navigation</h2>', '<h2>Main navigation</h2>
<div data-learn-mockup="customer-mobile-home" data-caption="Customer app — Home, Search, Bookings, Cart, Chats, and Profile"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-mobile-app'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-mobile-home"%'
  AND body LIKE '%<h2>Main navigation</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Main navigation</h2>', '<h2>Main navigation</h2>
<div data-learn-mockup="provider-mobile-dashboard" data-caption="Provider app — Dashboard, Clients, Chats, Bookings, and More"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-app'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-dashboard"%'
  AND body LIKE '%<h2>Main navigation</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Booking checklist</h2>', '<h2>Booking checklist</h2>
<div data-learn-mockup="customer-mobile-bookings" data-caption="Open Bookings to reschedule, pay, or review appointments"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-mobile-booking-payments'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-mobile-bookings"%'
  AND body LIKE '%<h2>Booking checklist</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Prominent items</h2>', '<h2>Prominent items</h2>
<div data-learn-mockup="provider-mobile-services" data-caption="Services, finance, and setup shortcuts live under More"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-more-navigation'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-services"%'
  AND body LIKE '%<h2>Prominent items</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Key sidebar areas</h2>', '<h2>Key sidebar areas</h2>
<div data-learn-mockup="provider-web-dashboard" data-caption="Provider web dashboard with KPIs and today''s schedule"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-portal'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-web-dashboard"%'
  AND body LIKE '%<h2>Key sidebar areas</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Bookings</h2>', '<h2>Bookings</h2>
<div data-learn-mockup="provider-mobile-calendar" data-caption="Day view with appointments and quick actions"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-web-calendar-bookings'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-calendar"%'
  AND body LIKE '%<h2>Bookings</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Book from the web</h2>', '<h2>Book from the web</h2>
<div data-learn-mockup="customer-web-booking" data-caption="Choose a service and continue to secure checkout"></div>'),
    updated_at = NOW()
WHERE slug = 'customer-web-booking'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="customer-web-booking"%'
  AND body LIKE '%<h2>Book from the web</h2>%';

UPDATE public.learning_articles
SET body = replace(body, '<h2>Client and message flow</h2>', '<h2>Client and message flow</h2>
<div data-learn-mockup="provider-mobile-messages" data-caption="Messages inbox with unread badges"></div>'),
    updated_at = NOW()
WHERE slug = 'provider-mobile-clients-messaging-support'
  AND tenant_id IS NULL
  AND body NOT LIKE '%data-learn-mockup="provider-mobile-messages"%'
  AND body LIKE '%<h2>Client and message flow</h2>%';

-- Surface platform updates on the learning homepage when the overview article exists
DO $$
DECLARE
  update_id UUID;
BEGIN
  SELECT a.id INTO update_id
  FROM public.learning_articles a
  WHERE a.slug = 'platform-updates-overview'
    AND a.tenant_id IS NULL
    AND a.status = 'published'
  LIMIT 1;

  IF update_id IS NOT NULL THEN
    INSERT INTO public.learning_homepage_sections (section_key, payload, display_order)
    VALUES (
      'platform_updates',
      jsonb_build_object(
        'title', 'Platform updates',
        'article_ids', jsonb_build_array(update_id)
      ),
      5
    )
    ON CONFLICT (section_key) WHERE tenant_id IS NULL DO UPDATE
    SET
      payload = jsonb_build_object(
        'title', COALESCE(EXCLUDED.payload->>'title', 'Platform updates'),
        'article_ids', (
          SELECT jsonb_agg(DISTINCT elem)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(learning_homepage_sections.payload->'article_ids', '[]'::jsonb)) AS elem
            UNION
            SELECT update_id::text
          ) s
        )
      ),
      display_order = EXCLUDED.display_order,
      updated_at = NOW();
  END IF;
END $$;
