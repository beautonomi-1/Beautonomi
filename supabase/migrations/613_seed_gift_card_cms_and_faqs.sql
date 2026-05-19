-- 613_seed_gift_card_cms_and_faqs.sql
-- Idempotent seed for:
--   1) `gift-card` page_content global defaults (re-seed any rows that 597
--      missed because the upsert is keyed off the (page_slug, section_key)
--      uniqueness; explicit list keeps live copy aligned with the components
--      under apps/web/src/app/gift-card/components).
--   2) "Your questions, answered" FAQ rows that the live /gift-card page shows
--      via apps/web/src/components/global/faq.tsx — without this seed the page
--      reads no rows from `faqs` and the component silently falls back to
--      hard-coded copy. Seeding global rows lets superadmins curate, dedupe,
--      and override per-tenant from the admin SPA Content -> FAQs page.
--   3) ZA-tenant clones of any FAQ / page_content rows missing for the
--      South Africa tenant so beauty operators editing /admin see tenant-scoped
--      rows instead of mutating platform defaults.
--
-- Safe to re-run: every INSERT is gated on a NOT EXISTS / ON CONFLICT guard.

-- ---------------------------------------------------------------------------
-- 1) gift-card page_content defaults (global, tenant_id NULL)
--    Mirrors the visible copy on https://www.beautonomi.co.za/gift-card and
--    the fallbacks in gifts-hero, picking-design, feature-cards, banner.
-- ---------------------------------------------------------------------------
INSERT INTO public.page_content (
  page_slug,
  section_key,
  content_type,
  content,
  metadata,
  display_order,
  is_active,
  tenant_id
)
SELECT
  v.page_slug,
  v.section_key,
  v.content_type,
  v.content,
  '{}'::jsonb,
  v.display_order,
  true,
  NULL
FROM (
  VALUES
    ('gift-card', 'hero_title', 'text', 'Beautonomi gift cards', 0),
    ('gift-card', 'hero_subtitle', 'text', 'You give. They glow.', 1),
    ('gift-card', 'hero_description', 'text',
      'Bring the world of Beautonomi to friends and family. Celebrate holidays, recognize important moments, and treat them to beauty and wellness services. Perfect for any occasion, since they never expire.',
      2),
    ('gift-card', 'buy_now_button_text', 'text', 'Buy now', 3),
    ('gift-card', 'purchase_url', 'text', '/gift-card/purchase', 4),
    ('gift-card', 'business_text', 'text', 'Purchasing for business?', 5),
    ('gift-card', 'bulk_link_text', 'text', 'Buy gift cards in bulk', 6),
    ('gift-card', 'bulk_purchase_url', 'text', '/gift-card/purchase?bulk=true', 7),
    ('gift-card', 'banner_title', 'text', 'Gift cards for business', 8),
    ('gift-card', 'banner_description', 'text',
      'Show your appreciation for employees and customers with beauty and wellness gift cards that are easy to give for any occasion.',
      9),
    ('gift-card', 'banner_contact_text', 'text', 'For bulk orders, contact sales.', 10),
    ('gift-card', 'sales_email', 'text', 'sales@beautonomi.co.za', 11),
    ('gift-card', 'card_background_image', 'text', '', 12),
    ('gift-card', 'card_overlay_image', 'text', '', 13),
    ('gift-card', 'placeholder_brand_name', 'text', 'Beautonomi', 14),
    ('gift-card', 'placeholder_card_text', 'text', 'Gift Card', 15),
    ('gift-card', 'features_list', 'json',
      '[{"icon":"\u2728","title":"Beautiful designs","description":"Gift cards are customizable with your choice of design, message, and gift amount"},{"icon":"\u2709\ufe0f","title":"Easy to send","description":"Arrives within minutes via text or email and we''ll confirm that it''s been received"},{"icon":"\u23f3","title":"Never expires","description":"Gift credit is available to use whenever they''re ready to book beauty and wellness services"}]',
      16),
    ('gift-card', 'designs_list', 'json', '[]', 17),
    ('gift-card', 'picking_designs_title', 'text', 'Pick your design', 18),
    ('gift-card', 'designs_empty_state_title', 'text', 'Gift Card Designs', 19),
    ('gift-card', 'designs_empty_state_message', 'text',
      'Gift card designs will be available here. Check back soon!', 20)
) AS v(page_slug, section_key, content_type, content, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.page_content pc
  WHERE pc.tenant_id IS NULL
    AND pc.page_slug = v.page_slug
    AND pc.section_key = v.section_key
);

-- ---------------------------------------------------------------------------
-- 2) Global FAQs: "Your questions, answered" on /gift-card
--    Category `gift-card` so admins can filter, and the FAQ component reads
--    /api/public/faqs (no category) by default. We pick a category that is
--    visible on every product page that uses the unscoped FAQ block.
--
--    A second `category = 'general'` mirror is also inserted so existing
--    pages that pass no `category` keep working with the same copy, while
--    gift-card-specific filtering remains available.
--
--    Dedupe by (category, question) so re-runs are no-ops and superadmins'
--    edited copies stay intact.
-- ---------------------------------------------------------------------------
INSERT INTO public.faqs (
  category,
  question,
  answer,
  display_order,
  is_active,
  tenant_id
)
SELECT
  v.category,
  v.question,
  v.answer,
  v.display_order,
  true,
  NULL
