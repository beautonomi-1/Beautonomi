-- 975_public_content_payment_gateway_seed.sql
-- Factual public copy for payment-gateway / trust review: About, Terms, Privacy contact,
-- Help, partner marketing CMS, gift cards, footer links, and store URLs.
-- Does not unpublish marketplace listings.

-- ─── Shared copy ─────────────────────────────────────────────────────────────
-- South Africa contracting clause (trading name Beautonomi; Pty Ltd only in SA line).
DO $seed$
DECLARE
  sa_clause_html text := $clause$
<p>Beautonomi is the trading name. In South Africa, the company is Beautonomi (Pty) Ltd, Headquarters, Pinelands, Cape Town, 7405, South Africa. If a local company is named for your country, that company is the one you contract with there. Where no local company is named, you contract with Beautonomi.</p>
$clause$;

  bookings_html text := $bookings$
<p>Each provider sets the free-cancellation window, the late-refund percentage, and any no-show fee. Those terms are shown before payment and apply to standard, group, recurring, custom-offer, and guest bookings.</p>
<p>If the provider has no saved policy, the platform default is: <strong>free cancellation with a full wallet refund</strong> if you cancel within <strong>15 minutes</strong> of booking or <strong>more than 24 hours before</strong> the appointment start; <strong>late cancellation</strong> inside that window follows the provider&apos;s shown rules (platform default: <strong>no refund</strong> to the wallet). A saved provider policy replaces that default.</p>
<p>Eligible booking refunds are <strong>store credit in the Beautonomi wallet</strong>, capped at amounts already paid, and are not automatically returned to the original payment card. If the <strong>provider</strong> cancels, amounts already paid are refunded in full to the customer wallet. A configured no-show fee is retained up to the amount paid; any remainder goes to the wallet.</p>
$bookings$;

  refunds_html text := $refunds$
<p>Contact the provider first, or email <a href="mailto:support@beautonomi.com">support@beautonomi.com</a>. Chargebacks follow card-network rules. Product and hardware returns follow the terms shown at purchase. In-person card-machine refunds are done on the device and then recorded on the Platform. Gift cards are not redeemable for cash except where the law requires it.</p>
$refunds$;

  contact_terms_html text;

  r record;
  arr jsonb;
  elem jsonb;
  new_arr jsonb;
  i int;
  privacy_old text;
  privacy_new text;
BEGIN
  contact_terms_html := sa_clause_html
    || '<p>Questions: <a href="/help">Help &amp; support</a> or <a href="mailto:support@beautonomi.com">support@beautonomi.com</a>. Intellectual property complaints: use Help with details of the material. Data rights: <a href="/privacy-policy">Privacy Policy</a>.</p>';

  -- ─── about_us_content (all tenants + global) ───────────────────────────────
  UPDATE public.about_us_content
  SET
    title = 'Our Mission',
    content = $mission$
<p>Beautonomi is an online marketplace. Customers discover, book, and pay for beauty and wellness services from independent salons, spas, and professionals. Beautonomi provides the booking and payment platform. The appointment is provided by the professional you book.</p>
$mission$,
    is_active = true,
    updated_at = now()
  WHERE section_key = 'mission';

  UPDATE public.about_us_content
  SET
    title = 'What We Do',
    content = $what$
<p>Customers browse services such as hair, nails, braids, makeup, massage, barbering, brows and lashes, and skin treatments, choose a time, and pay on the Platform. Each provider sets the price, and that price is shown before you confirm.</p>
$what$,
    is_active = true,
    updated_at = now()
  WHERE section_key = 'what_we_do';

  UPDATE public.about_us_content
  SET
    title = 'For Beauty Professionals',
    content = $pros$
<p>Professionals use Beautonomi to list services, take bookings, and accept payments. Subscription fees and other charges are the amounts shown when a provider signs up, changes plan, or completes checkout.</p>
$pros$,
    is_active = true,
    updated_at = now()
  WHERE section_key = 'for_professionals';

  UPDATE public.about_us_content
  SET
    title = 'Safety & Trust',
    content = $trust$
