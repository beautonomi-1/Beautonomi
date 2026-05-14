-- 597_cms_page_content_global_defaults_and_za_clone.sql
-- 1) Insert missing global (tenant_id NULL) page_content rows for CMS presets so:
--    - Admin Content → Pages lists match live fallbacks / ISR pages that use getPublicPageContent.
--    - Public routes that merge tenant + global still resolve when only global exists.
-- 2) Duplicate terms-and-condition → terms-of-service for operators who use that slug in Admin.
-- 3) Clone every global row into the South Africa (slug za) tenant where a tenant row is missing,
--    so ZA operators edit tenant-scoped rows instead of mutating platform defaults by ID.

-- ---------------------------------------------------------------------------
-- Global defaults (only when no existing global row for page_slug + section_key)
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
    -- become-a-partner (matches apps/web become-a-partner component fallbacks)
    ('become-a-partner', 'hero_title', 'text', 'Everything you need to grow your beauty business', 0),
    ('become-a-partner', 'hero_description', 'text', 'Manage bookings, accept payments, automate your workflow, and more. A complete platform built for beauty professionals—fast, beautiful, intuitive, and works on any device.', 1),
    ('become-a-partner', 'video_tour_url', 'text', '', 2),
    ('become-a-partner', 'rating_text', 'text', '#1 highest-rated by thousands of beauty & wellness professionals', 3),
    ('become-a-partner', 'why_different_title', 'text', 'Beauty business software, finally done right', 4),
    ('become-a-partner', 'why_different_description', 'text', 'Let''s be real, most beauty business software isn''t very good. Ugly design, slow speeds, interfaces that get in the way. We''re taking a new approach and bringing modern tools to beauty professionals.', 5),
    ('become-a-partner', 'features_title', 'text', 'Everything you need in one platform', 6),
    ('become-a-partner', 'features_description', 'text', 'Powerful features designed to help you grow your beauty business', 7),
    ('become-a-partner', 'features_list', 'json', '[]', 8),
    ('become-a-partner', 'cta_title', 'text', 'Ready to grow your beauty business?', 9),
    ('become-a-partner', 'cta_description', 'text', 'Join thousands of beauty professionals who trust Beautonomi to manage their business', 10),
    ('become-a-partner', 'top_banner_enabled', 'text', 'false', 11),
    ('become-a-partner', 'top_banner_content', 'text', 'Introducing Beautonomi Connect: Phone calls, text messages, and web chats.', 12),
    ('become-a-partner', 'top_banner_link', 'text', '/resources', 13),
    ('become-a-partner', 'demo_booking_type', 'text', '', 14),
    ('become-a-partner', 'demo_booking_embed', 'text', '', 15),
    ('become-a-partner', 'hero_primary_cta_label', 'text', 'Sign up', 16),
    ('become-a-partner', 'hero_feature_tabs', 'json', '["CALENDAR","ONLINE BOOKING","CUSTOM SERVICES","CALLS & TEXTS","HOUSE CALLS"]', 17),
    ('become-a-partner', 'top_banner_learn_more', 'text', 'Learn more', 18),
    -- gift-card (matches gifts-hero / banner / picking-design fallbacks)
    ('gift-card', 'hero_title', 'text', 'Beautonomi gift cards', 0),
    ('gift-card', 'hero_subtitle', 'text', 'You give. They glow.', 1),
    ('gift-card', 'hero_description', 'text', 'Bring the world of Beautonomi to friends and family. Celebrate holidays, recognize important moments, and treat them to beauty and wellness services. Perfect for any occasion, since they never expire.', 2),
    ('gift-card', 'buy_now_button_text', 'text', 'Buy now', 3),
    ('gift-card', 'purchase_url', 'text', '/gift-card/purchase', 4),
    ('gift-card', 'business_text', 'text', 'Purchasing for business?', 5),
    ('gift-card', 'bulk_link_text', 'text', 'Buy gift cards in bulk', 6),
    ('gift-card', 'bulk_purchase_url', 'text', '/gift-card/purchase?bulk=true', 7),
    ('gift-card', 'banner_title', 'text', 'Gift cards for business', 8),
    ('gift-card', 'banner_description', 'text', 'Show your appreciation for employees and customers with beauty and wellness gift cards that are easy to give for any occasion.', 9),
    ('gift-card', 'banner_contact_text', 'text', 'For bulk orders, contact sales.', 10),
    ('gift-card', 'sales_email', 'text', 'sales@beautonomi.com', 11),
    ('gift-card', 'card_background_image', 'text', '', 12),
    ('gift-card', 'card_overlay_image', 'text', '', 13),
    ('gift-card', 'placeholder_brand_name', 'text', 'Beautonomi', 14),
    ('gift-card', 'placeholder_card_text', 'text', 'Gift Card', 15),
    ('gift-card', 'features_list', 'json', '[]', 16),
    ('gift-card', 'designs_list', 'json', '[]', 17),
    ('gift-card', 'picking_designs_title', 'text', 'Pick your design', 18),
    ('gift-card', 'designs_empty_state_title', 'text', 'Gift Card Designs', 19),
    ('gift-card', 'designs_empty_state_message', 'text', 'Gift card designs will be available here. Check back soon!', 20),
    -- why-beautonomi (hero / benefits / CTA banner fallbacks; empty JSON lists keep component defaults)
    ('why-beautonomi', 'hero_title', 'text', 'Why Beautonomi?', 0),
    ('why-beautonomi', 'hero_subtitle', 'text', 'The platform built for beauty professionals', 1),
    ('why-beautonomi', 'hero_description', 'text', 'Discover what makes Beautonomi the leading platform for beauty and wellness services. Built with care, designed for growth.', 2),
    ('why-beautonomi', 'cta_button_text', 'text', 'Get Started', 3),
    ('why-beautonomi', 'cta_url', 'text', '/signup?type=provider', 4),
    ('why-beautonomi', 'hero_image', 'text', '', 5),
    ('why-beautonomi', 'features_section_title', 'text', 'Everything you need to succeed', 6),
    ('why-beautonomi', 'features_list', 'json', '[]', 7),
    ('why-beautonomi', 'benefits_title', 'text', 'Why choose Beautonomi?', 8),
    ('why-beautonomi', 'benefits_description', 'text', 'Join thousands of beauty professionals who trust Beautonomi to power their business.', 9),
    ('why-beautonomi', 'benefits_list', 'json', '[]', 10),
    ('why-beautonomi', 'benefits_cta_text', 'text', 'Start Your Journey', 11),
    ('why-beautonomi', 'benefits_cta_url', 'text', '/signup?type=provider', 12),
    ('why-beautonomi', 'benefits_image', 'text', '', 13),
    ('why-beautonomi', 'cta_banner_title', 'text', 'Ready to grow your beauty business?', 14),
    ('why-beautonomi', 'cta_banner_description', 'text', 'Join Beautonomi today and discover why thousands of beauty professionals choose us.', 15),
    ('why-beautonomi', 'cta_banner_button_text', 'text', 'Get Started', 16),
    ('why-beautonomi', 'cta_banner_url', 'text', '/signup?type=provider', 17),
    ('why-beautonomi', 'cta_banner_image', 'text', '', 18),
    -- resources (SSR copy when CMS is empty)
    ('resources', 'hero_title', 'text', 'Beautonomi Connect & more', 0),
    ('resources', 'hero_description', 'html',
     '<p>Beautonomi Connect brings phone calls, text messages, and web chats to your business—so you can stay in touch with clients the way they prefer.</p><p>Learn more about partnering with us and the tools we offer.</p>',
     1),
    -- help centre
    ('help', 'hero_title', 'text', 'Hi, how can we help?', 0),
    ('help', 'search_placeholder', 'text', 'Search how-tos and more', 1),
    ('help', 'search_suggestions', 'json', '[]', 2),
    -- beautonomi-friendly
    (
      'beautonomi-friendly',
      'hero_title',
      'text',
      'Introducing' || chr(10) || 'Beautonomi-friendly' || chr(10) || 'apartments',
      0
    ),
    ('beautonomi-friendly', 'hero_subtitle', 'text', 'Rent a place to live. Beautonomi it part-time.', 1),
    ('beautonomi-friendly', 'cta_label', 'text', 'Explore near you', 2),
    ('beautonomi-friendly', 'cta_href', 'text', '/explore', 3),
    -- release notes placeholder (public page may be added later)
    ('release', 'hero_title', 'text', 'Release notes', 0),
    ('release', 'hero_description', 'text', 'See what is new in the Beautonomi apps and platform.', 1),
    ('release', 'body_html', 'html',
     '<p>Update this page in Admin → Content → Pages (slug <code>release</code>). Link to store listings or paste changelog HTML here.</p>',
     2),
    -- career carousel (preset exists; prior seed omitted it)
    ('career', 'carousel_slides', 'json', '[]', 9)
) AS v(page_slug, section_key, content_type, content, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.page_content pc
  WHERE pc.tenant_id IS NULL
    AND pc.page_slug = v.page_slug
    AND pc.section_key = v.section_key
);

-- ---------------------------------------------------------------------------
-- terms-of-service: mirror global terms-and-condition rows (CMS convenience slug)
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
  'terms-of-service',
  pc.section_key,
  pc.content_type,
  pc.content,
  COALESCE(pc.metadata, '{}'::jsonb),
  pc.display_order,
  pc.is_active,
  NULL
FROM public.page_content pc
WHERE pc.page_slug = 'terms-and-condition'
  AND pc.tenant_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.page_content x
    WHERE x.page_slug = 'terms-of-service'
      AND x.section_key = pc.section_key
      AND x.tenant_id IS NULL
  );

-- ---------------------------------------------------------------------------
-- Clone all global rows into ZA tenant (tenant_id = tenant_default_za_id())
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
  AND public.tenant_default_za_id() IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.page_content z
    WHERE z.tenant_id = public.tenant_default_za_id()
      AND z.page_slug = g.page_slug
      AND z.section_key = g.section_key
  );