FROM (
  VALUES
    ('general',
     'How do I signup as a beauty partner on Beautonomi?',
     '1. Go to the official Beautonomi website. 2. Navigate to the Partner Signup Page: look for the "Join as a Beauty Professional" link. 3. Fill out the registration form: provide your name, contact information, and expertise. 4. Submit any required certifications or licenses. 5. Wait for approval — the Beautonomi team reviews your application and notifies you once approved. After approval, you can start offering your services through the platform.',
     0),
    ('general',
     'How Does the booking work for services on Beautonomi?',
     '1. Browse services: choose the service you want from available beauty professionals. 2. Select a date and time: pick a convenient time slot. 3. Confirm your booking: review the details and confirm your appointment. 4. Receive confirmation: you''ll get a notification with booking details and reminders. On the appointment day, simply enjoy your service.',
     1),
    ('general',
     'What measures are in place for safety and reliability of beauty professionals and customers?',
     'All beauty professionals are thoroughly vetted. Compliance with health and safety standards is required. Customers can leave reviews and ratings. Payment transactions are processed securely. Dedicated customer support is available for any issues.',
     2),
    ('general',
     'How and when do I receive payments for the services I provide?',
     'Payments are processed on a regular schedule (typically weekly). Funds are transferred to your designated bank account or payout method. You''ll receive a notification when payments are processed. Platform fees and commissions are shown clearly where they apply.',
     3),
    ('general',
     'Can I get a custom offer on Beautonomi?',
     'Yes. You can request custom offers through the platform — contact our support team or use the messaging feature to discuss custom pricing and packages with service providers.',
     4),
    ('gift-card',
     'How do I signup as a beauty partner on Beautonomi?',
     '1. Go to the official Beautonomi website. 2. Navigate to the Partner Signup Page: look for the "Join as a Beauty Professional" link. 3. Fill out the registration form: provide your name, contact information, and expertise. 4. Submit any required certifications or licenses. 5. Wait for approval — the Beautonomi team reviews your application and notifies you once approved. After approval, you can start offering your services through the platform.',
     0),
    ('gift-card',
     'How Does the booking work for services on Beautonomi?',
     '1. Browse services: choose the service you want from available beauty professionals. 2. Select a date and time: pick a convenient time slot. 3. Confirm your booking: review the details and confirm your appointment. 4. Receive confirmation: you''ll get a notification with booking details and reminders. On the appointment day, simply enjoy your service.',
     1),
    ('gift-card',
     'What measures are in place for safety and reliability of beauty professionals and customers?',
     'All beauty professionals are thoroughly vetted. Compliance with health and safety standards is required. Customers can leave reviews and ratings. Payment transactions are processed securely. Dedicated customer support is available for any issues.',
     2),
    ('gift-card',
     'How and when do I receive payments for the services I provide?',
     'Payments are processed on a regular schedule (typically weekly). Funds are transferred to your designated bank account or payout method. You''ll receive a notification when payments are processed. Platform fees and commissions are shown clearly where they apply.',
     3),
    ('gift-card',
     'Can I get a custom offer on Beautonomi?',
     'Yes. You can request custom offers through the platform — contact our support team or use the messaging feature to discuss custom pricing and packages with service providers.',
     4)
) AS v(category, question, answer, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.faqs f
  WHERE f.tenant_id IS NULL
    AND f.category = v.category
    AND f.question = v.question
);

-- ---------------------------------------------------------------------------
-- 3) Clone any missing global rows into the ZA tenant so ZA operators edit
--    tenant-scoped rows from /admin/content/faqs and /admin/content/pages
--    without mutating the platform default.
-- ---------------------------------------------------------------------------
INSERT INTO public.page_content (
  page_slug,
  section_key,
  content_type,
  content,
  metadata,
  display_order,
  is_active,
  tenant_id
)
SELECT
  g.page_slug,
  g.section_key,
  g.content_type,
  g.content,
  COALESCE(g.metadata, '{}'::jsonb),
  g.display_order,
  g.is_active,
  public.tenant_default_za_id()
FROM public.page_content g
WHERE g.tenant_id IS NULL
  AND g.page_slug = 'gift-card'
  AND public.tenant_default_za_id() IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.page_content z
    WHERE z.tenant_id = public.tenant_default_za_id()
      AND z.page_slug = g.page_slug
      AND z.section_key = g.section_key
  );

INSERT INTO public.faqs (
  category,
  question,
  answer,
  display_order,
  is_active,
  tenant_id
)
SELECT
  g.category,
  g.question,
  g.answer,
  g.display_order,
  g.is_active,
  public.tenant_default_za_id()
FROM public.faqs g
WHERE g.tenant_id IS NULL
  AND public.tenant_default_za_id() IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.faqs z
    WHERE z.tenant_id = public.tenant_default_za_id()
      AND z.category IS NOT DISTINCT FROM g.category
      AND z.question = g.question
  );