<p>Providers may be asked to verify their identity or business before payouts or other higher-risk actions. Profiles can show customer reviews. Beautonomi does not store full card numbers; online payments are processed by payment partners. Cancellation terms for a booking are shown before you pay.</p>
$trust$,
    is_active = true,
    updated_at = now()
  WHERE section_key = 'safety_trust';

  UPDATE public.about_us_content
  SET
    title = 'Contact Us',
    content = sa_clause_html
      || '<p>Email <a href="mailto:support@beautonomi.com">support@beautonomi.com</a>, or use the <a href="/help">Help Centre</a>. A telephone number is not listed on this page yet.</p>',
    is_active = true,
    updated_at = now()
  WHERE section_key = 'contact_intro';

  UPDATE public.about_us_content
  SET content = 'support@beautonomi.com', title = 'Email', is_active = true, updated_at = now()
  WHERE section_key = 'contact_email';

  UPDATE public.about_us_content
  SET is_active = false, updated_at = now()
  WHERE section_key = 'contact_phone';

  UPDATE public.about_us_content
  SET title = 'Help Centre', content = '/help', is_active = true, updated_at = now()
  WHERE section_key = 'contact_help_center';

  -- ─── Terms: patch sections JSON by title ─────────────────────────────────
  FOR r IN
    SELECT id, content
    FROM public.page_content
    WHERE page_slug = 'terms-and-condition'
      AND section_key = 'sections'
      AND is_active = true
  LOOP
    BEGIN
      arr := r.content::jsonb;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF jsonb_typeof(arr) <> 'array' THEN
      CONTINUE;
    END IF;
    new_arr := '[]'::jsonb;
    FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
      elem := arr -> i;
      IF elem ->> 'title' = 'Bookings, cancellations & no-shows' THEN
        elem := jsonb_set(elem, '{content}', to_jsonb(bookings_html));
      ELSIF elem ->> 'title' = 'Refunds and payment disputes' THEN
        elem := jsonb_set(elem, '{content}', to_jsonb(refunds_html));
      ELSIF elem ->> 'title' = 'Contact' THEN
        elem := jsonb_set(elem, '{content}', to_jsonb(contact_terms_html));
      END IF;
      new_arr := new_arr || jsonb_build_array(elem);
    END LOOP;
    UPDATE public.page_content
    SET content = new_arr::text, updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- ─── Privacy: contact paragraph inside hero_description HTML ───────────────
  privacy_old := '<p>For privacy requests or questions, contact us at <a href="mailto:support@beautonomi.com">support@beautonomi.com</a> or through <a href="/help">Help &amp; support</a>. We will respond within timelines required by applicable law.</p>';
  privacy_new := sa_clause_html
    || '<p>For privacy requests or questions, contact us at <a href="mailto:support@beautonomi.com">support@beautonomi.com</a> or through <a href="/help">Help &amp; support</a>. We will respond within timelines required by applicable law.</p>';

  UPDATE public.page_content
  SET content = replace(content, privacy_old, privacy_new), updated_at = now()
  WHERE page_slug = 'privacy-policy'
    AND section_key = 'hero_description'
    AND content LIKE '%' || privacy_old || '%';

END $seed$;

-- Help centre guest CTA (plain text)
UPDATE public.page_content
SET
  content = 'Beautonomi. South Africa: Beautonomi (Pty) Ltd, Headquarters, Pinelands, Cape Town, 7405. Email support@beautonomi.com. You can also log in to submit or view a support ticket.',
  content_type = 'text',
  is_active = true,
  updated_at = now()
WHERE page_slug = 'help' AND section_key = 'cta_body_guest';

INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
SELECT
  'help',
  'cta_body_guest',
  'text',
  'Beautonomi. South Africa: Beautonomi (Pty) Ltd, Headquarters, Pinelands, Cape Town, 7405. Email support@beautonomi.com. You can also log in to submit or view a support ticket.',
  '{}'::jsonb,
  10,
  true,
  NULL::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.page_content pc
  WHERE pc.page_slug = 'help' AND pc.section_key = 'cta_body_guest' AND pc.tenant_id IS NULL
);

UPDATE public.page_content
SET content = 'Beautonomi is a marketplace and a tool for beauty and wellness businesses. Customers book independent providers. Providers manage bookings and payments.', updated_at = now()
WHERE page_slug = 'why-beautonomi' AND section_key = 'hero_description';

UPDATE public.page_content
SET content = 'Bookings and payments for beauty professionals', updated_at = now()
WHERE page_slug = 'why-beautonomi' AND section_key = 'hero_trust_text';

INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
SELECT 'why-beautonomi', 'hero_trust_text', 'text', 'Bookings and payments for beauty professionals', '{}'::jsonb, 19, true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.page_content pc
  WHERE pc.page_slug = 'why-beautonomi' AND pc.section_key = 'hero_trust_text' AND pc.tenant_id IS NULL
);

