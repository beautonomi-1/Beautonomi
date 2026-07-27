-- 829_age_suitability_page_content.sql
-- Seeds global CMS content for the public /age-suitability policy page and footer link.
-- Follows the temp-table + UPDATE-then-INSERT-WHERE-NOT-EXISTS pattern from 780_legal_pages_content_refresh.sql.

DO $seed$
DECLARE
  has_tenant_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'page_content'
      AND column_name = 'tenant_id'
  )
  INTO has_tenant_id;

  DROP TABLE IF EXISTS _age_suitability_page_content;
  CREATE TEMP TABLE _age_suitability_page_content (
    page_slug text NOT NULL,
    section_key text NOT NULL,
    content_type text NOT NULL,
    content text NOT NULL,
    display_order int NOT NULL
  );

  INSERT INTO _age_suitability_page_content (page_slug, section_key, content_type, content, display_order)
  VALUES
  (
    'age-suitability',
    'intro',
    'html',
    $intro$
<p><strong>Last updated: July 2026.</strong> This page describes how Beautonomi (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) addresses age suitability, content types, and safety controls across our websites and mobile applications (the Beautonomi customer app and the Beautonomi Partner provider app). It should be read alongside our <a href="/privacy-policy">Privacy Policy</a> and <a href="/terms-and-condition">Terms of Service</a>.</p>
<p><strong>Summary.</strong> Beautonomi is a marketplace for beauty and wellness services. The customer app includes social discovery features (Explore), reviews, messaging, and sponsored placement. Users must be at least <strong>13 years old</strong> to use social features; providers must meet higher age and identity requirements for payouts and business verification.</p>
$intro$,
    1
  ),
  (
    'age-suitability',
    'sections',
    'json',
    $sections$
[
  {"title":"Minimum age","content":"<p><strong>Customer app:</strong> You must be at least <strong>13</strong> to create an account and use social or user-generated content features. Users under 13 are not permitted on the Platform.</p><p><strong>Provider app:</strong> Providers must be at least <strong>18</strong> and able to enter a binding contract. Business verification (KYB) and identity verification may be required before payouts or card-machine acceptance.</p><p>Date of birth is collected during onboarding. Where required, identity verification confirms legal age using government ID and facial matching.</p>"},
  {"title":"Age assurance","content":"<p>We confirm age using a layered approach with strict precedence:</p><ul><li><strong>Verified identity (KYC)</strong> — government ID and facial match where verification is required.</li><li><strong>Declared date of birth</strong> — collected at signup and stored on your account.</li><li><strong>Device age signals (when available)</strong> — optional lower-bound signals from Apple or Google APIs, never overriding verified KYC.</li></ul><p>Server-side checks enforce minimum age for social capabilities. Enforcement can run in audit-only mode during rollout before full blocking is enabled.</p>"},
  {"title":"Content types","content":"<p>Beautonomi includes:</p><ul><li><strong>Marketplace listings</strong> — services, products, and provider profiles.</li><li><strong>User-generated content</strong> — reviews, Explore posts, comments, profile photos, and in-app messages.</li><li><strong>Social discovery</strong> — Explore feed, collections, likes, and saves.</li><li><strong>Wellness and beauty information</strong> — provider-authored descriptions of treatments, skincare, and self-care. This is <strong>not medical advice</strong>; see Medical and wellness below.</li><li><strong>Sponsored placement</strong> — labelled promoted results in search and discovery.</li></ul>"},
  {"title":"User-generated content and moderation","content":"<p>Users can create reviews, Explore posts, comments, and messages subject to our Terms and community standards. We provide reporting tools for posts, comments, messages, and reviews. Reports are reviewed by our trust and safety team. We may remove content, restrict accounts, or escalate to law enforcement where required.</p><p>Users in restricted safety modes may have limited ability to create or interact with UGC even when they meet the minimum age.</p>"},
  {"title":"Messaging safety","content":"<p>In-app messaging connects customers and providers around bookings and support. Messaging can be disabled through Content &amp; Safety Controls or enforced by default for users aged 13–17. We do not operate open public chat rooms; conversations are tied to marketplace activity.</p><p>Report harassment or unsafe behaviour via in-app reporting or <a href=\"/help\">Help &amp; support</a>.</p>"},
  {"title":"Advertising disclosure","content":"<p>Providers may purchase <strong>sponsored placement</strong> on the Platform. Sponsored results are clearly labelled. We do not sell personal information to third-party advertising networks. Marketing attribution (such as campaign parameters) is subject to your cookie and privacy choices.</p>"},
  {"title":"Medical and wellness topics","content":"<p>Beauty and wellness services may reference treatments, skin conditions, or lifestyle topics. Provider descriptions are for booking purposes and <strong>do not constitute medical diagnosis or treatment advice</strong>. Consult a qualified professional for medical decisions.</p><p>In App Store age-rating terms, medical or treatment information appears <strong>infrequently</strong> (specialised clinic or medical-aesthetic listings), while general health and wellness topics (self-care, beauty routines) are more common across the marketplace.</p>"},
  {"title":"Content &amp; Safety Controls (parental / guardian tools)","content":"<p>The customer app includes <strong>Content &amp; Safety Controls</strong> under Account Settings. Guardians or account holders can:</p><ul><li>Enable <strong>Restricted mode</strong> to limit social posting and interaction.</li><li>Hide the social Explore feed.</li><li>Turn off comments, likes, and saves.</li><li>Turn off direct messaging.</li><li>Enable a sensitive content filter.</li><li>Require device authentication (Face ID, Touch ID, or device passcode) before changing these settings.</li></ul><p>For users aged 13–17, some controls are applied by default and cannot be turned off without meeting age requirements. Changing safety settings requires authentication on the device to support guardian oversight.</p>"},
  {"title":"Web access in the apps","content":"<p>Our mobile apps do <strong>not</strong> provide unrestricted web browsing. In-app browsers and WebViews are limited to approved first-party pages (such as legal policies and help), payment checkout, identity verification, and maps. Unknown URLs open in the system browser outside the app.</p>"},
  {"title":"Reporting and contact","content":"<p>To report content or behaviour: use in-app report actions on Explore posts, comments, or conversations, or contact us via <a href=\"/help\">Help &amp; support</a>.</p><p>For privacy or safety questions: <a href=\"mailto:support@beautonomi.com\">support@beautonomi.com</a>.</p><p>See also: <a href=\"/privacy-policy\">Privacy Policy</a>, <a href=\"/cookie-policy\">Cookie Policy</a>, <a href=\"/data-deletion\">Account &amp; Data Deletion</a>.</p>"}
]
$sections$,
    2
  );

  IF has_tenant_id THEN
    UPDATE public.page_content pc
    SET
      content_type = s.content_type,
      content = s.content,
      display_order = s.display_order,
      is_active = true,
      updated_at = now()
    FROM _age_suitability_page_content s
    WHERE pc.page_slug = s.page_slug
      AND pc.section_key = s.section_key
      AND pc.tenant_id IS NULL;

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
      s.page_slug,
      s.section_key,
      s.content_type,
      s.content,
      '{}'::jsonb,
      s.display_order,
      true,
      NULL::uuid
    FROM _age_suitability_page_content s
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.page_content pc
      WHERE pc.page_slug = s.page_slug
        AND pc.section_key = s.section_key
        AND pc.tenant_id IS NULL
    );
  ELSE
    UPDATE public.page_content pc
    SET
      content_type = s.content_type,
      content = s.content,
      display_order = s.display_order,
      is_active = true,
      updated_at = now()
    FROM _age_suitability_page_content s
    WHERE pc.page_slug = s.page_slug
      AND pc.section_key = s.section_key;

    INSERT INTO public.page_content (
      page_slug,
      section_key,
      content_type,
      content,
      metadata,
      display_order,
      is_active
    )
    SELECT
      s.page_slug,
      s.section_key,
      s.content_type,
      s.content,
      '{}'::jsonb,
      s.display_order,
      true
    FROM _age_suitability_page_content s
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.page_content pc
      WHERE pc.page_slug = s.page_slug
        AND pc.section_key = s.section_key
    );
  END IF;

  DROP TABLE IF EXISTS _age_suitability_page_content;
END $seed$;

DO $footer$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'footer_links'
      AND column_name = 'tenant_id'
  ) THEN
    INSERT INTO public.footer_links (section, title, href, display_order, is_external, is_active, tenant_id)
    SELECT 'legal', 'Age Suitability', '/age-suitability', 5, false, true, NULL::uuid
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.footer_links fl
      WHERE fl.section = 'legal'
        AND fl.href = '/age-suitability'
        AND fl.tenant_id IS NULL
    );
  ELSE
    INSERT INTO public.footer_links (section, title, href, display_order, is_external, is_active)
    SELECT 'legal', 'Age Suitability', '/age-suitability', 5, false, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.footer_links fl WHERE fl.section = 'legal' AND fl.href = '/age-suitability'
    );
  END IF;
END $footer$;
