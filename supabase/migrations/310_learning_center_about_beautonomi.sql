-- 310_learning_center_about_beautonomi.sql
-- Add "About Beautonomi" topic (child of Getting Started) and one full overview article
-- plus three sub-articles, Mangomint-style. Idempotent.

-- Category: About Beautonomi (child of Getting Started)
INSERT INTO public.learning_categories (title, slug, icon, sort_order, audience, visibility, parent_id)
SELECT 'About Beautonomi', 'about-beautonomi', NULL, 0, 'general', 'public', gs.id
FROM public.learning_categories gs
WHERE gs.slug = 'getting-started'
  AND NOT EXISTS (SELECT 1 FROM public.learning_categories c WHERE c.slug = 'about-beautonomi')
LIMIT 1;

-- Overview article (full body: intro, "In this section" links, support CTA)
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'About Beautonomi',
  'about-beautonomi',
  'The articles in this section introduce the Beautonomi platform and cover different areas, including compliance and safety, booth renter models, and more.',
  '<p>The articles in this section provide an introduction to the Beautonomi platform and cover different features, including compliance and safety, booth renter models, and more.</p>

<h2>In this section:</h2>
<ul>
  <li><a href="/learn/article/introduction-to-beautonomi">Introduction to Beautonomi</a></li>
  <li><a href="/learn/article/compliance-and-safety">Compliance and Safety</a></li>
  <li><a href="/learn/article/using-beautonomi-booth-renter-hybrid">Using Beautonomi with a Booth Renter or Hybrid Model</a></li>
</ul>

<div style="margin-top: 2rem; padding: 1.25rem 1.5rem; border-radius: 12px; background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); border: 1px solid #fbcfe8;">
  <p style="margin: 0 0 0.5rem 0; font-weight: 600; color: #1f2937;">Can''t find what you''re looking for?</p>
  <p style="margin: 0; font-size: 0.875rem; color: #4b5563;">Start a chat with us to talk to a real person and get your questions answered, or browse our on-demand videos.</p>
</div>',
  'html',
  'published',
  'general',
  false,
  NOW()
FROM public.learning_categories c
WHERE c.slug = 'about-beautonomi'
  AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'about-beautonomi')
LIMIT 1;

-- Sub-article: Introduction to Beautonomi
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Introduction to Beautonomi',
  'introduction-to-beautonomi',
  'A short overview of the platform and what you can do.',
  '<p>Beautonomi is a platform that connects customers with beauty and wellness providers. Whether you run a salon, work from a studio, or offer at-home services, Beautonomi helps you manage bookings, payments, and client relationships in one place.</p>
<p>Customers can discover providers, book services online, pay securely, and manage their appointments. Providers get a full toolkit: calendar and scheduling, payments and payouts, client notes, locations and service areas, and optional features like staff, inventory, and online booking links.</p>
<p>This section introduces the platform and points you to more detailed guides for compliance, safety, and different business models such as booth renter or hybrid setups.</p>',
  'html',
  'published',
  'general',
  false,
  NOW()
FROM public.learning_categories c
WHERE c.slug = 'about-beautonomi'
  AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'introduction-to-beautonomi')
LIMIT 1;

-- Sub-article: Compliance and Safety
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Compliance and Safety',
  'compliance-and-safety',
  'How Beautonomi supports compliance and safety for providers and customers.',
  '<p>Beautonomi is designed to support safe, compliant operations for both providers and customers. Providers are verified during onboarding, and the platform helps you keep client data and payments secure.</p>
<p>We provide clear policies on cancellations, refunds, disputes, and safety. Both customers and providers can report issues and get support. For at-home services, we use travel buffers and safety guidelines so everyone knows what to expect.</p>
<p>If you have questions about compliance in your region or how we handle data and payments, check our Policies section or contact support.</p>',
  'html',
  'published',
  'general',
  false,
  NOW()
FROM public.learning_categories c
WHERE c.slug = 'about-beautonomi'
  AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'compliance-and-safety')
LIMIT 1;

-- Sub-article: Using Beautonomi with a Booth Renter or Hybrid Model
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id,
  'Using Beautonomi with a Booth Renter or Hybrid Model',
  'using-beautonomi-booth-renter-hybrid',
  'How to use the platform as a booth renter or in a hybrid salon setup.',
  '<p>Many salons and studios work with booth renters or use a hybrid model where some practitioners are employees and others rent space. Beautonomi supports these setups so you can run one business while giving each practitioner the right level of control.</p>
<p>As a booth renter, you can manage your own calendar, services, and clients while the venue handles the space and possibly front-desk or shared resources. The platform lets you set your own availability, pricing, and payouts so your earnings flow to you correctly.</p>
<p>If you own the space, you can use locations, staff, and permissions to separate renters from employees and still keep a single place for clients to book. For more detail, see the sections on Locations & Service Areas and Staff & Permissions.</p>',
  'html',
  'published',
  'general',
  false,
  NOW()
FROM public.learning_categories c
WHERE c.slug = 'about-beautonomi'
  AND NOT EXISTS (SELECT 1 FROM public.learning_articles a WHERE a.slug = 'using-beautonomi-booth-renter-hybrid')
LIMIT 1;

-- Stats for new articles (one row per article in this category that doesn't have stats yet)
INSERT INTO public.learning_article_stats (article_id, view_count, helpful_yes_count, helpful_no_count)
SELECT a.id, 0, 0, 0
FROM public.learning_articles a
JOIN public.learning_categories c ON c.id = a.category_id AND c.slug = 'about-beautonomi'
WHERE NOT EXISTS (SELECT 1 FROM public.learning_article_stats s WHERE s.article_id = a.id);