UPDATE public.page_content
SET
  content_type = 'json',
  content = $proof$
[
  {"value":"Marketplace","label":"Book independent beauty & wellness providers"},
  {"value":"Checkout","label":"Prices & cancellation terms shown before you pay"},
  {"value":"Wallet","label":"Eligible booking refunds as Beautonomi wallet credit"},
  {"value":"Web + app","label":"Customers & providers on web and mobile apps"}
]
$proof$,
  updated_at = now()
WHERE page_slug = 'why-beautonomi' AND section_key = 'proof_stats';

INSERT INTO public.page_content (page_slug, section_key, content_type, content, metadata, display_order, is_active, tenant_id)
SELECT
  'why-beautonomi',
  'proof_stats',
  'json',
  $proof_ins$
[
  {"value":"Marketplace","label":"Book independent beauty & wellness providers"},
  {"value":"Checkout","label":"Prices & cancellation terms shown before you pay"},
  {"value":"Wallet","label":"Eligible booking refunds as Beautonomi wallet credit"},
  {"value":"Web + app","label":"Customers & providers on web and mobile apps"}
]
$proof_ins$,
  '{}'::jsonb,
  20,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.page_content pc
  WHERE pc.page_slug = 'why-beautonomi' AND pc.section_key = 'proof_stats' AND pc.tenant_id IS NULL
);

UPDATE public.page_content
SET content = 'Providers list services, manage bookings, and accept payments on Beautonomi.', updated_at = now()
WHERE page_slug = 'why-beautonomi' AND section_key = 'benefits_description';

UPDATE public.page_content
SET content = 'Create a provider account to list your services and take bookings.', updated_at = now()
WHERE page_slug = 'why-beautonomi' AND section_key = 'cta_banner_description';

UPDATE public.page_content
SET content = 'List your services, take bookings, and get paid online', updated_at = now()
WHERE page_slug = 'become-a-partner' AND section_key = 'rating_text';

UPDATE public.page_content
SET content = 'Create a provider account to list services, manage bookings, and accept payments.', updated_at = now()
WHERE page_slug = 'become-a-partner' AND section_key = 'cta_description';

UPDATE public.page_content
SET content = $gift$
Bring the world of Beautonomi to friends and family. Celebrate holidays, recognize important moments, and treat them to beauty and wellness services. Perfect for any occasion — see gift card terms at purchase.
$gift$,
  updated_at = now()
WHERE page_slug = 'gift-card' AND section_key = 'hero_description';

-- ─── Footer navigation ───────────────────────────────────────────────────────
UPDATE public.footer_links
SET is_active = false, updated_at = now()
WHERE is_active = true
  AND (
    href = '/news'
    OR lower(trim(trailing '/' from href)) IN (
      'https://facebook.com',
      'https://www.facebook.com',
      'https://twitter.com',
      'https://www.twitter.com',
      'https://x.com',
      'https://www.x.com',
      'https://linkedin.com',
      'https://www.linkedin.com',
      'https://instagram.com',
      'https://www.instagram.com'
    )
  );

UPDATE public.footer_app_links
SET href = 'https://play.google.com/store/apps/details?id=com.beautonomi', updated_at = now()
WHERE platform = 'android' AND (href IS NULL OR trim(href) = '' OR href = '#');

UPDATE public.footer_app_links
SET href = 'https://apps.apple.com/app/id6748387058', updated_at = now()
WHERE platform = 'ios' AND (href IS NULL OR trim(href) = '' OR href = '#');

-- ─── Native store URLs (force-update / admin defaults) ───────────────────────
UPDATE public.app_version_settings
SET update_url = 'https://apps.apple.com/app/id6748387058', updated_at = now()
WHERE app = 'customer' AND platform = 'ios';

UPDATE public.app_version_settings
SET update_url = 'https://apps.apple.com/app/id6748387936', updated_at = now()
WHERE app = 'provider' AND platform = 'ios';

UPDATE public.app_version_settings
SET update_url = 'https://play.google.com/store/apps/details?id=com.beautonomi', updated_at = now()
WHERE app = 'customer' AND platform = 'android';

UPDATE public.app_version_settings
SET update_url = 'https://play.google.com/store/apps/details?id=com.beautonomi.partner', updated_at = now()
WHERE app = 'provider' AND platform = 'android';
